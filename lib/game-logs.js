'use strict';
// Cuando el juego se cierra con error (o casi al instante), el launcher junta lo último que escribió Minecraft en su carpeta
// para mostrarlo en la Consola. Así el motivo real aparece sin que el jugador tenga que buscar archivos.
const fs = require('fs');
const path = require('path');

const tail = (text, n) => text.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === '')).slice(-n);
const head = (text, n) => text.split(/\r?\n/).slice(0, n);

function newest(dir, re) {
  try {
    return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0] || null;
  } catch { return null; }
}

// since: solo cuenta archivos modificados desde ese momento (para no mostrar errores de partidas viejas).
function collectGameLogs(gameDir, { since = 0, logLines = 40, crashLines = 30 } = {}) {
  const out = [];
  const read = (file, pick) => { try { return pick(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const fresh = (file) => { try { return fs.statSync(file).mtimeMs >= since - 2000; } catch { return false; } };

  const latest = path.join(gameDir, 'logs', 'latest.log');
  if (fs.existsSync(latest) && fresh(latest)) {
    const lines = read(latest, (t) => tail(t, logLines));
    if (lines && lines.length) out.push({ title: `Últimas ${lines.length} líneas de logs/latest.log`, lines });
  }
  const crash = newest(path.join(gameDir, 'crash-reports'), /^crash-.*\.txt$/);
  if (crash && fresh(path.join(gameDir, 'crash-reports', crash.f))) {
    const lines = read(path.join(gameDir, 'crash-reports', crash.f), (t) => head(t, crashLines));
    if (lines && lines.length) out.push({ title: `Informe de fallo ${crash.f}`, lines });
  }
  const hs = newest(gameDir, /^hs_err_pid\d+\.log$/);
  if (hs && fresh(path.join(gameDir, hs.f))) {
    const lines = read(path.join(gameDir, hs.f), (t) => head(t, 20));
    if (lines && lines.length) out.push({ title: `Fallo de la máquina virtual de Java (${hs.f})`, lines });
  }
  return out;
}

module.exports = { collectGameLogs };
