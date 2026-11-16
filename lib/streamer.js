'use strict';
// Modo streamer: oculta tu nick en el launcher. En "auto" se activa si detecta un programa de directos abierto.
const STREAM_APPS = [
  'obs64', 'obs32', 'obs', 'obs-studio', 'streamlabs obs', 'streamlabs desktop', 'slobs', 'xsplit.core', 'xsplit.gamecaster',
  'twitchstudio', 'twitch studio', 'prism live studio', 'prismlive', 'tiktok live studio', 'tiktoklivestudio', 'vmix64', 'vmix', 'lightstream', 'restream'
];

const norm = (n) => String(n || '').toLowerCase().replace(/\.exe$/, '').replace(/\.app$/, '').trim();

// `names`: nombres de procesos en ejecución.
function streamingDetected(names) {
  const set = new Set((names || []).map(norm));
  return STREAM_APPS.some((a) => set.has(a));
}
const MODES = ['auto', 'on', 'off'];
const cleanMode = (m) => (MODES.includes(m) ? m : 'auto');
const effective = (mode, detected) => (mode === 'on' ? true : mode === 'off' ? false : !!detected);

// Lista de procesos del sistema (Windows, macOS y Linux). Nunca lanza: si falla, devuelve [].
function listProcesses(execFile, platform = process.platform) {
  return new Promise((resolve) => {
    const done = (out) => resolve(String(out || '').split(/\r?\n/).filter(Boolean));
    try {
      if (platform === 'win32') {
        execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 4000, windowsHide: true }, (err, out) =>
          done(err ? '' : String(out).split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1] || '').join('\n')));
      } else {
        execFile('ps', ['-A', '-o', 'comm='], { timeout: 4000 }, (err, out) =>
          done(err ? '' : String(out).split(/\r?\n/).map((l) => l.split('/').pop()).join('\n')));
      }
    } catch { resolve([]); }
  });
}

module.exports = { streamingDetected, cleanMode, effective, listProcesses, MODES, STREAM_APPS };
