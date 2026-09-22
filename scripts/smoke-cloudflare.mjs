// Exercises real production APIs using newly generated, unfunded Solana keys.
// No fixture SQL, existing player writes, token transfers, or wallet funds.
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import WebSocket from 'ws';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'https://play.noobius.io')
  throw Error('Set NOOBIUS_TEST_ORIGIN=https://play.noobius.io explicitly');
const { Client } = await import('../tests/api-client.mjs');
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = [],
  sockets = [];
async function client(i) {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = base58.encode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const c = new Client({ address });
  c.body = (body) => ({ expectedWallet: 'solana:' + address, ...body });
  const authRequest = async (action, body) => {
    let response = await c.request(action, body);
    if (response.status === 429) {
      console.log(
        'Authentication rate limit enforced; waiting for next minute',
      );
      await sleep(60200 - (Date.now() % 60000));
      response = await c.request(action, body);
    }
    return ok(response);
  };
  c.login = async () => {
    const nonce = await authRequest('nonce', { address, ecosystem: 'solana' });
    const signature =
      '0x' +
      Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          keys.privateKey,
          new TextEncoder().encode(nonce.message),
        ),
      ).toString('hex');
    return authRequest('verify', { signature });
  };
  const initial = await c.login();
  clients.push(c);
  ok(await c.request('name', c.body({ name: 'Launch Check ' + i })));
  const again = i === 0 ? await c.login() : ok(await c.request('profile'));
  assert.equal(again.profile.id, initial.profile.id);
  assert.equal(again.profile.name, 'Launch Check ' + i);
  c.profile = again.profile;
  c.controller = { clientId: crypto.randomUUID(), generation: 0 };
  return c;
}
class Room {
  messages = [];
  constructor(id) {
    this.ws = new WebSocket('wss://rooms.noobius.io/rooms/' + id, { origin });
    sockets.push(this.ws);
    this.ready = new Promise((r, j) => {
      this.ws.once('open', r);
      this.ws.once('error', j);
    });
    this.ws.on('message', (v) => this.messages.push(JSON.parse(String(v))));
    this.ws.on('close', (code, reason) => {
      this.closed = { code, reason: String(reason) };
    });
  }
  async wait(type, predicate = () => true, timeoutMs = 15000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const i = this.messages.findIndex((m) => m.type === type && predicate(m));
      if (i >= 0) return this.messages.splice(i, 1)[0];
      if (this.ws.readyState === WebSocket.CLOSED)
        throw Error(
          'Socket closed waiting for ' +
            type +
            ': ' +
            JSON.stringify(this.closed) +
            '; recent frames: ' +
            JSON.stringify(this.messages.slice(-3)),
        );
      await sleep(30);
    }
    throw Error(
      'Timed out waiting for ' + type + ' ' + JSON.stringify(this.messages),
    );
  }
  async join(c) {
    await this.ready;
    const ticket = ok(
      await c.request('room-ticket', c.body(c.controller)),
    ).ticket;
    this.ws.send(JSON.stringify({ type: 'join', ticket }));
    const joined = await this.wait('joined');
    this.connectionId = joined.connectionId;
    return joined;
  }
  send(body) {
    this.ws.send(JSON.stringify({ connectionId: this.connectionId, ...body }));
  }
}
try {
  let target;
  const rooms = [];
  for (let i = 0; i < 5; i++) {
    const c = await client(i);
    const m = ok(
      await c.request(
        'neighborhood-join',
        c.body({
          ...c.controller,
          realm: 'commons',
          ...(target ? { target } : {}),
        }),
      ),
    ).membership;
    target = m.neighborhoodId;
    c.controller.generation = m.generation;
    const room = new Room(target);
    await room.join(c);
    rooms.push(room);
    console.log('PASS Solana login, save/relogin, room admission:', i + 1);
  }
  for (const r of rooms) {
    const m = await r.wait('players', (m) => m.people.length === 5);
    assert.equal(new Set(m.people.map((p) => p.id)).size, 5);
    for (const field of ['session_hash', 'inventory', 'credits', 'grant'])
      assert.ok(!JSON.stringify(m).includes(field));
  }
  console.log(
    'PASS five real hosted sockets see each other; no private economy data',
  );
  const sixth = await client(5);
  assert.equal(
    (
      await sixth.request(
        'neighborhood-join',
        sixth.body({ ...sixth.controller, realm: 'commons', target }),
      )
    ).status,
    409,
  );
  console.log('PASS sixth player rejected from full neighborhood');
  await sleep(200);
  rooms[0].send({ type: 'move', inputSequence: 1, x: 0, z: 16.5 });
  assert.equal((await rooms[0].wait('move-ack')).accepted, true);
  await rooms[1].wait('players', (m) =>
    m.people.some((p) => p.id === clients[0].profile.id && p.z === 16.5),
  );
  rooms[0].send({ type: 'move', inputSequence: 2, x: 29, z: -30 });
  assert.equal((await rooms[0].wait('move-ack')).accepted, false);
  console.log('PASS movement replication and teleport rejection');
  const unsigned = await fetch(origin + '/api/noobius-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.ok([401, 403].includes(unsigned.status));
  console.log('PASS unsigned room service rejected');
  if (process.env.NOOBIUS_TEST_LONG_ROOMS === '1') {
    console.log('Waiting for the real five-minute room grant renewal');
    await rooms[0].wait('renew', () => true, 310000);
    const renewed = new Room(target);
    const joined = await renewed.join(clients[0]);
    assert.equal(joined.membership.z, 16.5);
    assert.equal(
      joined.membership.generation,
      clients[0].controller.generation,
    );
    await sleep(200);
    renewed.send({ type: 'move', inputSequence: 1, x: 0, z: 16.5 });
    const resumedMove = await renewed.wait('move-ack');
    assert.equal(resumedMove.accepted, true, JSON.stringify(resumedMove));
    console.log(
      'PASS hosted five-minute renewal preserves position and controller',
    );
  }
  console.log('HOSTED SMOKE PASSED');
} finally {
  for (const s of sockets) s.terminate();
  for (const c of clients) {
    await c.request('neighborhood-leave', c.body(c.controller)).catch(() => {});
    await c.request('logout', c.body()).catch(() => {});
  }
}
