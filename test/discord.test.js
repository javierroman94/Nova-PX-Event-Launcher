'use strict';
const assert = require('assert');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DiscordRpc, buildActivity, ipcPaths, OP } = require('../lib/discord-rpc');

// --- actividad: textos recortados y solo botones de invitación https de Discord
const a = buildActivity({ mode: 'playing', eventName: 'x'.repeat(300), startedAt: 5000, invite: 'https://discord.gg/VAfuFEQtjv', largeImage: 'logo' });
assert.strictEqual(a.details.length, 128);
assert.strictEqual(a.timestamps.start, 5);
assert.deepStrictEqual(a.buttons, [{ label: 'Unirse al Discord', url: 'https://discord.gg/VAfuFEQtjv' }]);
assert.strictEqual(buildActivity({ mode: 'idle', invite: 'javascript:alert(1)' }).buttons, undefined);
assert.strictEqual(buildActivity({ mode: 'idle', invite: 'https://evil.com/discord.gg/abc' }).buttons, undefined);
assert.strictEqual(ipcPaths('win32')[0], '\\\\?\\pipe\\discord-ipc-0');
assert.ok(ipcPaths('linux', { XDG_RUNTIME_DIR: '/run/u' })[3].endsWith('discord-ipc-3'));

// --- protocolo contra un "Discord" falso
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-'));
const sock = path.join(dir, 'discord-ipc-0');
const seen = [];
const server = net.createServer((c) => {
  let buf = Buffer.alloc(0);
  c.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 8) {
      const op = buf.readInt32LE(0), len = buf.readInt32LE(4);
      if (buf.length < 8 + len) return;
      const msg = JSON.parse(buf.subarray(8, 8 + len).toString());
      buf = buf.subarray(8 + len);
      seen.push({ op, msg });
      if (op === OP.HANDSHAKE) {
        const body = Buffer.from(JSON.stringify({ cmd: 'DISPATCH', evt: 'READY', data: {} }));
        const head = Buffer.alloc(8);
        head.writeInt32LE(OP.FRAME, 0); head.writeInt32LE(body.length, 4);
        c.write(Buffer.concat([head, body]));
      }
    }
  });
});

server.listen(sock, async () => {
  const rpc = new DiscordRpc({ clientId: '1458487098389696734', paths: [path.join(dir, 'discord-ipc-9'), sock], retryMs: 50 });
  rpc.setActivity(buildActivity({ mode: 'idle' })); // se pone ANTES de conectar: debe enviarse al estar listo
  rpc.start();
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(seen[0].op, OP.HANDSHAKE);
  assert.strictEqual(seen[0].msg.client_id, '1458487098389696734');
  const first = seen.find((s) => s.msg.cmd === 'SET_ACTIVITY');
  assert.ok(first, 'envió la actividad pendiente al conectar');
  assert.strictEqual(first.msg.args.activity.details, 'En el launcher');
  rpc.setActivity(buildActivity({ mode: 'playing', eventName: 'OneBlock' }));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(seen.some((s) => s.msg.args && s.msg.args.activity && s.msg.args.activity.details === 'OneBlock'));
  rpc.stop();
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(seen[seen.length - 1].msg.args.activity, null, 'al cerrar limpia la actividad');

  // sin Discord abierto no pasa nada (ni errores ni procesos colgados)
  const lonely = new DiscordRpc({ clientId: '1458487098389696734', paths: [path.join(dir, 'no-existe')], retryMs: 20 });
  lonely.start();
  await new Promise((r) => setTimeout(r, 120));
  lonely.stop();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ok  discord: handshake, actividad, limpieza y reintentos sin Discord');
});
