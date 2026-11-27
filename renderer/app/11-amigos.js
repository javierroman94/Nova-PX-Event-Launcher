/* Sección Amigos: estados, lista agrupada, solicitudes, invitaciones a jugar, party, bloquear y silenciar.
   Los avisos llegan en tiempo real desde el proceso principal (friends:event) y la lista se vuelve a pedir. */

const fr = { data: null, busy: null, again: false, timer: 0 };
const ST_ORDER = { playing: 0, online: 1, away: 2, dnd: 2, offline: 3 };
const ST_TEXT = { online: 'Disponible', away: 'Ausente', dnd: 'No molestar', invisible: 'Invisible' };

// Una sola petición a la vez; si llegan avisos mientras tanto, se repite al terminar.
function friendsRefresh() {
  if (fr.busy) { fr.again = true; return fr.busy; }
  fr.busy = (async () => {
    try {
      const r = await window.api.friendsList();
      fr.data = r && typeof r === 'object' && !Array.isArray(r) ? r : null;
    } catch { /* sin conexión: queda lo anterior */ }
    paintAllFriends();
  })().finally(() => {
    fr.busy = null;
    if (fr.again) { fr.again = false; friendsRefresh(); }
  });
  return fr.busy;
}
window.friendsRefresh = friendsRefresh;
window.frInvite = (f) => inviteFriend(f);
const refreshSoon = () => { clearTimeout(fr.timer); fr.timer = setTimeout(friendsRefresh, 350); };

function paintAllFriends() {
  const r = fr.data;
  if (window.paintHomeFriends && r) window.paintHomeFriends(r);
  paintBadge();
  if ($('page-friends').classList.contains('active')) paintFriendsPage();
}
function paintBadge() {
  const r = fr.data;
  const b = $('fr-badge');
  const n = r && r.loggedIn ? (r.incoming || []).length + (r.invites || []).length + (r.partyInvites || []).length + (r.friends || []).reduce((a, f) => a + (f.unread || 0), 0) : 0;
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : String(n);
}
const isMuted = (nick) => ((fr.data && fr.data.muted) || []).some((n) => n.toLowerCase() === String(nick).toLowerCase());
const statusOf = (f) => (f.playing ? 'playing' : f.online ? f.status || 'online' : 'offline');

/* ---------- menú pequeño (⋯) ---------- */
let openMenuEl = null;
function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
function popMenu(anchor, items) {
  closeMenu();
  const m = el('div', 'fr-menu');
  m.setAttribute('role', 'menu');
  items.filter(Boolean).forEach(([label, fn, danger]) => {
    const b = el('button', danger ? 'danger' : '', label);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeMenu(); fn(); });
    m.append(b);
  });
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = `${Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 4)}px`;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
  openMenuEl = m;
  setTimeout(() => m.querySelector('button')?.focus(), 0);
}
document.addEventListener('click', (e) => { if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest('.fr-more-btn')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* ---------- elegir a qué jugar (evento o un perfil) ---------- */
async function pickGame(title) {
  let packs = [];
  try { packs = (await window.api.modpackInstalled()).filter((p) => !p.protected && p.provider !== 'event'); } catch {}
  return new Promise((resolve) => {
    const m = openModal('fr-pick', title);
    m.body.append(el('strong', 'ask-text-title', title), el('p', 'muted', 'Si eliges un perfil, tu amigo lo recibe con un código y se le instala solo (solo lo que está en Modrinth).'));
    const list = el('div', 'fr-pick-list');
    const opt = (label, sub, value) => {
      const b = el('button', 'fr-pick-opt');
      b.type = 'button';
      b.append(el('strong', '', label), el('span', 'muted', sub));
      b.addEventListener('click', () => { done = true; resolve(value); m.close(); });
      list.append(b);
    };
    let done = false;
    opt('⭐ Evento de Nova PX', 'El evento que está publicado ahora', { kind: 'event' });
    packs.slice(0, 30).forEach((p) => opt(`${p.emoji ? p.emoji + ' ' : '📦 '}${p.title}`, `Minecraft ${p.mcVersion} · ${(p.loader && p.loader.type) || 'vanilla'}`, { kind: 'pack', id: p.id, title: p.title }));
    m.body.append(list);
    m.dlg.addEventListener('close', () => { if (!done) resolve(null); });
    m.open();
  });
}

// Entrar a lo que te invitaron (o a lo que eligió el líder de tu party).
async function joinGame(inv) {
  try {
    if (inv.k === 'event') { goTo('event'); setTimeout(() => $('play-btn').click(), 300); return true; }
    toast(`Preparando «${inv.t}»…`, 'info');
    const r = await window.api.friendsJoin(inv);
    if (r && r.packId) { await playPack(r.packId, r.joinHost ? { joinHost: r.joinHost } : {}); return true; }
  } catch (e) { toast(cleanError(e), 'error'); }
  return false;
}
// El líder también entra a lo que eligió.
async function playChoice(what) {
  if (what.kind === 'event') { goTo('event'); setTimeout(() => $('play-btn').click(), 300); } else playPack(what.id);
}

/* ---------- acciones sobre un amigo ---------- */
async function inviteFriend(f) {
  const what = await pickGame(`Invitar a ${f.nick} a jugar`);
  if (!what) return;
  try { await window.api.friendsInvite(f.nick, what); toast(`Invitación enviada a ${f.nick}`, 'success'); } catch (e) { toast(cleanError(e), 'error'); }
}
async function blockFriend(nick) {
  if (!(await askConfirm(`¿Bloquear a ${nick}? Dejará de ser tu amigo, se borrará la conversación y no podrá enviarte solicitudes ni mensajes.`, 'Bloquear', 'Cancelar'))) return;
  try { await window.api.friendsBlock(nick); toast(`${nick} quedó bloqueado`); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); }
}
async function removeFriend(nick) {
  if (!(await askConfirm(`¿Quitar a ${nick} de tus amigos? También se borrará la conversación.`, 'Quitar', 'Cancelar'))) return;
  try { await window.api.friendsRemove(nick); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); }
}
async function muteFriend(nick, on) {
  try { await window.api.friendsMute(nick, on); toast(on ? `No recibirás avisos de ${nick}` : `Vuelves a recibir avisos de ${nick}`); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); }
}
async function partyInvite(nick) {
  try {
    const p = fr.data && fr.data.party;
    if (!p) await window.api.friendsParty('create');
    await window.api.friendsParty('invite', nick);
    toast(`Invitaste a ${nick} a tu party`, 'success');
    friendsRefresh();
  } catch (e) { toast(cleanError(e), 'error'); }
}

/* ---------- página ---------- */
function verifiedBadge() { const b = el('span', 'fr-verified', '✓'); b.title = 'Nick verificado con su cuenta premium'; return b; }

function paintMe(r) {
  const box = $('fr-me');
  box.replaceChildren();
  const me = r.me || {};
  const top = el('div', 'fr-me-top');
  top.append(head3d({ nick: me.nick || 'Steve' }, 40));
  const who = el('div', 'fr-me-who');
  const name = el('strong', 'pii', me.nick || '');
  if (me.verified) name.append(verifiedBadge());
  who.append(name);
  if (me.verified) who.append(el('span', 'muted fr-small', 'Nick verificado con tu cuenta premium'));
  else if (me.premium) {
    const v = el('button', 'ghost fr-verify', 'Verificar mi nick');
    v.type = 'button';
    v.title = 'Confirma con Mojang que el nick es tuyo, así nadie más puede usarlo en amigos';
    v.addEventListener('click', async () => { v.disabled = true; const ok = await window.api.friendsVerify().catch(() => false); toast(ok ? 'Nick verificado' : 'Mojang no lo confirmó. Vuelve a iniciar sesión e inténtalo otra vez.', ok ? 'success' : 'error'); friendsRefresh(); });
    who.append(v);
  } else who.append(el('span', 'muted fr-small', 'Cuenta no premium: el nick no se puede verificar'));
  top.append(who);
  const sel = el('select', 'fr-status');
  sel.setAttribute('aria-label', 'Tu estado');
  Object.entries(ST_TEXT).forEach(([k, v]) => { const o = el('option', '', v); o.value = k; sel.append(o); });
  sel.value = me.status || 'online';
  const msg = el('input', 'fr-smsg');
  msg.type = 'text';
  msg.maxLength = 60;
  msg.placeholder = 'Estado (ej. «Buscando equipo»)';
  msg.value = me.smsg || '';
  msg.setAttribute('aria-label', 'Mensaje de estado');
  const save = async () => { try { await window.api.friendsStatus(sel.value, msg.value); toast('Estado actualizado'); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); } };
  sel.addEventListener('change', save);
  msg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  msg.addEventListener('blur', () => { if (msg.value !== (me.smsg || '')) save(); });
  const row = el('div', 'fr-me-status');
  row.append(el('span', `live-dot st-${sel.value}`), sel);
  box.append(top, row, msg);
}

function inboxCard(icon, text, actions) {
  const c = el('div', 'fr-inbox-item');
  c.append(el('span', 'fr-inbox-ico', icon), el('span', 'fr-inbox-text', text));
  const a = el('div', 'fr-inbox-actions');
  actions.forEach(([label, fn, primary]) => { const b = el('button', primary ? 'primary' : 'ghost', label); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; await fn(); }); a.append(b); });
  c.append(a);
  return c;
}
function paintInbox(r) {
  const box = $('fr-inbox');
  box.replaceChildren();
  (r.invites || []).forEach((inv) => {
    const what = inv.k === 'event' ? `el evento «${inv.t}»` : `«${inv.t}»`;
    box.append(inboxCard(inv.party ? '🎉' : '🎮', `${inv.from} ${inv.party ? '(tu party)' : ''} te invita a jugar ${what}`, [
      ['Unirme', async () => { await window.api.friendsDismiss(inv.id).catch(() => {}); await joinGame(inv); friendsRefresh(); }, true],
      ['Ignorar', async () => { await window.api.friendsDismiss(inv.id).catch(() => {}); friendsRefresh(); }]
    ]));
  });
  (r.partyInvites || []).forEach((pi) => {
    box.append(inboxCard('👥', `${pi.from} te invitó a su party`, [
      ['Unirme', async () => { try { await window.api.friendsParty('join', pi.id); toast('Entraste a la party', 'success'); } catch (e) { toast(cleanError(e), 'error'); } friendsRefresh(); }, true],
      ['Ignorar', async () => { await window.api.friendsDismiss(pi.id).catch(() => {}); friendsRefresh(); }]
    ]));
  });
  (r.incoming || []).forEach((n) => {
    box.append(inboxCard('🤝', `${n} quiere ser tu amigo`, [
      ['Aceptar', async () => { try { await window.api.friendsAccept(n); toast(`¡Ahora eres amigo de ${n}!`, 'success'); } catch (e) { toast(cleanError(e), 'error'); } friendsRefresh(); }, true],
      ['Rechazar', async () => { try { await window.api.friendsRemove(n); } catch {} friendsRefresh(); }],
      ['Bloquear', async () => { await blockFriend(n); }]
    ]));
  });
  (r.outgoing || []).forEach((n) => {
    box.append(inboxCard('📨', `Solicitud enviada a ${n}`, [['Cancelar', async () => { try { await window.api.friendsRemove(n); } catch {} friendsRefresh(); }]]));
  });
}

function paintParty(r) {
  const box = $('fr-party');
  box.replaceChildren();
  const p = r.party;
  const head = el('div', 'fr-box-head');
  head.append(el('strong', '', '👥 Party'));
  box.append(head);
  if (!p) {
    box.append(el('p', 'muted fr-small', 'Arma un grupo de hasta 8 amigos y entren juntos al evento o a un perfil.'));
    const b = el('button', 'primary', 'Crear party');
    b.type = 'button';
    b.addEventListener('click', async () => { try { await window.api.friendsParty('create'); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); } });
    box.append(b);
    return;
  }
  const me = (r.me && r.me.nick) || '';
  const leader = p.leader.toLowerCase() === me.toLowerCase();
  const ul = el('ul', 'fr-party-list');
  p.members.forEach((m) => {
    const li = el('li');
    li.append(el('span', `live-dot${m.online ? '' : ' off'}`), head3d({ nick: m.nick }, 22), el('span', 'pii', m.nick));
    if (m.nick.toLowerCase() === p.leader.toLowerCase()) li.append(el('span', 'fr-crown', '👑'));
    if (m.playing) li.append(el('span', 'muted fr-small', 'jugando'));
    if (leader && m.nick.toLowerCase() !== me.toLowerCase()) {
      const k = el('button', 'ghost fr-kick', '✕');
      k.type = 'button';
      k.setAttribute('aria-label', `Sacar a ${m.nick} de la party`);
      k.addEventListener('click', async () => { try { await window.api.friendsParty('kick', m.nick); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); } });
      li.append(k);
    }
    ul.append(li);
  });
  (p.invited || []).forEach((n) => { const li = el('li', 'pending'); li.append(el('span', 'live-dot off'), el('span', 'pii', n), el('span', 'muted fr-small', 'invitado')); ul.append(li); });
  box.append(ul);
  const acts = el('div', 'mp-actions fr-party-actions');
  if (leader) {
    const free = (r.friends || []).filter((f) => !p.members.some((m) => m.nick.toLowerCase() === f.nick.toLowerCase()) && !(p.invited || []).some((n) => n.toLowerCase() === f.nick.toLowerCase()));
    if (free.length && p.members.length + (p.invited || []).length < 8) {
      const sel = el('select', 'fr-party-sel');
      sel.setAttribute('aria-label', 'Invitar a la party');
      sel.append(el('option', '', 'Invitar a…'));
      sel.firstChild.value = '';
      free.forEach((f) => { const o = el('option', '', `${f.nick}${f.online ? '' : ' (desconectado)'}`); o.value = f.nick; sel.append(o); });
      sel.addEventListener('change', () => { if (sel.value) partyInvite(sel.value); });
      acts.append(sel);
    }
    const go = el('button', 'primary', '▶ Jugar juntos');
    go.type = 'button';
    go.disabled = p.members.length < 2;
    go.title = p.members.length < 2 ? 'Invita al menos a un amigo' : 'Avisa a todos y entra';
    go.addEventListener('click', async () => {
      const what = await pickGame('¿A qué juegan?');
      if (!what) return;
      try { await window.api.friendsParty('start', what); toast('Avisé a tu party', 'success'); playChoice(what); } catch (e) { toast(cleanError(e), 'error'); }
    });
    acts.append(go);
  }
  const leave = el('button', 'ghost', 'Salir');
  leave.type = 'button';
  leave.addEventListener('click', async () => { try { await window.api.friendsParty('leave'); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); } });
  acts.append(leave);
  box.append(acts);
}

function friendRow(f, r) {
  const st = statusOf(f);
  const row = el('div', `fr-row st-${st}`);
  const face = el('span', 'fr-face');
  face.append(head3d({ nick: f.nick }, 30), el('span', `fr-dot st-${st}`));
  const info = el('div', 'fr-info');
  const name = el('strong', 'pii', f.nick);
  if (f.verified) name.append(verifiedBadge());
  if (isMuted(f.nick)) { const m = el('span', 'fr-muted', '🔕'); m.title = 'Silenciado'; name.append(m); }
  info.append(name, el('span', 'muted fr-line', friendLine(f)));
  info.tabIndex = 0;
  info.setAttribute('role', 'button');
  info.title = `Ver el perfil de ${f.nick}`;
  info.addEventListener('click', () => window.openFriendCard && window.openFriendCard(f));
  info.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.openFriendCard && window.openFriendCard(f); });
  const acts = el('div', 'fr-acts');
  const chat = el('button', 'ghost', 'Chatear');
  chat.type = 'button';
  if (f.unread) chat.append(el('span', 'friend-badge', String(Math.min(f.unread, 9))));
  chat.addEventListener('click', () => openChat(f));
  const inv = el('button', 'ghost', 'Invitar');
  inv.type = 'button';
  inv.title = 'Invitar a jugar';
  inv.addEventListener('click', () => inviteFriend(f));
  const more = el('button', 'ghost fr-more-btn', '⋯');
  more.type = 'button';
  more.setAttribute('aria-label', `Más opciones para ${f.nick}`);
  const leaderOrFree = !r.party || (r.me && r.party.leader.toLowerCase() === String(r.me.nick).toLowerCase());
  more.addEventListener('click', () => popMenu(more, [
    ['Ver perfil', () => window.openFriendCard && window.openFriendCard(f)],
    leaderOrFree && !(r.party && r.party.members.some((m) => m.nick.toLowerCase() === f.nick.toLowerCase())) ? ['Invitar a mi party', () => partyInvite(f.nick)] : null,
    isMuted(f.nick) ? ['Activar avisos', () => muteFriend(f.nick, false)] : ['Silenciar avisos', () => muteFriend(f.nick, true)],
    ['Quitar amigo', () => removeFriend(f.nick), true],
    ['Bloquear', () => blockFriend(f.nick), true]
  ]));
  acts.append(chat, inv, more);
  row.append(face, info, acts);
  return row;
}

function paintList(r) {
  const host = $('fr-list');
  host.replaceChildren();
  const q = $('fr-search').value.trim().toLowerCase();
  const list = (r.friends || []).filter((f) => !q || f.nick.toLowerCase().includes(q));
  $('fr-count').textContent = r.friends && r.friends.length ? `${r.friends.filter((f) => f.online).length} de ${r.friends.length} en línea` : '';
  if (!(r.friends || []).length) {
    const box = el('div', 'empty-state');
    box.append(el('div', 'empty-ico', '🤝'), el('strong', 'empty-title', 'Todavía no tienes amigos aquí'), el('p', 'muted', 'Escribe el nick de un amigo a la izquierda. Cuando acepte, podrán chatear, invitarse a jugar y armar una party.'));
    host.append(box);
    return;
  }
  const groups = [['playing', 'Jugando'], ['online', 'En línea'], ['away', 'Ausentes y ocupados'], ['offline', 'Desconectados']];
  groups.forEach(([key, label]) => {
    const items = list.filter((f) => { const s = statusOf(f); return key === 'away' ? s === 'away' || s === 'dnd' : s === key; }).sort((a, b) => (b.unread || 0) - (a.unread || 0) || a.nick.localeCompare(b.nick));
    if (!items.length) return;
    host.append(el('h3', 'fr-group', `${label} · ${items.length}`));
    items.forEach((f) => host.append(friendRow(f, r)));
  });
  if (!list.length) host.append(el('p', 'muted', 'Ningún amigo coincide con la búsqueda.'));
}

function paintBlocked(r) {
  const box = $('fr-blocked-box');
  const list = r.blocked || [];
  box.hidden = !list.length;
  $('fr-blocked-sum').textContent = `Bloqueados (${list.length})`;
  const host = $('fr-blocked');
  host.replaceChildren();
  list.forEach((n) => {
    const row = el('div', 'fr-blocked-row');
    const b = el('button', 'ghost', 'Desbloquear');
    b.type = 'button';
    b.addEventListener('click', async () => { try { await window.api.friendsUnblock(n); friendsRefresh(); } catch (e) { toast(cleanError(e), 'error'); } });
    row.append(el('span', 'pii', n), b);
    host.append(row);
  });
}

function paintFriendsPage() {
  const r = fr.data;
  const note = $('fr-note');
  if (!r || !r.enabled) { note.textContent = 'La función de amigos no está disponible en este launcher.'; return; }
  const on = r.loggedIn;
  ['fr-me', 'fr-add', 'fr-inbox', 'fr-party'].forEach((id) => { $(id).hidden = !on; });
  if (!on) { note.textContent = 'Inicia sesión para usar amigos.'; $('fr-list').replaceChildren(); return; }
  note.textContent = !r.reachable ? r.error || 'No se pudo conectar ahora. Reintentando…' : !r.sharing ? 'Tienes desactivado «compartir uso» en Ajustes: tus amigos te verán desconectado.' : '';
  paintMe(r);
  paintInbox(r);
  paintParty(r);
  paintList(r);
  paintBlocked(r);
}
window.friendsShow = () => { paintFriendsPage(); friendsRefresh(); };

$('fr-search').addEventListener('input', () => fr.data && paintList(fr.data));
$('fr-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('fr-add-input').value.trim();
  if (!n) return;
  try {
    const st = await window.api.friendsAdd(n);
    $('fr-add-input').value = '';
    toast(st === 'accepted' ? `¡Ahora eres amigo de ${n}!` : `Solicitud enviada a ${n}`, 'success');
    friendsRefresh();
  } catch (err) { $('fr-note').textContent = cleanError(err); }
});

/* ---------- avisos en tiempo real ---------- */
window.api.onFriendsEvent((evt) => {
  if (!evt || typeof evt !== 'object') return;
  if (window.chatOnEvent && window.chatOnEvent(evt) && evt.t === 'typing') return;
  if (evt.t === 'typing') return;
  const from = evt.from || '';
  const quiet = from && isMuted(from);
  const chatting = window.chatWithNick && window.chatWithNick() && from && window.chatWithNick().toLowerCase() === from.toLowerCase();
  if (evt.t === 'msg' && !quiet && !chatting) toast(`💬 ${from} te escribió`, 'info');
  if (evt.t === 'req') toast(`🤝 ${from} quiere ser tu amigo`, 'info');
  if (evt.t === 'accepted') toast(`¡${from} aceptó tu solicitud!`, 'success');
  if (evt.t === 'invite' && !quiet) toast(`🎮 ${from} te invita a jugar · mira Amigos`, 'info');
  if (evt.t === 'party_inv' && !quiet) toast(`👥 ${from} te invitó a su party`, 'info');
  refreshSoon();
});
window.api.onFriendsOpen((o) => {
  goTo('friends');
  if (o && o.chat) {
    const f = (fr.data && fr.data.friends || []).find((x) => x.nick.toLowerCase() === String(o.chat).toLowerCase()) || { nick: o.chat };
    openChat(f);
  }
});

friendsRefresh();
setInterval(() => { if (!document.hidden) friendsRefresh(); }, 60 * 1000);
