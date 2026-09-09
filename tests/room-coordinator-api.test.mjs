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

// This deliberately waits through a production-length five-minute grant. It
// tests two clients in one neighborhood, not aggregate deployment capacity.
test(
  'full grant renewal preserves a visited scene, final movement and idempotent work',
  {
    skip: process.env.NOOBIUS_TEST_LONG_ROOMS !== '1',
    timeout: 330_000,
  },
  async (t) => {
    const actors = [],
      browsers = [],
      sockets = [],
      failures = [];
    const timers = { walking: undefined };
    let stopping = false;
    t.after(async () => {
      stopping = true;
      clearInterval(timers.walking);
      for (const browser of browsers) browser.dispose();
      for (const socket of sockets) socket.terminate();
      for (const actor of actors) {
        await actor.c.request(
          'neighborhood-leave',
          actor.c.body(actor.controller),
        );
        await actor.c.request('logout', actor.c.body());
      }
    });
    const room = crypto.randomUUID().replaceAll('-', '');
    sql(
      `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${q(room)},'commons',0,${Date.now()})`,
    );
    const makeActor = async () => {
      const c = new Client(),
        profile = ok(await c.login()).profile;
      const actor = {
        c,
        profile,
        controller: { clientId: crypto.randomUUID(), generation: 0 },
        state: null,
        browser: null,
        point: { x: 0, z: 17 },
        accepted: { x: 0, z: 17 },
        acceptedMoves: 0,
        connections: [],
        disconnects: [],
        renewals: [],
      };
      actors.push(actor);
      actor.state = ok(
        await c.request(
          'neighborhood-join',
          c.body({ ...actor.controller, realm: 'commons', target: room }),
        ),
      );
      actor.controller.generation = actor.state.membership.generation;
      return actor;
    };
    const host = await makeActor(),
      visitor = await makeActor();
    const scene = 'home-' + host.profile.id;
    for (const actor of actors) {
      actor.state = ok(
        await actor.c.request(
          'neighborhood-scene',
          actor.c.body({ ...actor.controller, scene }),
        ),
      );
      actor.controller.generation = actor.state.membership.generation;
    }
    const facility = newFacility(Date.now());
    facility.inventory = { scrap: 30, copper: 30, silicon: 30 };
    facility.unlocked = ['commons', 'salvage', 'workshop'];
    const bench = OBJECTS.find((o) => o.id === 'workbench');
    const worksite = [
      { x: bench.x + 2, z: bench.z },
      { x: bench.x - 2, z: bench.z },
    ].find((p) => floorClear(facility, false, p.x, p.z));
    assert.ok(worksite);
    sql(
      `UPDATE players SET facility_state=${q(JSON.stringify(facility))},facility_version=${facility.version} WHERE wallet=${q(host.profile.wallet)}; UPDATE crew_presence SET x=${worksite.x},z=${worksite.z},updated_at=${Date.now()},lease_until=${Date.now() + 45000} WHERE wallet=${q(host.profile.wallet)}`,
    );
    const identity = (membership) => ({
      neighborhoodId: membership.neighborhoodId,
      scene: membership.scene,
      generation: membership.generation,
    });
    for (const actor of actors)
      actor.identity = identity(actor.state.membership);

    // Model the hook's planned-renewal path using the real browser transport:
    // read the still-owned membership, request a new ticket, and reconnect.
    // In particular, never call neighborhood-join or neighborhood-scene here.
    const connect = async (actor, renewal) => {
      actor.state = ok(
        await actor.c.request(
          'neighborhood-state',
          actor.c.body(actor.controller),
        ),
      );
      assert.deepEqual(identity(actor.state.membership), actor.identity);
      assert.equal(
        actor.state.writerActive,
        false,
        'Planned renewal releases its old writer before reconnecting',
      );
      if (renewal) {
        renewal.durable = { ...actor.state.membership };
        assert.deepEqual(
          { x: renewal.durable.x, z: renewal.durable.z },
          renewal.accepted,
          'The released grant must save its final accepted movement',
        );
      }
      const ticket = ok(
        await actor.c.request('room-ticket', actor.c.body(actor.controller)),
      );
      if (stopping) return;
      actor.point = {
        x: actor.state.membership.x,
        z: actor.state.membership.z,
      };
      actor.accepted = { ...actor.point };
      const browser = new RoomClient({
        ...ticket,
        membership: actor.state.membership,
        createSocket: (url) => {
          const socket = new WebSocket(url, { origin });
          sockets.push(socket);
          socket.on('message', (raw) => {
            const frame = JSON.parse(String(raw));
            if (frame.type === 'joined')
              actor.connections.push({
                id: frame.connectionId,
                at: Date.now(),
              });
            if (frame.type === 'move-ack' && frame.accepted) {
              actor.accepted = { ...frame.position };
              actor.acceptedMoves++;
            }
          });
          return socket;
        },
        readPosition: () => actor.point,
        onMembership: (membership) => {
          if (actor.browser === browser)
            actor.state = { ...actor.state, membership };
        },
        onCorrection: (point) => {
          if (actor.browser === browser) actor.point = { ...point };
        },
        onPeople: () => {},
        onReady: () => {},
        onDisconnect: (reason) => {
          if (stopping || actor.browser !== browser) return;
          actor.browser = null;
          actor.disconnects.push(reason);
          if (reason !== 'renew') {
            failures.push(
              new Error('Unexpected interruption during full grant renewal'),
            );
            return;
          }
          const renewal = {
            at: Date.now(),
            accepted: { ...actor.accepted },
            membership: { ...actor.state.membership },
            done: false,
          };
          actor.renewals.push(renewal);
          void connect(actor, renewal)
            .then(() => {
              renewal.done = true;
            })
            .catch((error) => failures.push(error));
        },
      });
      browsers.push(browser);
      actor.browser = browser;
      await browser.connect();
      assert.equal(browser.ready, true);
      assert.deepEqual(identity(actor.state.membership), actor.identity);
      if (renewal) renewal.rejoined = { ...actor.state.membership };
    };
    await connect(host);
    const action = host.c.body({
      ...host.controller,
      action: { type: 'craft', id: 'kit', requestId: crypto.randomUUID() },
    });
    const lease = await host.browser.prepare('facility', action);
    const saved = ok(
      await host.c.request('facility', {
        ...action,
        roomCheckpoint: lease.checkpoint,
      }),
    );
    await lease.complete();
    assert.equal(saved.actionApplied, true);
    assert.ok(saved.profile.facility.craft);
    await connect(visitor);

    // Move continuously near the real renewal boundary. Distinct small steps
    // expose loss of movement newer than the last background D1 checkpoint.
    let steps = 0;
    timers.walking = setInterval(() => {
      if (
        !visitor.browser?.ready ||
        visitor.renewals.length ||
        Date.now() - visitor.connections[0].at < 270_000
      )
        return;
      const point = { x: Number((++steps * 0.01).toFixed(2)), z: 17 };
      if (!floorClear(facility, false, point.x, point.z)) {
        failures.push(
          new Error('The renewal movement fixture left accessible floor'),
        );
        clearInterval(timers.walking);
        return;
      }
      visitor.point = point;
    }, 250);
    const deadline = Date.now() + 310_000;
    let diagnosticAt = Date.now();
    while (!actors.every((actor) => actor.renewals[0]?.done)) {
      if (failures.length) throw failures[0];
      assert.ok(
        Date.now() < deadline,
        'Both full-length grants must renew within the bounded test window',
      );
      if (Date.now() - diagnosticAt >= 60_000) {
        t.diagnostic(
          'Waiting for the real five-minute grants; both browser connections remain active.',
        );
        diagnosticAt = Date.now();
      }
      await sleep(250);
    }
    clearInterval(timers.walking);
    assert.equal(failures.length, 0);
    assert.ok(
      visitor.acceptedMoves >= 20,
      'Exercise movement immediately before the planned renewal',
    );
    for (const actor of actors) {
      assert.deepEqual(actor.disconnects, ['renew']);
      assert.equal(actor.connections.length, 2);
      assert.notEqual(actor.connections[0].id, actor.connections[1].id);
      const renewal = actor.renewals[0];
      assert.ok(
        renewal.at - actor.connections[0].at >= 270_000,
        'Use real five-minute grants, not shortened production configuration',
      );
      assert.deepEqual(identity(renewal.membership), actor.identity);
      assert.deepEqual(identity(renewal.rejoined), actor.identity);
      assert.deepEqual(
        { x: renewal.membership.x, z: renewal.membership.z },
        renewal.accepted,
      );
      assert.deepEqual(
        { x: renewal.rejoined.x, z: renewal.rejoined.z },
        renewal.accepted,
      );
      assert.equal(actor.browser.ready, true);
    }
    assert.equal(visitor.state.membership.scene, scene);
    assert.notEqual(
      visitor.state.membership.scene,
      'home-' + visitor.profile.id,
    );

    const afterRenewal = ok(await host.c.request('profile')).profile;
    assert.deepEqual(
      afterRenewal.facility.inventory,
      saved.profile.facility.inventory,
      'Renewing room access must not repeat economic work',
    );
    assert.equal(
      afterRenewal.facility.requests.filter(
        (id) => id === action.action.requestId,
      ).length,
      1,
    );
    const retry = await host.browser.prepare('facility', action);
    const repeated = ok(
      await host.c.request('facility', {
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
    assert.deepEqual(
      repeated.profile.facility.craft,
      saved.profile.facility.craft,
    );

    const finalPoint = { ...visitor.accepted };
    await visitor.browser.release();
    const released = ok(
      await visitor.c.request(
        'neighborhood-state',
        visitor.c.body(visitor.controller),
      ),
    );
    assert.equal(released.writerActive, false);
    assert.deepEqual(identity(released.membership), visitor.identity);
    assert.deepEqual(
      { x: released.membership.x, z: released.membership.z },
      finalPoint,
    );
    t.diagnostic(
      'Two real browser clients renewed five-minute grants; visited-scene movement and one idempotent craft were preserved.',
    );
  },
);
