'use strict';

/*
 * Discord Rich Presence sin librerías: habla directamente con el cliente de Discord por su canal local (IPC).
 * Si Discord no está abierto, reintenta en silencio cada cierto tiempo. Nunca bloquea ni rompe el launcher.
 */

const net = require('net');
const path = require('path');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

// Rutas donde Discord abre su canal (de discord-ipc-0 a discord-ipc-9).
function ipcPaths(platform = process.platform, env = process.env) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    if (platform === 'win32') out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    else {
      const base = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp';
      out.push(path.join(base, `discord-ipc-${i}`));
    }
  }
  return out;
}

function encode(op, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const clip = (s, n) => String(s || '').trim().slice(0, n);

// Arma la actividad que se muestra en el perfil. Todo texto se recorta a lo que Discord admite.
function buildActivity({ mode, eventName, startedAt, invite, largeImage }) {
  const act = { assets: {} };
  if (largeImage) {
    act.assets.large_image = clip(largeImage, 256);
    act.assets.large_text = 'Nova PX - Event Launcher';
  }
  if (mode === 'playing') {
    act.details = clip(eventName || 'Evento', 128);
    act.state = 'Jugando el evento';
    if (startedAt) act.timestamps = { start: Math.floor(startedAt / 1000) };
  } else {
    act.details = 'En el launcher';
    act.state = 'Preparando el próximo evento';
  }
  if (/^https:\/\/discord\.gg\/[A-Za-z0-9-]{2,32}$/.test(String(invite || ''))) {
    act.buttons = [{ label: 'Unirse al Discord', url: invite }];
  }
  return act;
}

class DiscordRpc {
  constructor({ clientId, retryMs = 30000, paths = ipcPaths(), connect = net.connect, log = () => {} } = {}) {
    this.clientId = String(clientId || '');
    this.retryMs = retryMs;
    this.paths = paths;
    this.connect = connect;
    this.log = log;
    this.socket = null;
    this.ready = false;
    this.running = false;
    this.activity = null;
    this.timer = null;
    this.buf = Buffer.alloc(0);
  }

  start() {
    if (!/^\d{15,25}$/.test(this.clientId) || this.running) return;
    this.running = true;
    this._attempt();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.socket) {
      try {
        if (this.ready) this.socket.write(encode(OP.FRAME, this._frame(null)));
      } catch {}
      try {
        this.socket.destroy();
      } catch {}
    }
    this.socket = null;
    this.ready = false;
  }

  setActivity(activity) {
    this.activity = activity;
    if (this.ready) this._send();
  }

  _frame(activity) {
    return {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: activity || null },
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
  }

  _send() {
    try {
      this.socket.write(encode(OP.FRAME, this._frame(this.activity)));
    } catch {}
  }

  _retry() {
    this.socket = null;
    this.ready = false;
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._attempt(), this.retryMs);
    if (this.timer.unref) this.timer.unref(); // no impide que el launcher se cierre
  }

  _attempt(i = 0) {
    if (!this.running) return;
    if (i >= this.paths.length) return this._retry();
    let opened = false;
    const sock = this.connect(this.paths[i]);
    sock.once('error', () => {
      if (!opened) this._attempt(i + 1);
    });
    sock.once('connect', () => {
      opened = true;
      this.socket = sock;
      this.buf = Buffer.alloc(0);
      sock.on('data', (d) => this._onData(d));
      sock.on('close', () => {
        if (this.socket === sock) this._retry();
      });
      sock.on('error', () => {});
      sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (len < 0 || len > 1 << 20) return this.socket && this.socket.destroy();
      if (this.buf.length < 8 + len) return;
      const body = this.buf.subarray(8, 8 + len).toString('utf8');
      this.buf = this.buf.subarray(8 + len);
      let msg = {};
      try {
        msg = JSON.parse(body);
      } catch {}
      if (op === OP.PING) this.socket.write(encode(OP.PONG, msg));
      else if (op === OP.CLOSE) this.socket.destroy();
      else if (op === OP.FRAME && msg.evt === 'READY') {
        this.ready = true;
        if (this.activity) this._send();
      }
    }
  }
}

module.exports = { DiscordRpc, buildActivity, ipcPaths, encode, OP };
