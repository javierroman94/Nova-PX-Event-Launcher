/* Interfaz del launcher — Asistente de primer uso y el resto del arranque. (parte de lo que antes era app.js; se carga en este orden desde index.html). */

/* ---------- asistente de primer uso ---------- */
const wz = { step: 0, rec: 4 };
function wzShow(n) {
  wz.step = n;
  document.querySelectorAll('#welcome-modal [data-wz]').forEach((s) => (s.hidden = Number(s.dataset.wz) !== n));
  [...$('wz-dots').children].forEach((d, i) => d.classList.toggle('on', i <= n));
  $('wz-back').hidden = n === 0;
  $('wz-skip').hidden = n === 3;
  $('wz-next').textContent = n === 0 ? 'Empezar' : n === 3 ? 'Ir al inicio' : 'Siguiente';
}
async function wzFinish() {
  try { await window.api.saveSettings({ welcomed: true }); } catch {}
  if ($('welcome-modal').open) $('welcome-modal').close();
  goTo('home');
  window.dispatchEvent(new Event('nova-welcome-done'));
}
function maybeWelcome(settings, sys) {
  if (settings.welcomed) return;
  const max = Math.min(16, sys.totalRamGb);
  wz.rec = Math.max(2, Math.min(6, Math.floor(sys.totalRamGb / 2), max));
  $('wz-ram').max = String(max);
  $('wz-ram').value = String(wz.rec);
  $('wz-ram-out').textContent = `${wz.rec} GB`;
  $('wz-ram-hint').textContent = `Tu equipo tiene ${sys.totalRamGb} GB en total. Te recomendamos ${wz.rec} GB.`;
  wzShow(0);
  $('welcome-modal').showModal();
}
$('wz-ram').addEventListener('input', () => {
  $('wz-ram-out').textContent = `${$('wz-ram').value} GB`;
  $('wz-ram-rec').hidden = Number($('wz-ram').value) !== wz.rec;
});
$('wz-next').addEventListener('click', async () => {
  if (wz.step === 2) {
    try { await window.api.saveSettings({ ramGb: Number($('wz-ram').value) }); $('ram').value = $('wz-ram').value; $('ram-out').textContent = `${$('wz-ram').value} GB`; } catch {}
  }
  if (wz.step === 3) return wzFinish();
  wzShow(wz.step + 1);
});
$('wz-back').addEventListener('click', () => wzShow(Math.max(0, wz.step - 1)));
$('wz-skip').addEventListener('click', wzFinish);
$('welcome-modal').addEventListener('cancel', (e) => { e.preventDefault(); wzFinish(); });
$('wz-ms').addEventListener('click', async () => {
  $('wz-ms').disabled = true;
  $('wz-msg').textContent = 'Se abrirá la ventana de Microsoft…';
  try {
    const info = await window.api.loginMicrosoft();
    setSession(info);
    $('wz-msg').textContent = `Sesión iniciada como ${info.name}.`;
    wzShow(2);
  } catch (e) {
    $('wz-msg').textContent = cleanError(e) || 'No se completó el inicio de sesión. Puedes intentarlo de nuevo o jugar sin cuenta.';
  }
  $('wz-ms').disabled = false;
});
$('wz-offline').addEventListener('click', async () => {
  try {
    const nick = $('wz-nick').value;
    const info = await window.api.loginOffline(nick);
    await window.api.saveSettings({ lastNick: nick.trim() });
    setSession(info);
    $('wz-msg').textContent = `Listo, jugarás como ${info.name}.`;
    wzShow(2);
  } catch (e) {
    $('wz-msg').textContent = cleanError(e);
  }
});

/* ---------- arranque ---------- */


// Ya no hay temas secretos por persona: Nova Eclipse es un tema de NovaPX para todos.
function syncSecretThemes() {}
