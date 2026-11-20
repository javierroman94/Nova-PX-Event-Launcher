/* Plugins propios de Nova PX (pestaña Plugins del panel de administración) y ventanita de contraseña.
 * Usa $, el, toast, cleanError y askConfirm de app.js solo cuando se llama. */
(function () {
  const g = (id) => document.getElementById(id);
  let picked = null;
  let editing = null; // id del plugin cuya información se está editando
  let imagePath = '';

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

  const val = (id) => g(id).value.trim();
  function formFields() {
    const links = [[val('pl-l1t'), val('pl-l1u')], [val('pl-l2t'), val('pl-l2u')]].filter((l) => l[1]).map((l) => ({ label: l[0], url: l[1] }));
    return { name: val('pl-name'), description: val('pl-desc'), info: val('pl-info'), image: imagePath, creator: { name: val('pl-creator'), url: val('pl-creator-url') }, links };
  }
  function showImage() {
    const im = g('pl-img-prev');
    const u = imagePath && typeof imageUrl === 'function' ? imageUrl(imagePath) : '';
    im.hidden = !u;
    if (u) im.src = u;
  }
  function clearForm() {
    picked = null; editing = null; imagePath = '';
    g('pl-file').textContent = 'Ningún archivo elegido';
    ['pl-name', 'pl-desc', 'pl-info', 'pl-creator', 'pl-creator-url', 'pl-l1t', 'pl-l1u', 'pl-l2t', 'pl-l2u', 'pl-pass'].forEach((i) => { g(i).value = ''; });
    g('pl-publish').textContent = 'Subir plugin';
    g('pl-cancel').hidden = true;
    g('pl-pick').disabled = false;
    showImage();
  }
  function loadForm(p) {
    clearForm();
    editing = p.id; imagePath = p.image || '';
    g('pl-name').value = p.name; g('pl-desc').value = p.description || ''; g('pl-info').value = p.info || '';
    g('pl-creator').value = (p.creator && p.creator.name) || ''; g('pl-creator-url').value = (p.creator && p.creator.url) || '';
    (p.links || []).slice(0, 2).forEach((l, i) => { g(`pl-l${i + 1}t`).value = l.label; g(`pl-l${i + 1}u`).value = l.url; });
    g('pl-file').textContent = `Editando «${p.name}». Elige un .jar solo si quieres reemplazar el archivo.`;
    g('pl-publish').textContent = 'Guardar información';
    g('pl-cancel').hidden = false;
    showImage();
    g('pl-name').focus();
  }

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
      const edit = el('button', '', 'Editar'); edit.type = 'button';
      edit.addEventListener('click', () => loadForm(p));
      const del = el('button', '', 'Quitar'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!(await askConfirm(`¿Quitar «${p.name}» de la biblioteca? Se borra el archivo publicado.`, 'Quitar', 'Cancelar'))) return;
        try { await window.api.pluginRemove(p.id); toast('Plugin quitado.'); } catch (e) { toast(cleanError(e), 'error'); }
        paint();
      });
      row.append(info, edit, lock, del);
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
  g('pl-img').addEventListener('click', async () => {
    try { const r = await pickImageCropped(val('pl-name') || 'plugin', 16 / 9); if (r) { imagePath = r.path; showImage(); } } catch (e) { toast(cleanError(e), 'error'); }
  });
  g('pl-img-clear').addEventListener('click', () => { imagePath = ''; showImage(); });
  g('pl-cancel').addEventListener('click', clearForm);
  g('pl-publish').addEventListener('click', async () => {
    const st = g('pl-status');
    const locked = g('pl-locked').value === '1';
    g('pl-publish').disabled = true;
    try {
      if (editing && !picked) {
        st.textContent = 'Guardando…';
        await window.api.pluginSaveInfo(editing, formFields());
        st.textContent = 'Información guardada.';
      } else {
        if (!picked) { st.textContent = 'Primero elige el archivo .jar.'; g('pl-publish').disabled = false; return; }
        st.textContent = locked ? 'Cifrando y subiendo…' : 'Subiendo…';
        await window.api.pluginPublish({ ...formFields(), locked, password: g('pl-pass').value });
        st.textContent = 'Plugin subido.';
      }
      toast(editing && !picked ? 'Información guardada.' : 'Plugin subido.');
      clearForm();
      paint();
    } catch (e) { st.textContent = cleanError(e); }
    g('pl-publish').disabled = false;
  });
  document.querySelectorAll('[data-ad-tab]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.adTab === 'plugins') paint(); }));
})();
