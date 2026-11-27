'use strict';
// Ping directo a servidores (lib/ping.js) contra un servidor de Minecraft falso en este equipo.
const assert = require('assert');
const net = require('net');
const ping = require('../lib/ping');

// VarInt de ida y vuelta (incluido -1, que Minecraft escribe en 5 bytes)
for (const n of [0, 1, 127, 128, 255, 25565, 2097151, 2147483647, -1]) {
  const r = ping.readVarInt(ping.varInt(n), 0);
  assert.strictEqual(r.value, n);
}
assert.strictEqual(ping.varInt(-1).length, 5);
assert.strictEqual(ping.readVarInt(Buffer.from([0x80]), 0), null, 'VarInt a medias: espera más datos');

// Mensaje del servidor: texto, componentes con "extra" y códigos de color
assert.strictEqual(ping.motdText('§aHola §lmundo'), 'Hola mundo');
assert.strictEqual(ping.motdText({ text: 'Nova ', extra: [{ text: 'PX', color: 'gold' }, '\n', { text: 'Evento' }] }), 'Nova PX\nEvento');
const st = ping.parseStatus({
  version: { name: '§cPaper 1.21.1', protocol: 767 },
  players: { max: 100, online: 7, sample: [{ name: 'Steve' }, { name: '§eAlex' }, { id: 'x' }] },
  description: { text: 'Bienvenido' },
  favicon: 'data:image/png;base64,iVBORw0KGgo='
});
assert.deepStrictEqual(st.players, { online: 7, max: 100, sample: ['Steve', 'Alex'] });
assert.strictEqual(st.version, 'Paper 1.21.1');
assert.strictEqual(st.icon, 'data:image/png;base64,iVBORw0KGgo=');
// Datos raros o maliciosos se limpian
const bad = ping.parseStatus({ players: { online: -5, max: 'muchos' }, favicon: 'javascript:alert(1)', version: { name: { a: 1 } } });
assert.strictEqual(bad.icon, '');
assert.strictEqual(bad.players.online, 0);
assert.strictEqual(bad.version, '');

// Entrar directo: Quick Play desde 1.20, --server antes
assert.deepStrictEqual(ping.joinOptions('1.21.1', 'mc.ejemplo.com', 25565), { quickPlay: { type: 'multiplayer', identifier: 'mc.ejemplo.com' } });
assert.deepStrictEqual(ping.joinOptions('1.20', 'mc.ejemplo.com', 25570), { quickPlay: { type: 'multiplayer', identifier: 'mc.ejemplo.com:25570' } });
assert.deepStrictEqual(ping.joinOptions('1.19.4', 'mc.ejemplo.com', 25565), { server: { host: 'mc.ejemplo.com', port: '25565' } });
assert.strictEqual(ping.mcAtLeast('1.8.9', '1.20'), false);

function fakeServer({ pong = true, status } = {}) {
  return net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let step = 0;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (let pk = ping.takePacket(buf); pk; pk = ping.takePacket(buf)) {
        buf = pk.rest;
        if (step === 0 && pk.id === 0) { step = 1; continue; } // handshake
        if (step === 1 && pk.id === 0) {
          step = 2;
          const json = Buffer.from(JSON.stringify(status || { version: { name: '1.21.1', protocol: 767 }, players: { online: 3, max: 20 }, description: 'Servidor de prueba' }));
          const body = Buffer.concat([ping.varInt(0), ping.varInt(json.length), json]);
          sock.write(Buffer.concat([ping.varInt(body.length), body]));
          if (!pong) setTimeout(() => sock.end(), 10);
          continue;
        }
        if (step === 2 && pk.id === 1 && pong) {
          const body = Buffer.concat([ping.varInt(1), pk.body]);
          sock.write(Buffer.concat([ping.varInt(body.length), body]));
        }
      }
    });
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

(async () => {
  // Servidor normal: estado + pong
  const a = fakeServer();
  const portA = await listen(a);
  const r = await ping.ping('127.0.0.1', portA, { timeout: 3000 });
  assert.strictEqual(r.online, true);
  assert.strictEqual(r.players.online, 3);
  assert.strictEqual(r.motd, 'Servidor de prueba');
  assert.ok(r.ms >= 1 && r.ms < 3000, 'latencia medida');
  a.close();

  // Servidor que no contesta el pong: igual devuelve el estado con el tiempo de respuesta
  const b = fakeServer({ pong: false });
  const portB = await listen(b);
  const r2 = await ping.ping('127.0.0.1', portB, { timeout: 3000 });
  assert.strictEqual(r2.players.max, 20);
  b.close();

  // Puerto cerrado: error
  const c = net.createServer();
  const portC = await listen(c);
  c.close();
  await new Promise((res) => setTimeout(res, 20));
  await assert.rejects(ping.ping('127.0.0.1', portC, { timeout: 1500 }));

  // Registro SRV: se usa si la dirección no trae puerto
  const resolver = { resolveSrv: async () => [{ name: 'play.ejemplo.net.', port: 25599, priority: 0, weight: 5 }] };
  assert.deepStrictEqual(await ping.resolveTarget('ejemplo.net', 25565, { resolver }), { host: 'play.ejemplo.net', port: 25599 });
  assert.deepStrictEqual(await ping.resolveTarget('ejemplo.net', 25570, { explicitPort: true, resolver }), { host: 'ejemplo.net', port: 25570 });
  assert.deepStrictEqual(await ping.resolveTarget('127.0.0.1', 25565, { resolver }), { host: '127.0.0.1', port: 25565 });
  console.log('ping.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
