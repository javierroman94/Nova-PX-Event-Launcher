/* Capturas de la interfaz con datos simulados (para revisar el diseño sin abrir el launcher).
   Uso: node tools/capturas.js <carpeta-salida> [tema] [pestañas separadas por coma] [ancho] [alto]
   Necesita Playwright (npm i -g playwright && npx playwright install chromium). */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('Playwright no está instalado.'); process.exit(0); }

(async () => {
  const [out = '/tmp/capturas', theme = 'nova', tabsArg = 'home', w = '1300', h = '800'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, ignoreHTTPSErrors: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.addInitScript((theme) => {
    localStorage.setItem('px.pet.born', '1');
    const manifest = { minecraftVersion: '1.21.1', loader: { type: 'fabric' }, mods: [], protected: true, event: { name: 'Murder Mistery', tagline: 'Evento organizado por EzLuiiz con el mod de "Sweet Vacations" donde 15 jugadores tendran que descubrir quien es el asesino en un yate.', status: 'active', active: true }, sponsors: [{ name: 'EzLuiiz', role: 'Evento organizado por', nick: 'EzLuiiz', url: 'https://twitch.tv/x' }] };
    const base = {
      getConfig: { version: '1.0.185', launcherName: 'Nova PX - Event Launcher', events: [], mods: [], server: { name: 'Servidor', host: 'play.example.com' }, links: {} },
      getSettings: { intro: false, welcomed: true, onboarded: true, theme, design: 2 },
      appState: { session: { name: 'Jugador', mode: 'online', id: 'x' }, log: [] },
      systemInfo: { totalRamGb: 16, freeRamGb: 9, cpus: 8, platform: 'win32' },
      getData: manifest,
      communityStats: { total: 35, day: 4 },
      modpackInstalled: [
        { id: 'a', title: 'Murder Mistery', mcVersion: '1.21.1', loader: { type: 'fabric' }, lastPlayedAt: new Date().toISOString(), installedAt: new Date().toISOString(), provider: 'imported' },
        { id: 'b', title: 'Nova Client', mcVersion: '1.21.4', loader: { type: 'fabric' }, installedAt: new Date().toISOString(), provider: 'imported' }
      ]
    };
    window.api = new Proxy({}, { get: (t, k) => {
      if (k === 'getData') return async (n) => (n === 'manifest' ? manifest : n === 'news' ? [{ title: 'Nueva temporada', date: '2026-11-20', text: 'Llegó la temporada de eventos.' }] : []);
      if (k in base) return async () => base[k];
      if (String(k).startsWith('on')) return () => () => {};
      return async () => [];
    } });
  }, theme);
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
  await page.waitForSelector('.tab-btn', { timeout: 15000 }).catch(() => errors.push('No cargó la pantalla principal.'));
  await page.waitForTimeout(1500);
  for (const t of tabsArg.split(',')) {
    if (t === 'settings') await page.click('.tab-btn[data-tab="settings"]').catch(() => {});
    else await page.click(`.tab-btn[data-tab="${t}"]`).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${theme}-${t}.png`) });
    if (t === 'settings') { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  }
  await browser.close();
  if (errors.length) console.log('Errores de JS:\n - ' + [...new Set(errors)].join('\n - '));
  console.log('Capturas en', out);
})();
