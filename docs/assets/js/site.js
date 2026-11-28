(function () {
  'use strict';
  var toggle = document.querySelector('[data-menu-toggle]');
  var nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
  var version = document.querySelector('[data-version]');
  var win = document.querySelector('[data-download="windows"]');
  var linux = document.querySelector('[data-download="linux"]');
  var release = document.querySelector('[data-release]');
  fetch('https://api.github.com/repos/javierroman94/Nova-PX-Event-Launcher/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' }
  }).then(function (response) {
    if (!response.ok) throw new Error('No se pudo consultar la publicación');
    return response.json();
  }).then(function (data) {
    var assets = Array.isArray(data.assets) ? data.assets : [];
    var exe = assets.find(function (asset) { return /^Nova-PX-Event-Launcher-Setup-.*\.exe$/i.test(asset.name); });
    var appImage = assets.find(function (asset) { return /^Nova-PX-Event-Launcher-.*\.AppImage$/i.test(asset.name); });
    var tag = String(data.tag_name || '').replace(/^v/, '');
    if (version && tag) version.textContent = tag;
    if (exe && /^https:\/\/github\.com\/javierroman94\/Nova-PX-Event-Launcher\/releases\//.test(exe.browser_download_url)) win.href = exe.browser_download_url;
    if (appImage && /^https:\/\/github\.com\/javierroman94\/Nova-PX-Event-Launcher\/releases\//.test(appImage.browser_download_url)) linux.href = appImage.browser_download_url;
    if (release && data.html_url && /^https:\/\/github\.com\/javierroman94\/Nova-PX-Event-Launcher\/releases\//.test(data.html_url)) release.href = data.html_url;
  }).catch(function () {
    if (version) version.textContent = 'Consulta la última versión en GitHub';
  });
}());