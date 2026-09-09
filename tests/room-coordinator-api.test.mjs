import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { Client } from './api-client.mjs';
import { roomActionIntent } from '../lib/room-writer.ts';
import { RoomClient } from '../lib/room-client.ts';
import { OBJECTS, newFacility } from '../lib/facility.ts';
import { floorClear } from '../lib/world-navigation.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'http://127.0.0.1:3003')
  throw new Error('Coordinator QA requires isolated port3003 and port3004.');
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const sleep = (n) => new Promise((r) => setTimeout(r, n));
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
// Seed only generated accounts in the isolated QA database. Starting a second
// Miniflare D1 process against a live persist directory can lock its metadata.
const sql = (command) => {
  const directory = '.wrangler/qa-dispatch/v3/d1/miniflare-D1DatabaseObject';
  const files = readdirSync(directory).filter((name) =>
    /^[a-f0-9]{64}\.sqlite$/.test(name),
  );
  assert.equal(files.length, 1, 'Choose one isolated QA D1 file');
  const db = new DatabaseSync(directory + '/' + files[0]);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    db.exec(command);
  } finally {
    db.close();
  }
};
class Room {
  messages = [];
  constructor(room) {
    this.socket = new WebSocket('ws://127.0.0.1:3004/rooms/' + room, {
      origin,
    });
    this.socket.on('message', (raw) => {
      this.messages.push(JSON.parse(String(raw)));
    });
  }
  async wait(type, predicate = () => true) {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      const i = this.messages.findIndex((m) => m.type === type && predicate(m));
      if (i >= 0) return this.messages.splice(i, 1)[0];
      if (this.socket.readyState === WebSocket.CLOSED)
        throw new Error('Socket closed while waiting for ' + type);
      await sleep(10);
    }
    throw new Error(
      'Timed out waiting for ' + type + ': ' + JSON.stringify(this.messages),
    );
  }
  send(body) {
    this.socket.send(
      JSON.stringify({ connectionId: this.connectionId, ...body }),
    );
  }
  async join(client, controller) {
    if (this.socket.readyState !== WebSocket.OPEN)
      await new Promise((r, j) => {
        this.socket.once('open', r);
        this.socket.once('error', j);
      });
    const ticket = ok(
      await client.request('room-ticket', client.body(controller)),
    ).ticket;
    this.socket.send(JSON.stringify({ type: 'join', ticket }));
    const a = await this.wait('joined');
    this.connectionId = a.connectionId;
    this.joined = a;
    return a;
  }
}

test('five real sockets share validated movement, block HTTP races, freeze work, and keep interiors private', async (t) => {
  const players = [],
    sockets = [];
  t.after(() => {
    for (const s of sockets) s.socket.terminate();
  });
  const room = crypto.randomUUID().replaceAll('-', '');
  sql(
    `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${q(room)},'commons',0,${Date.now()})`,
  );
  for (let i = 0; i < 5; i++) {
    const c = new Client(),
      profile = ok(await c.login()).profile;
    const controller = { clientId: crypto.randomUUID(), generation: 0 };
    const joined = ok(
      await c.request(
        'neighborhood-join',
        c.body({
          ...controller,
          realm: 'commons',
          ...(room ? { target: room } : {}),
        }),
      ),
    ).membership;
    controller.generation = joined.generation;
    const s = new Room(room);
    sockets.push(s);
    await s.join(c, controller);
    players.push({ c, controller, profile, s });
  }
  const [one, two] = players;
  for (const p of players) {
    const seen = await p.s.wait('players', (m) => m.people.length === 5);
    assert.equal(new Set(seen.people.map((p) => p.id)).size, 5);
    const wire = JSON.stringify(seen);
    for (const name of ['grant', 'inventory', 'credits', 'session_hash'])
      assert.ok(!wire.includes(name));
  }
  const sixth = new Client();
  ok(await sixth.login());
  assert.equal(
    (
      await sixth.request(
        'neighborhood-join',
        sixth.body({
          clientId: crypto.randomUUID(),
          realm: 'commons',
          target: room,
        }),
      )
    ).status,
    409,
  );
  await sleep(150);
  one.s.send({ type: 'move', inputSequence: 1, x: 0, z: 16.5 });
  const moved = await one.s.wait('move-ack');
  assert.equal(moved.accepted, true);
  await two.s.wait('players', (m) =>
    m.people.some((p) => p.id === one.profile.id && p.z === 16.5),
  );
  one.s.send({ type: 'move', inputSequence: 2, x: 29, z: -30 });
  const rejected = await one.s.wait('move-ack');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.position.z, 16.5);
  assert.equal(
    (
      await one.c.request(
        'neighborhood-sync',
        one.c.body({
          ...one.controller,
          sequence: 999,
          position: { x: 0, z: 16 },
        }),
      )
    ).status,
    409,
  );
  const id = crypto.randomUUID();
  one.s.send({ type: 'checkpoint', requestId: id, inputSequence: 2 });
  const committed = await one.s.wait('checkpoint', (m) => m.requestId === id);
  assert.equal(committed.membership.z, 16.5);
  assert.equal(committed.checkpoint.inputSequence, 2);

  // An owner enters their private center in the same five-slot neighborhood.
  const owner = players[4];
  owner.s.send({ type: 'leave' });
  await owner.s.wait('released');
  const scene = ok(
    await owner.c.request(
      'neighborhood-scene',
      owner.c.body({ ...owner.controller, scene: 'home-' + owner.profile.id }),
    ),
  ).membership;
  owner.controller.generation = scene.generation;
  const f = newFacility(Date.now());
  f.inventory = { scrap: 30, copper: 30, silicon: 30 };
  f.unlocked = ['commons', 'salvage', 'workshop'];
  const bench = OBJECTS.find((o) => o.id === 'workbench');
  const point = [
    { x: bench.x + 2, z: bench.z },
    { x: bench.x - 2, z: bench.z },
  ].find((p) => floorClear(f, false, p.x, p.z));
  assert.ok(point);
  sql(
    `UPDATE players SET facility_state=${q(JSON.stringify(f))},facility_version=${f.version} WHERE wallet=${q(owner.profile.wallet)}; UPDATE crew_presence SET x=${point.x},z=${point.z},updated_at=${Date.now()},lease_until=${Date.now() + 45000} WHERE wallet=${q(owner.profile.wallet)}`,
  );
  owner.s = new Room(room);
  sockets.push(owner.s);
  await owner.s.join(owner.c, owner.controller);
  const view = await owner.s.wait('players');
  assert.equal(view.people.length, 1);
  const action = owner.c.body({
    ...owner.controller,
    action: { type: 'craft', id: 'kit', requestId: crypto.randomUUID() },
  });
  assert.equal((await owner.c.request('facility', action)).status, 409);
  const actionId = crypto.randomUUID(),
    intent = await roomActionIntent('facility', action);
  owner.s.send({
    type: 'checkpoint',
    requestId: actionId,
    inputSequence: 0,
    intent,
  });
  await owner.s.wait('checkpoint', (m) => m.requestId === actionId);
  const wrong = {
    ...action,
    action: { ...action.action, id: 'wire' },
    roomCheckpoint: actionId,
  };
  assert.notEqual((await owner.c.request('facility', wrong)).status, 200);
  owner.s.send({
    type: 'move',
    inputSequence: 1,
    x: point.x,
    z: point.z + 0.1,
  });
  assert.equal((await owner.s.wait('move-ack')).accepted, false);
  const crafted = ok(
    await owner.c.request('facility', { ...action, roomCheckpoint: actionId }),
  );
  assert.ok(crafted.profile.facility.craft);
  owner.s.send({ type: 'action-complete', id: actionId });
  await owner.s.wait('action-complete');
  await sleep(150);
  owner.s.send({ type: 'move', inputSequence: 2, x: point.x, z: point.z });
  assert.equal((await owner.s.wait('move-ack')).accepted, true);
  // Periodic checkpoints keep a real stationary connection alive >10 seconds.
  await sleep(11_000);
  one.s.send({ type: 'move', inputSequence: 3, x: 0, z: 16.5 });
  assert.equal((await one.s.wait('move-ack')).accepted, true);
  one.s.send({ type: 'leave' });
  await one.s.wait('released');
  const resumed = ok(
    await one.c.request(
      'neighborhood-join',
      one.c.body({ ...one.controller, realm: 'commons' }),
    ),
  );
  assert.equal(resumed.membership.z, 16.5);
  ok(
    await one.c.request(
      'neighborhood-sync',
      one.c.body({
        ...one.controller,
        sequence: resumed.membership.sequence + 1,
        position: { x: 0, z: 16.5 },
      }),
    ),
  );
  for (const p of players) {
    await p.c.request('neighborhood-leave', p.c.body(p.controller));
    await p.c.request('logout', p.c.body());
  }
  await sixth.request('logout', sixth.body());
});

test('browser transport survives idle renewal, verifies real work and repeats no economic action', async (t) => {
  const c = new Client(),
    profile = ok(await c.login()).profile;
  const controller = { clientId: crypto.randomUUID(), generation: 0 };
  let state = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...controller, realm: 'commons' }),
    ),
  );
  controller.generation = state.membership.generation;
  assert.equal(state.roomTransport, 'socket');
  state = ok(
    await c.request(
      'neighborhood-scene',
      c.body({ ...controller, scene: 'home-' + profile.id }),
    ),
  );
  controller.generation = state.membership.generation;
  const f = newFacility(Date.now());
  f.inventory = { scrap: 30, copper: 30, silicon: 30 };
  f.unlocked = ['commons', 'salvage', 'workshop'];
  const bench = OBJECTS.find((o) => o.id === 'workbench');
  let point = [
    { x: bench.x + 2, z: bench.z },
    { x: bench.x - 2, z: bench.z },
  ].find((p) => floorClear(f, false, p.x, p.z));
  sql(
    `UPDATE players SET facility_state=${q(JSON.stringify(f))},facility_version=${f.version} WHERE wallet=${q(profile.wallet)}; UPDATE crew_presence SET x=${point.x},z=${point.z},updated_at=${Date.now()},lease_until=${Date.now() + 45000} WHERE wallet=${q(profile.wallet)}`,
  );
  state = ok(await c.request('neighborhood-state', c.body(controller)));
  const ticket = ok(await c.request('room-ticket', c.body(controller)));
  const disconnected = [],
    ready = [],
    corrections = [];
  const client = new RoomClient({
    ...ticket,
    membership: state.membership,
    createSocket: (url) => new WebSocket(url, { origin }),
    readPosition: () => point,
    onMembership: (m) => {
      state = { ...state, membership: m };
    },
    onCorrection: (p) => {
      point = p;
      corrections.push(p);
    },
    onPeople: () => {},
    onReady: (r) => ready.push(r),
    onDisconnect: () => disconnected.push(true),
  });
  t.after(async () => {
    client.dispose();
    await c.request('neighborhood-leave', c.body(controller));
    await c.request('logout', c.body());
  });
  await client.connect();
  assert.equal(client.ready, true);
  const metadata = ok(
    await c.request('neighborhood-state', c.body(controller)),
  );
  assert.equal(metadata.writerActive, true);
  assert.equal(metadata.membership.scene, 'home-' + profile.id);
  await sleep(12000);
  assert.equal(
    client.ready,
    true,
    'Authority heartbeat must renew the browser deadline',
  );
  assert.equal(disconnected.length, 0);
  const action = c.body({
    ...controller,
    action: { type: 'craft', id: 'kit', requestId: crypto.randomUUID() },
  });
  const lease = await client.prepare('facility', action);
  assert.equal(client.ready, false);
  const saved = ok(
    await c.request('facility', {
      ...action,
      roomCheckpoint: lease.checkpoint,
    }),
  );
  assert.ok(saved.profile.facility.craft);
  await lease.complete();
  assert.equal(client.ready, true);
  const retry = await client.prepare('facility', action);
  const repeated = ok(
    await c.request('facility', {
      ...action,
      roomCheckpoint: retry.checkpoint,
    }),
  );
  await retry.complete();
  assert.equal(repeated.actionApplied, false);
  assert.deepEqual(
    repeated.profile.facility.inventory,
    saved.profile.facility.inventory,
  );
  await client.release();
  assert.equal(client.ready, false);
  const released = ok(
    await c.request('neighborhood-state', c.body(controller)),
  );
  assert.equal(released.writerActive, false);
  assert.equal(disconnected.length, 0);
});
