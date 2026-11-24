/* Prueba de arranque de la interfaz: abre la pantalla con datos simulados, recorre todas las pestañas y falla si
   aparece cualquier error de JavaScript. Necesita Playwright (npm i -g playwright && npx playwright install chromium). */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('Playwright no está instalado: se omite la prueba de arranque.'); process.exit(0); }

(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 800 }, ignoreHTTPSErrors: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.addInitScript(() => {
    localStorage.setItem('px.pet.born', '1');
    const base = {
      getConfig: { version: '1.0.0', launcherName: 'Nova PX - Event Launcher', events: [], mods: [], server: { name: 'Servidor', host: 'play.example.com' }, links: {} },
      getSettings: { intro: false, welcomed: true, onboarded: true, theme: 'nova' },
      appState: { session: { name: 'Jugador', mode: 'offline', id: 'x' }, log: [] },
      systemInfo: { totalRamGb: 16, freeRamGb: 9, cpus: 8, platform: 'win32' }
    };
    window.api = new Proxy({}, { get: (t, k) => {
      if (k in base) return async () => base[k];
      if (String(k).startsWith('on')) return () => () => {};
      return async () => [];
    } });
  });
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
  await page.waitForSelector('.tab-btn', { timeout: 15000 }).catch(() => errors.push('La pantalla principal no llegó a cargar.'));
  await page.waitForTimeout(1500);
  const tabs = await page.$$eval('.tab-btn[data-tab]', (bs) => bs.filter((b) => !b.hidden).map((b) => b.dataset.tab));
  for (const t of tabs) {
    await page.click(`.tab-btn[data-tab="${t}"]`).catch(() => {});
    await page.waitForTimeout(250);
    if (t === 'settings') {
      // Ajustes es una ventana superpuesta: debe abrirse por encima de todo (barra lateral incluida) y cerrarse con Esc.
      const cubre = await page.evaluate(() => {
        const o = document.getElementById('page-settings');
        if (!o || !o.classList.contains('open')) return 'no se abrió';
        const r = o.getBoundingClientRect();
        const top = document.elementFromPoint(12, 12);
        return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1 && o.contains(top) ? 'ok' : 'no cubre la ventana';
      });
      if (cubre !== 'ok') errors.push(`Ajustes superpuesto: ${cubre}.`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if (await page.evaluate(() => document.getElementById('page-settings').classList.contains('open'))) errors.push('Ajustes no se cierra con Esc.');
    }
  }
  await page.click('#pet-chip').catch(() => errors.push('No se pudo abrir la ventana de la mascota.'));
  await page.waitForTimeout(400);
  const petOpen = await page.evaluate(() => !!document.querySelector('dialog.pl-care[open]'));
  if (!petOpen) errors.push('La ventana de la mascota no se abrió.');
  await browser.close();
  const uniq = [...new Set(errors)];
  if (uniq.length) { console.error('Prueba de arranque: FALLÓ\n - ' + uniq.join('\n - ')); process.exit(1); }
  console.log(`Prueba de arranque: OK (${tabs.length} pestañas recorridas, sin errores).`);
})();
