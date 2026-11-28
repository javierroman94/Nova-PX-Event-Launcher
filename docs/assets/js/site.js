/* Nova PX — web oficial: menú móvil y enlaces de descarga de la última versión publicada en GitHub. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var toggle = document.querySelector('[data-menu-toggle]');
  var nav = document.querySelector('[data-nav]');
  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    });
  }

  // Solo se aceptan descargas de las publicaciones de este repositorio.
  var REPO = 'javierroman94/Nova-PX-Event-Launcher';
  var ASSET_URL = /^https:\/\/github\.com\/javierroman94\/Nova-PX-Event-Launcher\/releases\/download\/v\d+\.\d+\.\d+\/[\w.-]+$/;
  var RELEASE_URL = /^https:\/\/github\.com\/javierroman94\/Nova-PX-Event-Launcher\/releases\/tag\/v\d+\.\d+\.\d+$/;
  var status = document.querySelector('[data-release-status]');

  function fallback() {
    if (status) status.textContent = 'No pudimos comprobar si hay una versión más nueva; el botón baja la 1.0.193 y luego se actualiza sola ·';
  }
  if (!window.fetch) return;

  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal: ctrl ? ctrl.signal : undefined
  }).then(function (r) {
    if (!r.ok) throw new Error('GitHub respondió ' + r.status);
    return r.json();
  }).then(function (data) {
    clearTimeout(timer);
    var tag = String((data && data.tag_name) || '');
    if (!/^v\d+\.\d+\.\d+$/.test(tag) || data.draft || data.prerelease) throw new Error('Publicación inesperada');
    var version = tag.slice(1);
    var assets = Array.isArray(data.assets) ? data.assets : [];
    function find(re) {
      for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        if (a && re.test(String(a.name)) && ASSET_URL.test(String(a.browser_download_url))) return a;
      }
      return null;
    }
    var exe = find(/^Nova-PX-Event-Launcher-Setup-\d+\.\d+\.\d+\.exe$/);
    var appImage = find(/^Nova-PX-Event-Launcher-\d+\.\d+\.\d+\.AppImage$/);
    var mb = function (a) { return Math.round(a.size / 1048576) + ' MB'; };

    document.querySelectorAll('[data-version]').forEach(function (el) { el.textContent = version; });
    if (exe) {
      document.querySelectorAll('[data-download="windows"]').forEach(function (el) { el.href = exe.browser_download_url; });
      var w = document.querySelector('[data-file="windows"]');
      if (w) w.textContent = 'Instalador directo (' + mb(exe) + '). Se actualiza solo.';
    }
    var linux = document.querySelector('[data-download="linux"]');
    if (linux && appImage) {
      linux.href = appImage.browser_download_url;
      linux.hidden = false;
      var l = document.querySelector('[data-file="linux"]');
      if (l) l.textContent = 'Archivo portable (' + mb(appImage) + ').';
    }
    var rel = document.querySelector('[data-release]');
    if (rel && RELEASE_URL.test(String(data.html_url))) rel.href = data.html_url;
  }).catch(function () {
    clearTimeout(timer);
    fallback();
  });
}());
