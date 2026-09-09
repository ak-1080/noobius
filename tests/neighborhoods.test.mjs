import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import {
  joinNeighborhood,
  changeScene,
  requireMembership,
  leaveNeighborhood,
  visitCenter,
  neighborhoodSnapshot,
  ensurePublicId,
  syncNeighborhood,
  readNeighborhoodState,
} from '../lib/neighborhoods-server.ts';

// Runs the actual SQL against SQLite. The deployed D1 API is separately tested;
// this adapter gives deterministic interleaving and migration coverage locally.

function users(db, n) {
  return Array.from({ length: n }, (_, i) => {
    const wallet = '0x' + String(i + 1).padStart(40, '0'),
      clientId = crypto.randomUUID();
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
      )
      .run(wallet, `Crew ${i + 1}`, 0, JSON.stringify(newFacility(0)));
    return { wallet, clientId };
  });
}
const join = (db, p, target, now = 1000) =>
  joinNeighborhood(
    db,
    p.wallet,
    'commons',
    0,
    p.clientId,
    target ? { target } : {},
    now,
  );
const controller = (p, m) => ({
  clientId: p.clientId,
  generation: m.generation,
});

test('simultaneous arrivals fill a five-player neighborhood then allocate another', async () => {
  const db = database(),
    crew = users(db, 11);
  const joined = await Promise.all(crew.map((p) => join(db, p)));
  const counts = db.sqlite
    .prepare(
      'SELECT neighborhood_id,count(*) AS n FROM crew_presence GROUP BY neighborhood_id',
    )
    .all();
  assert.equal(counts.length, 3);
  assert.deepEqual(counts.map((r) => r.n).sort(), [1, 5, 5]);
  assert.ok(joined.every((m) => m.slot >= 0 && m.slot < 5));
  assert.equal(new Set(joined.map((m) => m.generation)).size, 11);
});

test('a sixth targeted join and a failed move preserve the previous membership', async () => {
  const db = database(),
    crew = users(db, 6);
  const first = await join(db, crew[0]);
  for (const p of crew.slice(1, 5)) await join(db, p, first.neighborhoodId);
  const sixth = await join(db, crew[5]);
  await assert.rejects(
    join(db, crew[5], first.neighborhoodId),
    /full or unavailable/,
  );
  const still = await requireMembership(
    db,
    crew[5].wallet,
    controller(crew[5], sixth),
    1000,
  );
  assert.equal(still.neighborhood_id, sixth.neighborhoodId);
  assert.equal(still.generation, sixth.generation);
});

test('visitors count toward the five slots and cross-neighborhood visits are refused', async () => {
  const db = database(),
    crew = users(db, 6),
    joined = [];
  for (const p of crew) joined.push(await join(db, p));
  const owner = await ensurePublicId(db, crew[0].wallet);
  const visit = await changeScene(
    db,
    crew[1].wallet,
    controller(crew[1], joined[1]),
    'home-' + owner,
    1000,
  );
  assert.equal(visit.neighborhoodId, joined[1].neighborhoodId);
  assert.equal(visit.slot, joined[1].slot);
  await assert.rejects(join(db, crew[5], joined[0].neighborhoodId), /full/);
  await assert.rejects(
    visitCenter(db, crew[5].wallet, owner, 1000),
    /no longer in your neighborhood/,
  );
  const safe = await visitCenter(db, crew[1].wallet, owner, 1000);
  assert.equal(safe.facility.visiting, true);
  assert.deepEqual(safe.facility.inventory, {});
  assert.deepEqual(safe.facility.bank, {});
  assert.equal(safe.facility.compute, 0);
});

test('a short reconnect keeps the slot; expired membership safely reclaims an available place', async () => {
  const db = database(),
    [p, other] = users(db, 2);
  const first = await join(db, p);
  const resumed = await join(db, p, undefined, 30000);
  assert.equal(resumed.generation, first.generation);
  assert.equal(resumed.slot, first.slot);
  assert.equal(resumed.leaseUntil, 75000);
  await assert.rejects(
    requireMembership(db, p.wallet, controller(p, first), 75000),
    /expired/,
  );
  await join(db, other, first.neighborhoodId, 80000);
  const rejoined = await join(db, p, undefined, 80000);
  assert.notEqual(rejoined.generation, first.generation);
  assert.equal(rejoined.neighborhoodId, first.neighborhoodId);
  assert.notEqual(rejoined.slot, 0);
});

test('a second tab cannot steal control; an explicit takeover invalidates stale actions and leave', async () => {
  const db = database(),
    [p] = users(db, 1),
    first = await join(db, p);
  const secondTab = { ...p, clientId: crypto.randomUUID() };
  await assert.rejects(join(db, secondTab), /another tab/);
  const next = await joinNeighborhood(
    db,
    p.wallet,
    'commons',
    0,
    secondTab.clientId,
    { takeover: true },
    1001,
  );
  await assert.rejects(
    requireMembership(db, p.wallet, controller(p, first), 1001),
    /another tab/,
  );
  await leaveNeighborhood(db, p.wallet, controller(p, first));
  assert.equal(
    (await requireMembership(db, p.wallet, controller(secondTab, next), 1001))
      .generation,
    next.generation,
  );
});

test('account center IDs are opaque and stable; snapshots expose only local neighbors and same-scene avatars', async () => {
  const db = database(),
    crew = users(db, 6),
    joined = [];
  for (const p of crew) joined.push(await join(db, p));
  const id = await ensurePublicId(db, crew[0].wallet);
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(await ensurePublicId(db, crew[0].wallet), id);
  const interior = await changeScene(
    db,
    crew[0].wallet,
    controller(crew[0], joined[0]),
    'home-' + id,
    1000,
  );
  const snap = await neighborhoodSnapshot(
    db,
    crew[0].wallet,
    controller(crew[0], interior),
    1000,
  );
  assert.equal(snap.neighbors.length, 5);
  assert.equal(snap.people.length, 1);
  assert.equal(snap.people[0].id, id);
  assert.ok(!JSON.stringify(snap).includes(crew[0].wallet));
  assert.ok(!snap.neighbors.some((p) => p.name === 'Crew 6'));
});

test('migration preserves existing wallets, balances, facilities and legacy presence', () => {
  const db = new DatabaseSync(':memory:');
  for (const name of [
    '0000_spicy_the_watchers',
    '0001_calm_mister_fear',
    '0002_fancy_master_mold',
    '0003_confused_wolfsbane',
  ])
    db.exec(
      readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'),
    );
  const saved = JSON.stringify(newFacility(0));
  db.prepare(
    'INSERT INTO players(wallet,name,credits,created_at,facility_state) VALUES (?,?,?,?,?)',
  ).run('old', 'Established player', 75000, 0, saved);
  db.prepare(
    'INSERT INTO crew_presence(wallet,x,z,updated_at,room) VALUES (?,?,?,?,?)',
  ).run('old', 1, 17, 0, 'campus-1');
  db.exec(
    readFileSync(
      new URL('../drizzle/0004_odd_blackheart.sql', import.meta.url),
      'utf8',
    ),
  );
  db.exec(
    readFileSync(
      new URL('../drizzle/0005_tired_jocasta.sql', import.meta.url),
      'utf8',
    ),
  );
  const player = db.prepare('SELECT * FROM players').get();
  assert.equal(player.credits, 75000);
  assert.equal(player.facility_state, saved);
  assert.equal(
    db.prepare('SELECT room FROM crew_presence').get().room,
    'campus-1',
  );
  assert.throws(
    () => db.prepare('UPDATE crew_presence SET slot=5').run(),
    /CHECK constraint/,
  );
});

test('movement rejects teleporting, locked rooms, burst packets and stale sequence updates', async () => {
  const db = database(),
    [p] = users(db, 1),
    m = await join(db, p),
    c = controller(p, m);
  let snapshot = await syncNeighborhood(
    db,
    p.wallet,
    c,
    1,
    { x: 2, z: 17 },
    2000,
  );
  assert.equal(snapshot.corrected, false);
  assert.equal(snapshot.membership.x, 2);
  snapshot = await syncNeighborhood(db, p.wallet, c, 2, { x: -7, z: 17 }, 2100);
  assert.equal(snapshot.corrected, true);
  assert.equal(snapshot.membership.x, 2);
  // Repeated simultaneous packets do not create a new movement allowance.
  for (let seq = 3; seq < 15; seq++)
    snapshot = await syncNeighborhood(
      db,
      p.wallet,
      c,
      seq,
      { x: 2.1, z: 17 },
      2100,
    );
  assert.equal(snapshot.membership.x, 2);
  snapshot = await syncNeighborhood(db, p.wallet, c, 1, { x: 7, z: 17 }, 2200);
  assert.equal(snapshot.membership.sequence, 14);
  assert.equal(snapshot.membership.x, 2);
  snapshot = await syncNeighborhood(
    db,
    p.wallet,
    c,
    15,
    { x: 0, z: -10 },
    12000,
  );
  assert.equal(snapshot.corrected, true);
});

test('owner departure returns a visiting player to the plaza without giving up their slot', async () => {
  const db = database(),
    [host, visitor] = users(db, 2),
    h = await join(db, host),
    v = await join(db, visitor);
  const id = await ensurePublicId(db, host.wallet);
  const interior = await changeScene(
    db,
    visitor.wallet,
    controller(visitor, v),
    'home-' + id,
    1000,
  );
  await leaveNeighborhood(db, host.wallet, controller(host, h));
  const snap = await syncNeighborhood(
    db,
    visitor.wallet,
    controller(visitor, interior),
    1,
    { x: 0, z: 17 },
    2000,
  );
  assert.equal(snap.membership.scene, 'commons');
  assert.equal(snap.membership.slot, interior.slot);
  assert.equal(snap.membership.neighborhoodId, interior.neighborhoodId);
  assert.notEqual(snap.membership.generation, interior.generation);
  assert.equal(snap.corrected, true);
});

test('socket metadata recovery leaves inaccessible interiors and preserves the reserved slot', async (t) => {
  for (const cause of ['departure', 'block']) {
    const db = database();
    t.after(() => db.sqlite.close());
    const [host, visitor] = users(db, 2),
      h = await join(db, host),
      v = await join(db, visitor);
    const id = await ensurePublicId(db, host.wallet);
    const inside = await changeScene(
      db,
      visitor.wallet,
      controller(visitor, v),
      'home-' + id,
      1000,
    );
    const before = await readNeighborhoodState(
      db,
      visitor.wallet,
      controller(visitor, inside),
      1500,
    );
    assert.equal(before.membership.scene, 'home-' + id);
    assert.equal(
      before.membership.sequence,
      inside.sequence,
      'Metadata must not advance movement',
    );
    if (cause === 'departure')
      await leaveNeighborhood(db, host.wallet, controller(host, h));
    else
      db.sqlite
        .prepare(
          'INSERT INTO social_preferences(wallet,target_wallet,muted,blocked) VALUES (?,?,0,1)',
        )
        .run(host.wallet, visitor.wallet);
    const recovered = await readNeighborhoodState(
      db,
      visitor.wallet,
      controller(visitor, inside),
      2000,
    );
    assert.equal(recovered.membership.scene, 'commons');
    assert.equal(recovered.membership.slot, inside.slot);
    assert.equal(recovered.membership.neighborhoodId, inside.neighborhoodId);
    assert.equal(recovered.corrected, true);
    assert.notEqual(recovered.membership.generation, inside.generation);
  }
});
