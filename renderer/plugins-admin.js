/* Plugins propios de Nova PX (pestaña Plugins del panel de administración) y ventanita de contraseña.
 * Usa $, el, toast, cleanError y askConfirm de app.js solo cuando se llama. */
(function () {
  const g = (id) => document.getElementById(id);
  let picked = null;

  const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // Pide una contraseña en una ventanita. Devuelve el texto o null si cancela.
  window.askPassword = function (message) {
    return new Promise((resolve) => {
      const dlg = el('dialog', 'event-modal confirm-modal');
      dlg.setAttribute('aria-label', 'Contraseña');
      const body = el('div', 'event-modal-body');
      const input = document.createElement('input');
      input.type = 'password'; input.autocomplete = 'off'; input.placeholder = 'Contraseña de la biblioteca';
      const actions = el('div', 'mp-actions');
      const no = el('button', '', 'Cancelar'); no.type = 'button';
      const yes = el('button', 'primary', 'Aceptar'); yes.type = 'button';
      actions.append(no, yes);
      body.append(el('p', 'confirm-msg', message), input, actions);
      dlg.append(body);
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); try { dlg.close(); } catch {} dlg.remove(); };
      yes.addEventListener('click', () => finish(input.value || null));
      no.addEventListener('click', () => finish(null));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value || null); });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      document.body.append(dlg);
      dlg.showModal();
      input.focus();
    });
  };

  async function paint() {
    const box = g('pl-list');
    box.textContent = '';
    let lib;
    try { lib = await window.api.pluginList(); } catch (e) { box.append(el('p', 'muted', cleanError(e))); return; }
    if (!lib.plugins.length) box.append(el('p', 'muted', 'Todavía no hay plugins propios.'));
    lib.plugins.forEach((p) => {
      const row = el('div', 'mod-card');
      const info = el('div', 'sv-grow');
      info.append(el('b', '', `${p.locked ? '🔒' : '🌐'} ${p.name}`), el('div', 'muted', `${p.file} · ${fmt(p.size)} · ${p.locked ? 'bloqueado (cifrado)' : 'público'}${p.description ? ' · ' + p.description : ''}`));
      const lock = el('button', '', p.locked ? 'Hacer público' : 'Bloquear'); lock.type = 'button';
      lock.addEventListener('click', async () => {
        const want = !p.locked;
        const pw = await window.askPassword(want ? 'Escribe la contraseña de la biblioteca para cifrar este plugin (si es el primero bloqueado, esa será la contraseña).' : 'Escribe la contraseña de la biblioteca para hacerlo público.');
        if (!pw) return;
        lock.disabled = true;
        try { await window.api.pluginSetLock(p.id, want, pw); toast(want ? 'Plugin bloqueado.' : 'Plugin público.'); } catch (e) { toast(cleanError(e) === 'BAD_KEY' ? 'Esa contraseña no es la de la biblioteca.' : cleanError(e), 'error'); }
        paint();
      });
      const del = el('button', '', 'Quitar'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!(await askConfirm(`¿Quitar «${p.name}» de la biblioteca? Se borra el archivo publicado.`, 'Quitar', 'Cancelar'))) return;
        try { await window.api.pluginRemove(p.id); toast('Plugin quitado.'); } catch (e) { toast(cleanError(e), 'error'); }
        paint();
      });
      row.append(info, lock, del);
      box.append(row);
    });
  }

  g('pl-pick').addEventListener('click', async () => {
    try {
      const r = await window.api.pluginPick();
      if (!r) return;
      picked = r;
      g('pl-file').textContent = `${r.file} (${fmt(r.size)})`;
      if (!g('pl-name').value) g('pl-name').value = r.file.replace(/\.jar$/i, '').replace(/[-_ ]?v?\d+(\.\d+)*.*$/i, '');
    } catch (e) { toast(cleanError(e), 'error'); }
  });
  g('pl-publish').addEventListener('click', async () => {
    const st = g('pl-status');
    if (!picked) { st.textContent = 'Primero elige el archivo .jar.'; return; }
    const locked = g('pl-locked').value === '1';
    g('pl-publish').disabled = true;
    st.textContent = locked ? 'Cifrando y subiendo…' : 'Subiendo…';
    try {
      await window.api.pluginPublish({ name: g('pl-name').value, description: g('pl-desc').value, locked, password: g('pl-pass').value });
      st.textContent = 'Plugin subido.';
      picked = null; g('pl-file').textContent = 'Ningún archivo elegido'; g('pl-name').value = ''; g('pl-desc').value = ''; g('pl-pass').value = '';
      toast('Plugin subido.');
      paint();
    } catch (e) { st.textContent = cleanError(e); }
    g('pl-publish').disabled = false;
  });
  document.querySelectorAll('[data-ad-tab]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.adTab === 'plugins') paint(); }));
})();
