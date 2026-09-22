// Real RoomClient transport against the deployed service, with generated Solana
// sign-in and an intentional dropped connection. No fixture writes or transfers.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { base58 } from '@scure/base';
import { RoomClient } from '../lib/room-client.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'https://play.noobius.io')
  throw Error('Explicit production smoke origin required');
const { Client } = await import('../tests/api-client.mjs');
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keys = await crypto.subtle.generateKey('Ed25519', true, [
  'sign',
  'verify',
]);
const address = base58.encode(
  new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
);
const c = new Client({ address });
c.body = (body) => ({ expectedWallet: 'solana:' + address, ...body });
const nonce = ok(await c.request('nonce', { address, ecosystem: 'solana' }));
const signature =
  '0x' +
  Buffer.from(
    await crypto.subtle.sign(
      'Ed25519',
      keys.privateKey,
      new TextEncoder().encode(nonce.message),
    ),
  ).toString('hex');
ok(await c.request('verify', { signature }));
ok(await c.request('name', c.body({ name: 'Recovery Check' })));
const controller = { clientId: crypto.randomUUID(), generation: 0 };
const joined = ok(
  await c.request(
    'neighborhood-join',
    c.body({ ...controller, realm: 'commons' }),
  ),
);
controller.generation = joined.membership.generation;
let membership = joined.membership,
  point = { x: membership.x, z: membership.z },
  transport,
  socket,
  ready = false,
  stopped = false,
  reconnectRequested = false;
const disconnects = [];
let connections = 0;
async function connect() {
  const state = ok(await c.request('neighborhood-state', c.body(controller)));
  membership = state.membership;
  point = { x: membership.x, z: membership.z };
  const ticket = ok(await c.request('room-ticket', c.body(controller))).ticket;
  transport = new RoomClient({
    coordinatorOrigin: 'https://rooms.noobius.io',
    ticket,
    membership,
    readPosition: () => point,
    onMembership: (m, reset) => {
      membership = m;
      if (reset) point = { x: m.x, z: m.z };
    },
    onPeople: () => {},
    onCorrection: (p) => {
      point = p;
    },
    onReady: (r) => {
      ready = r;
    },
    onDisconnect: (reason) => {
      if (!stopped) {
        disconnects.push(reason);
        reconnectRequested = true;
        console.log('Transport reconnect requested:', reason);
      }
    },
    createSocket: (url) => {
      socket = new WebSocket(url, { origin });
      socket.on('close', (code, reason) =>
        console.log('Socket closed:', code, String(reason)),
      );
      return socket;
    },
  });
  await transport.connect();
  connections++;
  console.log(
    'Connected:',
    connections,
    'position',
    membership.x,
    membership.z,
  );
}
try {
  await connect();
  await sleep(250);
  point = { x: 0, z: 16.5 };
  assert.equal(await transport.syncPosition(), true);
  await sleep(6000);
  assert.equal(membership.z, 16.5);
  console.log('PASS movement checkpoint persisted before disconnect');
  socket.terminate();
  await sleep(1000);
  assert.ok(reconnectRequested);
  reconnectRequested = false;
  await connect();
  assert.equal(membership.z, 16.5);
  console.log('PASS actual RoomClient reconnect preserved saved position');
  const deadline = Date.now() + 320000;
  let failures = 0;
  while (Date.now() < deadline) {
    if (reconnectRequested) {
      reconnectRequested = false;
      transport.dispose();
      await sleep(1000);
      try {
        await connect();
        failures = 0;
      } catch (e) {
        failures++;
        console.log('Reconnect attempt failed:', e.message);
        assert.ok(failures < 5);
        reconnectRequested = true;
        await sleep(2000);
      }
    }
    if (disconnects.includes('renew') && ready) {
      assert.equal(membership.z, 16.5);
      console.log(
        'PASS production-length renewal with the actual browser transport',
      );
      break;
    }
    await sleep(500);
  }
  assert.ok(disconnects.includes('renew'), 'No planned renewal observed');
  assert.ok(ready);
  assert.equal(membership.generation, controller.generation);
  console.log(
    'ROOM RECOVERY PASSED',
    JSON.stringify({ connections, disconnects }),
  );
} finally {
  stopped = true;
  transport?.dispose();
  socket?.terminate();
  await c.request('neighborhood-leave', c.body(controller));
  await c.request('logout', c.body());
}
