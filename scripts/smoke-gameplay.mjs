// Normal API actions and actual RoomClient sockets only: no SQL fixtures,
// artificial balances, clock changes, existing wallets, or blockchain transfers.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { base58 } from '@scure/base';
import WebSocket from 'ws';
import { RoomClient } from '../lib/room-client.ts';
import { actionWorksite } from '../lib/action-authority.ts';
import { OBJECTS } from '../lib/facility.ts';
import { contractFor, serviceChallenge } from '../lib/contracts.ts';
import { planPath } from '../lib/navigation.ts';
import { floorClear } from '../lib/world-navigation.ts';

const origin = process.env.NOOBIUS_TEST_ORIGIN;
const hosted = origin === 'https://play.noobius.io';
if (!hosted && origin !== 'http://127.0.0.1:3003')
  throw Error('Explicit hosted origin or isolated local port 3003 required');
const roomsOrigin = hosted
  ? 'https://rooms.noobius.io'
  : 'http://127.0.0.1:3004';
const { Client } = await import('../tests/api-client.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const actors = [],
  listings = [],
  began = Date.now();
let timedOut = false;
const report = {
  origin,
  beganAt: new Date(began).toISOString(),
  checks: [],
  actors: 3,
};
const pass = (name) => {
  report.checks.push(name);
  console.log('PASS', name);
};
const deadline = setTimeout(() => {
  timedOut = true;
  console.error('Gameplay acceptance exceeded its ten-minute bound');
  process.exitCode = 1;
  for (const p of actors) p.transport?.dispose();
}, 600_000);
deadline.unref();

async function actor(i, target) {
  const keys = await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ]);
  const address = base58.encode(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  );
  const c = new Client({ address });
  c.body = (body) => ({ expectedWallet: 'solana:' + address, ...body });
  const p = {
    c,
    controller: { clientId: crypto.randomUUID(), generation: 0 },
    reconnect: false,
    disconnects: [],
  };
  actors.push(p);
  p.login = async () => {
    let nonce = await c.request('nonce', { address, ecosystem: 'solana' });
    if (nonce.status === 429) {
      await sleep(60200 - (Date.now() % 60000));
      nonce = await c.request('nonce', { address, ecosystem: 'solana' });
    }
    const message = ok(nonce).message;
    const signature =
      '0x' +
      Buffer.from(
        await crypto.subtle.sign(
          'Ed25519',
          keys.privateKey,
          new TextEncoder().encode(message),
        ),
      ).toString('hex');
    p.profile = ok(await c.request('verify', { signature })).profile;
    return p.profile;
  };
  await p.login();
  ok(await c.request('name', c.body({ name: 'Gameplay QA ' + i })));
  p.command = (action, extra = {}) =>
    c.request(action, c.body({ ...p.controller, ...extra }));
  p.membership = ok(
    await p.command('neighborhood-join', {
      realm: 'commons',
      ...(target ? { target } : {}),
    }),
  ).membership;
  p.controller.generation = p.membership.generation;
  p.connect = async () => {
    p.transport?.dispose();
    p.membership = ok(await p.command('neighborhood-state')).membership;
    p.point = { x: p.membership.x, z: p.membership.z };
    const ticket = ok(await p.command('room-ticket')).ticket;
    p.transport = new RoomClient({
      coordinatorOrigin: roomsOrigin,
      ticket,
      membership: p.membership,
      readPosition: () => p.point,
      onMembership: (m, reset) => {
        p.membership = m;
        if (reset) p.point = { x: m.x, z: m.z };
      },
      onPeople: (people) => {
        p.people = people;
      },
      onCorrection: (point) => {
        p.point = point;
      },
      onReady: () => {},
      onDisconnect: (reason) => {
        p.reconnect = true;
        p.disconnects.push(reason);
      },
      createSocket: (url) => (p.socket = new WebSocket(url, { origin })),
    });
    await p.transport.connect();
    p.reconnect = false;
  };
  p.ensure = async () => {
    if (p.reconnect) await p.connect();
    assert.ok(p.transport.ready, 'Room ready for player action');
  };
  p.scene = async (scene) => {
    await p.ensure();
    await p.transport.release();
    p.membership = ok(
      await p.command('neighborhood-scene', { scene }),
    ).membership;
    p.controller.generation = p.membership.generation;
    await p.connect();
  };
  p.refresh = async () => (p.profile = ok(await c.request('profile')).profile);
  p.walk = async (id) => {
    await p.ensure();
    const object = OBJECTS.find((o) => o.id === id);
    assert.ok(object, 'Known worksite');
    const clear = (x, z) => floorClear(p.profile.facility, false, x, z);
    const from = [p.point.x, p.point.z];
    const paths = [
      [0, 1.65],
      [1.65, 0],
      [-1.65, 0],
      [0, -1.65],
    ]
      .map(([x, z]) => [object.x + x, object.z + z])
      .filter(([x, z]) => clear(x, z))
      .map((end) => planPath(from, end, clear, 0.5))
      .filter((path) => path.length)
      .sort((a, b) => a.length - b.length);
    assert.ok(paths.length, 'Reachable worksite: ' + id);
    for (const [x, z] of paths[0]) {
      const start = { ...p.point };
      const distance = Math.hypot(x - start.x, z - start.z);
      const steps = Math.max(1, Math.ceil(distance / 0.5));
      for (let step = 1; step <= steps; step++) {
        await p.ensure();
        await sleep(180);
        p.point = {
          x: start.x + ((x - start.x) * step) / steps,
          z: start.z + ((z - start.z) * step) / steps,
        };
        assert.equal(
          await p.transport.syncPosition(),
          true,
          `Walk to ${id} accepted at ${p.point.x}, ${p.point.z}`,
        );
      }
    }
  };
  p.field = async (type, extra = {}, requestId = crypto.randomUUID()) => {
    await p.ensure();
    const action = { type, requestId, ...extra };
    const payload = c.body({ ...p.controller, action });
    const lease = actionWorksite(p.profile.facility, action)
      ? await p.transport.prepare('facility', payload)
      : null;
    try {
      const response = await c.request('facility', {
        ...payload,
        ...(lease ? { roomCheckpoint: lease.checkpoint } : {}),
      });
      if (response.data.profile) p.profile = response.data.profile;
      return response;
    } finally {
      await lease?.complete();
    }
  };
  await p.connect();
  await p.scene('home-' + p.profile.id);
  await p.refresh();
  return p;
}

async function work(p) {
  ok(await p.field('build', { id: 'rack-a' }));
  const offer = p.profile.facility.career.offers.find(
    (o) => contractFor(o).family === 'service',
  );
  assert.ok(offer);
  const terms = contractFor(offer);
  ok(await p.field('contract-accept', { id: offer.id }));
  // Gather through proximity-checked interactions. No material is injected.
  for (const item of new Set(['scrap', ...Object.keys(terms.cost)])) {
    const node = OBJECTS.find(
      (o) =>
        o.kind === 'node' &&
        o.item === item &&
        p.profile.facility.unlocked.includes(o.zone),
    );
    assert.ok(node, 'Starter materials must be accessible');
    await p.walk(node.id);
    ok(await p.field('gather', { id: node.id }));
  }
  await p.walk(terms.target);
  ok(await p.field('contract-start', { id: offer.id }));
  for (let step = 0; step < 3; step++) {
    const run = p.profile.facility.career.active.find((r) => r.id === offer.id);
    await sleep(Math.max(0, run.nextStepAt - Date.now()) + 150);
    const direction =
      step === 0
        ? 'Inspect'
        : step === 1
          ? serviceChallenge(run).answer
          : 'Test';
    ok(await p.field('contract-service', { id: offer.id, direction }));
  }
  const run = p.profile.facility.career.active.find((r) => r.id === offer.id);
  const before = p.profile.credits;
  const requestId = crypto.randomUUID();
  ok(await p.field('contract-claim', { id: offer.id }, requestId));
  ok(await p.field('contract-claim', { id: offer.id }, requestId));
  await p.refresh();
  assert.equal(
    p.profile.credits,
    before + run.reward,
    'Retried claim awards once',
  );
  assert.equal(p.profile.facility.career.completed.service, 1);
  assert.ok(
    p.profile.facility.career.offers.some(
      (o) => contractFor(o).family === 'service' && o.id !== offer.id,
    ),
  );
}

try {
  // Preflight blocks the entire run if the database is unavailable.
  const health = await fetch(origin + '/api/health', {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(health.status, 200, 'Database unavailable; do not start load');
  let target;
  for (let i = 0; i < 3; i++) {
    const p = await actor(i + 1, target);
    target = p.membership.neighborhoodId;
  }
  const workResults = await Promise.allSettled(actors.map(work));
  const failedWork = workResults.filter((r) => r.status === 'rejected');
  assert.equal(
    failedWork.length,
    0,
    failedWork.map((r) => r.reason?.message ?? String(r.reason)).join('; '),
  );
  pass(
    'Three independent players earned repair rewards; replayed claims paid once and new jobs appeared',
  );
  const [seller, buyer, rival] = actors;
  await buyer.scene('home-' + seller.profile.id);
  const visit = ok(await buyer.c.request('visit?owner=' + seller.profile.id));
  assert.equal(visit.facility.visiting, true);
  assert.equal(visit.facility.compute, 0);
  assert.deepEqual(visit.facility.inventory, {});
  assert.equal((await buyer.field('compute-harvest')).status, 403);
  pass(
    'Visitor sees the center but cannot read private inventory or harvest its income',
  );
  await buyer.scene('home-' + buyer.profile.id);
  for (const p of actors) await p.refresh();
  const before = actors.map((p) => ({
    credits: p.profile.credits,
    scrap: p.profile.facility.inventory.scrap ?? 0,
  }));
  const id = crypto.randomUUID();
  listings.push({ seller, id });
  ok(
    await seller.command('listing-create', {
      requestId: id,
      item: 'scrap',
      quantity: 1,
      price: 1,
    }),
  );
  const race = await Promise.all([
    buyer.command('listing-buy', { id }),
    rival.command('listing-buy', { id }),
  ]);
  assert.deepEqual(
    race.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  for (const p of actors) await p.refresh();
  assert.equal(seller.profile.credits, before[0].credits + 1);
  assert.equal(seller.profile.facility.inventory.scrap, before[0].scrap - 1);
  for (const [i, p] of [buyer, rival].entries()) {
    const won = race[i].status === 200;
    assert.equal(p.profile.credits, before[i + 1].credits - (won ? 1 : 0));
    assert.equal(
      p.profile.facility.inventory.scrap,
      before[i + 1].scrap + (won ? 1 : 0),
    );
  }
  pass(
    'Competing item buyers settle once; seller payment, buyer debit and inventories balance',
  );
  const expected = actors.map((p) => ({
    credits: p.profile.credits,
    inventory: p.profile.facility.inventory,
    id: p.profile.id,
  }));
  buyer.socket.terminate();
  await sleep(1200);
  assert.ok(buyer.reconnect);
  await buyer.connect();
  for (let i = 0; i < actors.length; i++) {
    const p = actors[i];
    await p.transport.release();
    await p.login();
    assert.equal(p.profile.id, expected[i].id);
    assert.equal(p.profile.credits, expected[i].credits);
    assert.deepEqual(p.profile.facility.inventory, expected[i].inventory);
  }
  pass(
    'Dropped socket recovers and fresh signed logins retain earned balances and traded items',
  );
  assert.equal(timedOut, false, 'Acceptance must finish within ten minutes');
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error.message;
  process.exitCode = 1;
  console.error('Gameplay acceptance failed:', error.message);
} finally {
  clearTimeout(deadline);
  for (const p of actors) p.transport?.dispose();
  const cleanupFailures = [];
  for (const { seller, id } of listings) {
    try {
      const response = await seller.command('listing-cancel', { id });
      // A completed sale is already closed and returns conflict.
      if (![200, 409].includes(response.status))
        cleanupFailures.push('listing');
    } catch {
      cleanupFailures.push('listing');
    }
  }
  for (const p of actors) {
    for (const action of ['neighborhood-leave', 'logout']) {
      try {
        const response = await p.command(action);
        if (response.status !== 200) cleanupFailures.push(action);
      } catch {
        cleanupFailures.push(action);
      }
    }
  }
  report.cleanupFailures = cleanupFailures;
  if (cleanupFailures.length) {
    report.ok = false;
    process.exitCode = 1;
  }
  report.elapsedMs = Date.now() - began;
  report.completedAt = new Date().toISOString();
  writeFileSync(
    '/tmp/noobius-gameplay-acceptance.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
