'use strict';
/*
 * Gestor de servidores de prueba (solo administradores): crea la carpeta, descarga el servidor del tipo elegido,
 * lo arranca/detiene con consola, edita server.properties, instala plugins/mods/datapacks desde Modrinth y exporta un zip.
 * Todo lo que toca la red recibe `fetchImpl` para poder probarse sin internet.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const loaders = require('./loaders');
const { walk, writeZip } = require('./zipwrite');

const TYPES = {
  vanilla: { label: 'Vanilla', content: 'datapacks' },
  paper: { label: 'Paper', content: 'plugins' },
  purpur: { label: 'Purpur', content: 'plugins' },
  spigot: { label: 'Spigot', content: 'plugins' },
  fabric: { label: 'Fabric', content: 'mods' },
  forge: { label: 'Forge', content: 'mods' },
  neoforge: { label: 'NeoForge', content: 'mods' }
};

function cmpMc(a, b) {
  const x = loaders.parseMc(a) || [], y = loaders.parseMc(b) || [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

const UA = { 'User-Agent': 'NovaPX-Event-Launcher (servidores de prueba)' };
const SAFE_NAME = /^[0-9A-Za-z][0-9A-Za-z _.-]{0,40}$/;

function isSafeName(n) { return typeof n === 'string' && SAFE_NAME.test(n.trim()) && !/\.\./.test(n); }
function slug(name) { return String(name).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function safeFile(n) { return typeof n === 'string' && /^[\w][\w .+()\[\]-]{0,150}\.(jar|zip)$/i.test(n) && !/\.\./.test(n); }

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: UA });
  if (!res.ok) throw new Error(`El servidor de descargas respondió ${res.status} (${new URL(url).host}).`);
  return res.json();
}

async function downloadFile(url, dest, fetchImpl, onProgress) {
  const res = await fetchImpl(url, { headers: UA });
  if (!res.ok) throw new Error(`No se pudo descargar (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  let done = 0;
  try {
    for await (const chunk of res.body) {
      done += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (total && onProgress) onProgress(Math.round((done / total) * 100));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  fs.renameSync(tmp, dest);
}

/* ---------- versiones disponibles por tipo ---------- */

async function listVersions(type, fetchImpl = fetch) {
  if (!TYPES[type]) throw new Error('Tipo de servidor desconocido.');
  if (type === 'vanilla' || type === 'spigot') {
    const m = await getJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', fetchImpl);
    const rel = m.versions.filter((v) => v.type === 'release').map((v) => v.id);
    // BuildTools de Spigot solo cubre versiones modernas; por debajo de 1.8 no hay nada que compilar.
    return type === 'spigot' ? rel.filter((v) => { const p = loaders.parseMc(v); return p && (p[0] > 1 || p[1] >= 8); }) : rel;
  }
  if (type === 'paper') return (await getJson('https://api.papermc.io/v2/projects/paper', fetchImpl)).versions.slice().reverse();
  if (type === 'purpur') return (await getJson('https://api.purpurmc.org/v2/purpur', fetchImpl)).versions.slice().reverse();
  if (type === 'fabric') return (await getJson('https://meta.fabricmc.net/v2/versions/game', fetchImpl)).filter((v) => v.stable).map((v) => v.version);
  if (type === 'forge') {
    const promos = (await getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', fetchImpl)).promos || {};
    const set = new Set(Object.keys(promos).map((k) => k.replace(/-(latest|recommended)$/, '')));
    return [...set].filter((v) => loaders.parseMc(v)).sort(cmpMc).reverse();
  }
  if (type === 'neoforge') {
    const mc = (await getJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', fetchImpl)).versions
      .filter((v) => v.type === 'release').map((v) => v.id);
    return mc.filter((v) => loaders.neoforgeMcPrefix(v));
  }
  return [];
}

/* ---------- descarga del servidor ---------- */

// Devuelve { url, name, build } del archivo base del servidor (el jar, o el instalador/BuildTools).
async function resolveServerJar(type, mc, fetchImpl = fetch) {
  if (!loaders.isSafeVersion(mc)) throw new Error('Versión de Minecraft no válida.');
  if (type === 'vanilla') {
    const m = await getJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', fetchImpl);
    const v = m.versions.find((x) => x.id === mc);
    if (!v) throw new Error(`Minecraft ${mc} no existe.`);
    const meta = await getJson(v.url, fetchImpl);
    if (!meta.downloads || !meta.downloads.server) throw new Error(`Minecraft ${mc} no tiene servidor oficial.`);
    return { url: meta.downloads.server.url, name: 'server.jar' };
  }
  if (type === 'paper') {
    const j = await getJson(`https://api.papermc.io/v2/projects/paper/versions/${mc}/builds`, fetchImpl);
    const stable = (j.builds || []).filter((b) => b.channel === 'default');
    const b = (stable.length ? stable : j.builds || []).slice(-1)[0];
    if (!b) throw new Error(`Paper no tiene compilación para ${mc}.`);
    const file = b.downloads.application.name;
    return { url: `https://api.papermc.io/v2/projects/paper/versions/${mc}/builds/${b.build}/downloads/${file}`, name: 'server.jar', build: b.build };
  }
  if (type === 'purpur') {
    const j = await getJson(`https://api.purpurmc.org/v2/purpur/${mc}`, fetchImpl);
    const build = j.builds && j.builds.latest;
    if (!build) throw new Error(`Purpur no tiene compilación para ${mc}.`);
    return { url: `https://api.purpurmc.org/v2/purpur/${mc}/${build}/download`, name: 'server.jar', build };
  }
  if (type === 'spigot') {
    return { url: 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar', name: 'BuildTools.jar' };
  }
  if (type === 'fabric') {
    const loadersList = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${mc}`, fetchImpl);
    const installers = await getJson('https://meta.fabricmc.net/v2/versions/installer', fetchImpl);
    const l = (loadersList.find((x) => x.loader && x.loader.stable) || loadersList[0] || {}).loader;
    const i = installers.find((x) => x.stable) || installers[0];
    if (!l || !i) throw new Error(`Fabric no soporta ${mc}.`);
    return { url: `https://meta.fabricmc.net/v2/versions/loader/${mc}/${l.version}/${i.version}/server/jar`, name: 'server.jar', build: l.version };
  }
  if (type === 'forge') {
    const promos = await getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', fetchImpl);
    const v = loaders.pickForgeVersion(promos, mc);
    if (!v) throw new Error(`Forge no tiene versión para ${mc}.`);
    const file = `forge-${mc}-${v}-installer.jar`;
    return { url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${v}/${file}`, name: file, build: v, installer: true };
  }
  if (type === 'neoforge') {
    const res = await fetchImpl('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', { headers: UA });
    if (!res.ok) throw new Error('No pude consultar las versiones de NeoForge.');
    const versions = [...(await res.text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
    const v = loaders.pickNeoForgeVersion(versions, mc);
    if (!v) throw new Error(`NeoForge no tiene versión para ${mc}.`);
    return { url: loaders.neoforgeUrl(v), name: loaders.neoforgeFileName(v), build: v, installer: true };
  }
  throw new Error('Tipo de servidor desconocido.');
}

/* ---------- carpeta y metadatos ---------- */

function metaPath(dir) { return path.join(dir, 'nova-server.json'); }
function readMeta(dir) { try { return JSON.parse(fs.readFileSync(metaPath(dir), 'utf8')); } catch { return null; } }
function writeMeta(dir, meta) { fs.writeFileSync(metaPath(dir), JSON.stringify(meta, null, 2)); }

function listServers(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ id: e.name, dir: path.join(root, e.name), meta: readMeta(path.join(root, e.name)) }))
    .filter((s) => s.meta)
    .map((s) => ({ id: s.id, ...s.meta }));
}

function serverDir(root, id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,40}$/.test(id) || id.includes('..')) throw new Error('Servidor no válido.');
  const dir = path.join(root, id);
  if (!fs.existsSync(metaPath(dir))) throw new Error('Ese servidor no existe.');
  return dir;
}

/* ---------- server.properties ---------- */

function parseProperties(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// Reescribe solo las claves cambiadas y conserva comentarios y orden. Las claves/valores no pueden traer saltos de línea.
function applyProperties(text, changes) {
  const clean = {};
  for (const [k, v] of Object.entries(changes || {})) {
    if (!/^[a-z0-9.-]{1,60}$/i.test(k)) continue;
    clean[k] = String(v).replace(/[\r\n]+/g, ' ').slice(0, 300);
  }
  const lines = String(text || '').split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    const i = line.indexOf('=');
    if (!line.startsWith('#') && i > 0) {
      const k = line.slice(0, i).trim();
      if (k in clean) { seen.add(k); return `${k}=${clean[k]}`; }
    }
    return line;
  });
  for (const k of Object.keys(clean)) if (!seen.has(k)) out.push(`${k}=${clean[k]}`);
  return out.join('\n').replace(/\n*$/, '\n');
}

const DEFAULT_PROPS = {
  'server-port': '25565',
  motd: 'Servidor de pruebas Nova PX',
  'online-mode': 'false',
  gamemode: 'survival',
  difficulty: 'easy',
  'max-players': '10',
  'white-list': 'false'
};

/* ---------- crear ---------- */

async function createServer({ root, name, type, mc, ramGb = 2, javaFor, onStatus = () => {}, onProgress = () => {}, fetchImpl = fetch, runBuildTools }) {
  if (!isSafeName(name)) throw new Error('Ponle un nombre de letras y números (hasta 40 caracteres).');
  if (!TYPES[type]) throw new Error('Tipo de servidor desconocido.');
  const id = slug(name);
  if (!id) throw new Error('Nombre no válido.');
  const dir = path.join(root, id);
  if (fs.existsSync(dir)) throw new Error('Ya existe un servidor con ese nombre.');
  fs.mkdirSync(dir, { recursive: true });
  try {
    onStatus('Buscando la versión…');
    const jar = await resolveServerJar(type, mc, fetchImpl);
    onStatus(`Descargando ${TYPES[type].label} ${mc}…`);
    const jarPath = path.join(dir, jar.name);
    await downloadFile(jar.url, jarPath, fetchImpl, onProgress);

    const javaBin = javaFor ? await javaFor(mc) : 'java';
    const meta = { name: String(name).trim(), type, mc, build: jar.build || null, ramGb: Math.max(1, Math.min(32, Number(ramGb) || 2)), created: new Date().toISOString(), jar: 'server.jar' };

    if (type === 'spigot') {
      onStatus('Compilando Spigot (la primera vez tarda varios minutos)…');
      await (runBuildTools || defaultRunner)(javaBin, ['-jar', 'BuildTools.jar', '--rev', mc, '--output-dir', '.'], dir);
      const built = fs.readdirSync(dir).find((f) => /^spigot-.*\.jar$/i.test(f));
      if (!built) throw new Error('BuildTools terminó pero no generó el jar de Spigot.');
      meta.jar = built;
    } else if (jar.installer) {
      onStatus(`Instalando ${TYPES[type].label}…`);
      await (runBuildTools || defaultRunner)(javaBin, ['-jar', jar.name, '--installServer'], dir);
      meta.jar = null; // Forge/NeoForge arrancan con archivos de argumentos
    }
    fs.writeFileSync(path.join(dir, 'eula.txt'), '# Lo acepta el administrador desde Nova PX\neula=false\n');
    fs.writeFileSync(path.join(dir, 'server.properties'), applyProperties('', DEFAULT_PROPS));
    for (const sub of [TYPES[type].content === 'mods' ? 'mods' : 'plugins']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    writeMeta(dir, meta);
    return { id, ...meta };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function defaultRunner(javaBin, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(javaBin, args, { cwd, windowsHide: true });
    let tail = '';
    const keep = (d) => { tail = (tail + d.toString()).slice(-600); };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('error', (e) => reject(new Error(`No se pudo ejecutar Java: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`La instalación falló (código ${code}). ${tail.trim().split('\n').slice(-3).join(' ')}`))));
  });
}

/* ---------- arrancar ---------- */

// Forge/NeoForge modernos guardan los argumentos en libraries/.../win_args.txt (unix_args.txt fuera de Windows).
function findArgsFile(dir, platform = process.platform) {
  const name = platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  const lib = path.join(dir, 'libraries');
  if (!fs.existsSync(lib)) return null;
  const hit = walk(lib).find((f) => f.rel.endsWith(`/${name}`));
  return hit ? path.relative(dir, hit.abs).replace(/\\/g, '/') : null;
}

function launchArgs(dir, meta, platform = process.platform) {
  const ram = `${meta.ramGb || 2}G`;
  const a = [`-Xmx${ram}`, `-Xms${Math.min(1, meta.ramGb || 1)}G`];
  if (meta.jar) return [...a, '-jar', meta.jar, 'nogui'];
  const argsFile = findArgsFile(dir, platform);
  if (argsFile) return [...a, `@${argsFile}`, 'nogui'];
  // Forge antiguo (1.16 o menos): deja un jar "forge-*.jar" que no es el instalador.
  const old = fs.readdirSync(dir).find((f) => /^forge-.*\.jar$/i.test(f) && !/installer/i.test(f));
  if (old) return [...a, '-jar', old, 'nogui'];
  throw new Error('No encuentro cómo arrancar este servidor. Vuelve a crearlo.');
}

class ServerProcess extends EventEmitter {
  constructor() { super(); this.proc = null; this.lines = []; }
  get running() { return !!this.proc; }
  start(javaBin, dir, meta) {
    if (this.proc) throw new Error('El servidor ya está encendido.');
    if (!/eula\s*=\s*true/i.test(fs.readFileSync(path.join(dir, 'eula.txt'), 'utf8'))) throw new Error('Falta aceptar el EULA de Minecraft.');
    const args = launchArgs(dir, meta);
    this.lines = [];
    this.proc = spawn(javaBin, args, { cwd: dir, windowsHide: true });
    const feed = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => {
      this.lines.push(l);
      if (this.lines.length > 500) this.lines.shift();
      this.emit('line', l);
    });
    this.proc.stdout.on('data', feed);
    this.proc.stderr.on('data', feed);
    this.proc.on('error', (e) => { this.emit('line', `[launcher] ${e.message}`); this.proc = null; this.emit('exit', -1); });
    this.proc.on('close', (code) => { this.proc = null; this.emit('exit', code); });
  }
  command(text) {
    if (!this.proc) throw new Error('El servidor está apagado.');
    const t = String(text).replace(/[\r\n]+/g, ' ').slice(0, 300);
    this.proc.stdin.write(`${t}\n`);
  }
  stop(timeoutMs = 20000) {
    const p = this.proc;
    if (!p) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => { try { p.kill(); } catch {} }, timeoutMs);
      p.once('close', () => { clearTimeout(t); resolve(); });
      try { p.stdin.write('stop\n'); } catch { try { p.kill(); } catch {} }
    });
  }
}

/* ---------- plugins / mods / datapacks (Modrinth) ---------- */

// Tipos de contenido y los "loaders" de Modrinth que sirven para cada servidor.
function contentKinds(type) {
  const k = [];
  if (['paper', 'purpur', 'spigot'].includes(type)) k.push({ id: 'plugin', label: 'Plugins', dir: 'plugins', loaders: type === 'spigot' ? ['spigot', 'bukkit'] : ['paper', 'spigot', 'bukkit', ...(type === 'purpur' ? ['purpur'] : [])], project: 'plugin' });
  if (['fabric', 'forge', 'neoforge'].includes(type)) k.push({ id: 'mod', label: 'Mods', dir: 'mods', loaders: [type], project: 'mod' });
  k.push({ id: 'datapack', label: 'Datapacks', dir: null, loaders: ['datapack'], project: 'datapack' });
  return k;
}

// ---- Fuentes de contenido: Modrinth (todo), Hangar y SpigotMC (solo plugins) ----
const SOURCE_LABEL = { modrinth: 'Modrinth', hangar: 'Hangar', spiget: 'SpigotMC' };

async function searchModrinth(k, mc, query, fetchImpl) {
  const q = encodeURIComponent(String(query || '').slice(0, 80));
  const run = async (withVersion) => {
    const facets = [[`project_type:${k.project}`], ...(withVersion ? [[`versions:${mc}`]] : []), k.loaders.map((l) => `categories:${l}`)];
    const j = await getJson(`https://api.modrinth.com/v2/search?limit=20&index=downloads&query=${q}&facets=${encodeURIComponent(JSON.stringify(facets))}`, fetchImpl);
    return j.hits || [];
  };
  let hits = await run(true), exact = true;
  if (!hits.length) { hits = await run(false); exact = false; } // versión muy nueva: se muestra lo más descargado igualmente
  return hits.map((h) => ({ source: 'modrinth', id: h.project_id, title: h.title, description: h.description, downloads: h.downloads, icon: h.icon_url || null, exact }));
}

async function searchHangar(mc, query, fetchImpl) {
  const q = String(query || '').slice(0, 80);
  const run = async (withVersion) => {
    const u = `https://hangar.papermc.io/api/v1/projects?limit=20&sort=-downloads&platform=PAPER${withVersion ? `&version=${encodeURIComponent(mc)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    return (await getJson(u, fetchImpl)).result || [];
  };
  let hits = await run(true), exact = true;
  if (!hits.length) { hits = await run(false); exact = false; }
  return hits.filter((h) => h.namespace && /^[\w.-]{1,64}$/.test(h.namespace.owner) && /^[\w.-]{1,64}$/.test(h.namespace.slug))
    .map((h) => ({ source: 'hangar', id: `${h.namespace.owner}/${h.namespace.slug}`, title: h.name, description: h.description, downloads: (h.stats && h.stats.downloads) || 0, icon: h.avatarUrl || null, exact }));
}

async function searchSpiget(query, fetchImpl) {
  const q = String(query || '').trim().slice(0, 80);
  const fields = 'id,name,tag,downloads,external,premium,icon';
  const u = q
    ? `https://api.spiget.org/v2/search/resources/${encodeURIComponent(q)}?field=name&size=40&sort=-downloads&fields=${fields}`
    : `https://api.spiget.org/v2/resources?size=40&sort=-downloads&fields=${fields}`;
  const list = await getJson(u, fetchImpl);
  return (Array.isArray(list) ? list : []).filter((r) => r && !r.external && !r.premium && Number.isInteger(r.id))
    .slice(0, 20).map((r) => ({ source: 'spiget', id: String(r.id), title: r.name, description: r.tag, downloads: r.downloads || 0, icon: r.icon && r.icon.url ? `https://www.spigotmc.org/${r.icon.url}` : null, exact: false }));
}

async function searchContent({ type, mc, kind, query }, fetchImpl = fetch) {
  const k = contentKinds(type).find((x) => x.id === kind);
  if (!k) throw new Error('Ese tipo de servidor no usa ese contenido.');
  const jobs = [searchModrinth(k, mc, query, fetchImpl)];
  if (k.id === 'plugin') { jobs.push(searchHangar(mc, query, fetchImpl)); jobs.push(searchSpiget(query, fetchImpl)); }
  const settled = await Promise.allSettled(jobs);
  const ok = settled.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw settled[0].reason;
  // Se mezclan por turnos para que ninguna fuente tape a las demás; sin repetir el mismo nombre.
  const lists = ok.map((r) => r.value);
  const out = [], seen = new Set();
  for (let i = 0; out.length < 40 && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const it = l[i];
      if (!it) continue;
      const key = String(it.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) continue;
      seen.add(key); out.push(it);
    }
  }
  return out;
}

async function pickModrinthFile(projectId, k, mc, fetchImpl) {
  const base = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify(k.loaders))}`;
  let versions = await getJson(`${base}&game_versions=${encodeURIComponent(JSON.stringify([mc]))}`, fetchImpl);
  let warning = '';
  if (!versions.length) { versions = await getJson(base, fetchImpl); warning = `Sin versión específica para Minecraft ${mc}: se instaló la más reciente, puede no funcionar.`; }
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  if (!v) throw new Error(`No hay una versión de eso para ${k.label.toLowerCase()} de tu servidor.`);
  const file = v.files.find((f) => f.primary) || v.files[0];
  if (!file || !safeFile(file.filename)) throw new Error('El archivo que ofrece Modrinth no es seguro.');
  return { url: file.url, name: file.filename, warning };
}

async function pickHangarFile(projectId, mc, fetchImpl) {
  if (!/^[\w.-]{1,64}\/[\w.-]{1,64}$/.test(String(projectId))) throw new Error('Proyecto no válido.');
  const slugPart = String(projectId).split('/')[1];
  const j = await getJson(`https://hangar.papermc.io/api/v1/projects/${slugPart}/versions?limit=25&platform=PAPER`, fetchImpl);
  const vs = (j.result || []).filter((v) => v.downloads && v.downloads.PAPER && v.downloads.PAPER.downloadUrl && v.downloads.PAPER.fileInfo);
  const fits = vs.filter((v) => ((v.platformDependencies || {}).PAPER || []).some((x) => x === mc || mc.startsWith(`${x}.`) || x.startsWith(`${mc}.`)));
  const v = fits[0] || vs[0];
  if (!v) {
    const ext = ((j.result || [])[0] || {}).downloads;
    const web = ext && ext.PAPER && ext.PAPER.externalUrl;
    throw new Error(`Ese plugin no se puede descargar directo desde Hangar${web ? `; su autor lo publica en ${web}` : ''}.`);
  }
  const name = v.downloads.PAPER.fileInfo.name;
  if (!safeFile(name)) throw new Error('El archivo que ofrece Hangar no es seguro.');
  return { url: v.downloads.PAPER.downloadUrl, name, warning: fits[0] ? '' : `Sin versión marcada para Minecraft ${mc}: se instaló la más reciente, puede no funcionar.` };
}

async function pickSpigetFile(projectId, fetchImpl) {
  if (!/^\d{1,9}$/.test(String(projectId))) throw new Error('Proyecto no válido.');
  const r = await getJson(`https://api.spiget.org/v2/resources/${projectId}?fields=id,name,external,premium,file`, fetchImpl);
  if (r.external || r.premium || !r.file || r.file.type !== '.jar') throw new Error('Ese plugin no se puede descargar directo desde SpigotMC (es de pago o externo).');
  const name = `${slug(r.name) || 'plugin'}-${projectId}.jar`;
  if (!safeFile(name)) throw new Error('El archivo no es seguro.');
  return { url: `https://api.spiget.org/v2/resources/${projectId}/download`, name, warning: 'Descargado de SpigotMC: revisa que sea compatible con tu versión.' };
}

async function installContent({ dir, meta, kind, projectId, source = 'modrinth', fetchImpl = fetch }) {
  const k = contentKinds(meta.type).find((x) => x.id === kind);
  if (!k) throw new Error('Ese tipo de servidor no usa ese contenido.');
  let pick;
  if (source === 'hangar' && k.id === 'plugin') pick = await pickHangarFile(projectId, meta.mc, fetchImpl);
  else if (source === 'spiget' && k.id === 'plugin') pick = await pickSpigetFile(projectId, fetchImpl);
  else if (source === 'modrinth') {
    if (!/^[\w-]{4,40}$/.test(String(projectId))) throw new Error('Proyecto no válido.');
    pick = await pickModrinthFile(projectId, k, meta.mc, fetchImpl);
  } else throw new Error('Fuente no válida.');
  let target;
  if (k.dir) target = path.join(dir, k.dir);
  else {
    const props = parseProperties(fs.existsSync(path.join(dir, 'server.properties')) ? fs.readFileSync(path.join(dir, 'server.properties'), 'utf8') : '');
    const world = String(props['level-name'] || 'world').replace(/[^\w .-]/g, '') || 'world';
    target = path.join(dir, world, 'datapacks');
  }
  fs.mkdirSync(target, { recursive: true });
  await downloadFile(pick.url, path.join(target, pick.name), fetchImpl);
  return { file: pick.name, folder: path.relative(dir, target).replace(/\\/g, '/'), warning: pick.warning || '' };
}

function listContent(dir, meta) {
  const out = [];
  for (const k of contentKinds(meta.type)) {
    let target = k.dir ? path.join(dir, k.dir) : null;
    if (!target) {
      const props = parseProperties(fs.existsSync(path.join(dir, 'server.properties')) ? fs.readFileSync(path.join(dir, 'server.properties'), 'utf8') : '');
      target = path.join(dir, String(props['level-name'] || 'world').replace(/[^\w .-]/g, '') || 'world', 'datapacks');
    }
    if (!fs.existsSync(target)) continue;
    for (const f of fs.readdirSync(target)) if (safeFile(f)) out.push({ kind: k.id, file: f });
  }
  return out;
}

function removeContent(dir, meta, kind, file) {
  const hit = listContent(dir, meta).find((c) => c.kind === kind && c.file === file);
  if (!hit) throw new Error('No encontré ese archivo.');
  const k = contentKinds(meta.type).find((x) => x.id === kind);
  const base = k.dir ? path.join(dir, k.dir) : path.join(dir, String(parseProperties(fs.readFileSync(path.join(dir, 'server.properties'), 'utf8'))['level-name'] || 'world').replace(/[^\w .-]/g, '') || 'world', 'datapacks');
  fs.rmSync(path.join(base, file), { force: true });
}

/* ---------- exportar ---------- */

// Zip listo para subir al host. No lleva el instalador, BuildTools, registros ni la copia de seguridad temporal.
function exportServer(dir, dest) {
  const skip = /^(logs|crash-reports|cache|\.git|nova-server\.json|BuildTools\.jar|BuildTools\.log\.txt|work|apache-maven-[^/]*|CraftBukkit|Spigot|Bukkit|BuildData)(\/|$)|(installer\.jar|\.part)$/i;
  const entries = walk(dir).filter((f) => !skip.test(f.rel)).map((f) => ({ name: f.rel, abs: f.abs }));
  const props = path.join(dir, 'server.properties');
  const note = 'Servidor creado con Nova PX Event Launcher.\nSube esta carpeta a tu host. Cambia online-mode y el puerto según tu host.\n';
  entries.push({ name: 'LEEME-NOVAPX.txt', data: Buffer.from(note) });
  if (!fs.existsSync(props)) throw new Error('El servidor no tiene server.properties.');
  return writeZip(dest, entries, { maxBytes: 4 * 1024 ** 3 });
}

module.exports = {
  TYPES, isSafeName, slug, safeFile, listVersions, resolveServerJar, listServers, serverDir, readMeta, writeMeta,
  parseProperties, applyProperties, DEFAULT_PROPS, createServer, findArgsFile, launchArgs, ServerProcess,
  contentKinds, searchContent, installContent, listContent, removeContent, exportServer
};
