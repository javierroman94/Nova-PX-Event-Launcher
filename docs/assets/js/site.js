/* global document, window */
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

  var pxRoot = document.getElementById('px-stage');
  if (pxRoot) {
    var pxCanvas = document.getElementById('px-web-model');
    var pxCtx = pxCanvas && pxCanvas.getContext('2d');
    var pxMesh = window.NovaMob3D;
    var pxAnim = 0, pxLast = 0;
    if (pxCanvas && pxCtx && pxMesh && pxMesh.names.includes('px')) {
      var pxReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      function drawPexy(now) {
        var dt = Math.min(0.05, (now - (pxLast || now)) / 1000); pxLast = now;
        pxAnim += pxReduced ? 0 : dt * 2.2;
        pxCtx.clearRect(0, 0, pxCanvas.width, pxCanvas.height);
        pxCtx.save(); pxCtx.translate(240, 385); pxCtx.scale(1.35, 1.35);
        pxMesh.draw(pxCtx, { name: 'px', dir: 1, ph: pxAnim, moving: false, acc: window.__novaPexyAccessory || '' }, 0, 0);
        pxCtx.restore();
        window.requestAnimationFrame(drawPexy);
      }
      window.requestAnimationFrame(drawPexy);
    }

    var pxKey = 'novapx.pexy.web.v1';
    var pxDefault = { hunger: 80, energy: 90, love: 70, xp: 0, streak: 0, day: '', last: Date.now(), acc: '', best: 0 };
    var pxState = pxDefault;
    try { pxState = Object.assign({}, pxDefault, JSON.parse(localStorage.getItem(pxKey) || '{}')); } catch (_) { pxState = Object.assign({}, pxDefault); }
    ['hunger','energy','love'].forEach(function(k){var n=Number(pxState[k]);pxState[k]=Number.isFinite(n)?Math.max(0,Math.min(100,n)):pxDefault[k];});
    ['xp','streak','best'].forEach(function(k){var n=Number(pxState[k]);pxState[k]=Number.isFinite(n)?Math.max(0,Math.min(100000,Math.floor(n))):0;});
    if(!['','bow','hat','scarf','glasses','crown'].includes(pxState.acc))pxState.acc='';
    var pxClamp = function (n) { return Math.max(0, Math.min(100, n)); };
    var pxLevel = function () { return 1 + [30,80,160,280,450,700,1000].filter(function (n) { return pxState.xp >= n; }).length; };
    var pxSay = function (s) { var b = document.getElementById('px-speech'); if (b) b.textContent = s; };
    var pxMarkDay = function () { var d=new Date(),today=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); if(pxState.day!==today){d.setDate(d.getDate()-1);var yesterday=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();pxState.streak=pxState.day===yesterday?pxState.streak+1:1;pxState.day=today;} };
    var pxSave = function () { pxState.last = Date.now(); try { localStorage.setItem(pxKey, JSON.stringify(pxState)); } catch (_) {} };
    var pxRender = function () {
      ['hunger','energy','love'].forEach(function (k) { var n = Math.round(pxState[k]); var bar = document.getElementById('px-'+k); var label = document.getElementById('px-'+k+'-label'); if(bar)bar.style.width=n+'%'; if(label)label.textContent=n+'%'; });
      var level=pxLevel(), base=[0,30,80,160,280,450,700,1000][Math.min(level-1,7)], next=[30,80,160,280,450,700,1000,1400][Math.min(level-1,7)];
      document.getElementById('px-name').textContent='Pexy'; document.getElementById('px-level').textContent='Nivel '+level+' · '+(pxState.hunger<20?'Hambriento':pxState.energy<20?'Cansado':pxState.love<20?'Triste':'Feliz');
      document.getElementById('px-xp').textContent=pxState.xp+' XP'; document.getElementById('px-xp-fill').style.width=Math.min(100,((pxState.xp-base)/(next-base))*100)+'%';
      document.getElementById('px-stage').dataset.mood=pxState.energy<20?'sueño':pxState.hunger<20?'hambre':'feliz';
      var equipped=document.getElementById('px-equipped');if(equipped){equipped.textContent=({bow:'🎀',hat:'🎩',scarf:'🧣',glasses:'🕶️',crown:'👑'})[pxState.acc]||'';equipped.hidden=!pxState.acc;}
      window.__novaPexyAccessory=pxState.acc;
    };
    var pxAct = function (action) {
      pxMarkDay();
      if(action==='feed'){if(pxState.hunger>94){pxSay('¡Estoy lleno! 😋');return;}pxState.hunger=pxClamp(pxState.hunger+28);pxState.love=pxClamp(pxState.love+3);pxState.xp+=4;pxSay('¡Ñam! Gracias por la comida 🍎');}
      if(action==='pet'){pxState.love=pxClamp(pxState.love+7);pxState.xp+=2;pxSay('¡Eso me hace cosquillas! 💜');}
      if(action==='sleep'){if(pxState.energy>88){pxSay('Todavía tengo energía. ¡Vamos a jugar!');return;}pxState.energy=pxClamp(pxState.energy+35);pxState.xp+=3;pxSay('Zzz… ¡Qué buen descanso! 😴');}
      if(action==='play'){if(pxState.energy<15){pxSay('Estoy cansado. Necesito dormir primero.');return;}pxState.energy=pxClamp(pxState.energy-12);pxState.hunger=pxClamp(pxState.hunger-5);pxState.love=pxClamp(pxState.love+10);pxState.xp+=5;pxSay('¡Eso estuvo genial! 🎮');}
      pxSave();pxRender();
    };
    document.querySelectorAll('[data-px-action]').forEach(function(b){b.addEventListener('click',function(){pxAct(b.getAttribute('data-px-action'));});});
    var pxAvatar = document.getElementById('px-web-model');
    if (pxAvatar) pxAvatar.addEventListener('click',function(){pxAct('pet');});
    document.querySelectorAll('[data-px-acc]').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-px-acc'),lvl=pxLevel(),ok=(id==='bow'&&lvl>=2)||(id==='hat'&&lvl>=3)||(id==='scarf'&&pxState.streak>=3)||(id==='glasses'&&lvl>=5)||(id==='crown'&&lvl>=8);var msg=document.getElementById('px-wardrobe-status');if(!ok){msg.textContent='Aún no está desbloqueado. Sigue cuidando a Pexy.';return;}pxState.acc=pxState.acc===id?'':id;msg.textContent=pxState.acc?'Accesorio equipado: '+b.textContent:'Accesorio retirado.';pxSave();});});
    var pxTap=function(){
      if(pxState.energy<10){pxSay('Estoy cansado.');return;}
      var dlg=document.createElement('dialog');dlg.className='px-game-dialog';
      var title=document.createElement('h3');title.textContent='🎋 Bambú veloz';
      var help=document.createElement('p');help.textContent='Pulsa el bambú tantas veces como puedas en 10 segundos.';
      var tap=document.createElement('button');tap.type='button';tap.className='px-tap-target';tap.textContent='🎋 ¡TOCA!';
      var status=document.createElement('p');status.textContent='0 puntos · 10 s';
      var close=document.createElement('button');close.type='button';close.textContent='Salir';
      dlg.append(title,help,tap,status,close);document.body.append(dlg);
      var count=0,ended=false,until=Date.now()+10000;
      var timer=setInterval(function(){var left=Math.max(0,Math.ceil((until-Date.now())/1000));status.textContent=count+' puntos · '+left+' s';if(!left)finish();},150);
      function finish(){if(ended)return;ended=true;pxMarkDay();clearInterval(timer);tap.disabled=true;pxState.xp+=Math.min(15,count);pxState.energy=pxClamp(pxState.energy-8);pxState.best=Math.max(pxState.best,count);pxSave();pxRender();document.getElementById('px-game-result').textContent='¡Conseguiste '+count+' puntos! Récord: '+pxState.best;pxSay('¡Buen trabajo! 🎋');status.textContent='Resultado: '+count+' puntos';close.textContent='Cerrar';}
      tap.addEventListener('click',function(){if(!ended){count++;tap.textContent='🎋 '+count;}});
      close.addEventListener('click',function(){if(!ended)finish();dlg.close();dlg.remove();});
      dlg.addEventListener('cancel',function(e){e.preventDefault();if(!ended)finish();dlg.close();dlg.remove();});
      dlg.showModal();
    };
    var tapGame = document.querySelector('[data-px-game="tap"]');
    if (tapGame) tapGame.addEventListener('click', pxTap);
    document.querySelector('[data-px-game="memory"]').addEventListener('click',function(){var seq=Array.from({length:4},function(){return Math.floor(Math.random()*4);}),names=['🍎','🍌','🍇','🍓'];var answer=window.prompt('Memoriza: '+seq.map(function(i){return names[i];}).join('  ')+'\nEscribe los emojis en el mismo orden:');pxMarkDay();if(answer===seq.map(function(i){return names[i];}).join('')){pxState.xp+=12;pxState.love=pxClamp(pxState.love+8);pxSay('¡Memoria perfecta! 🧠');document.getElementById('px-game-result').textContent='¡Ganaste 12 XP!';}else{pxSay('¡Casi! Practiquemos otra vez.');document.getElementById('px-game-result').textContent='La secuencia era '+seq.map(function(i){return names[i];}).join(' ');}pxSave();pxRender();});
    pxRender();
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