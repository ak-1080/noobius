import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import {
  joinNeighborhood,
  changeScene,
  ensurePublicId,
} from '../lib/neighborhoods-server.ts';
import {
  sendCrewMessage,
  crewSignalPacket,
  setSocialPreference,
  rememberNeighbors,
} from '../lib/social-server.ts';
import { QUICK_PINGS, SIGNAL_LIFETIME_MS } from '../lib/social.ts';
import { advanceCrewSignals } from '../lib/crew-signals.ts';

async function fixture(t) {
  const db = database();
  t.after(() => db.sqlite.close());
  const now = 1800000000000,
    players = [];
  for (let i = 1; i <= 6; i++) {
    const wallet = '0x' + String(i).padStart(40, '0');
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
      )
      .run(wallet, 'Tech ' + i, now, JSON.stringify(newFacility(now)));
    const clientId = crypto.randomUUID();
    const membership = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      {},
      now,
    );
    const id = await ensurePublicId(db, wallet);
    players.push({
      wallet,
      id,
      membership,
      controller: { clientId, generation: membership.generation },
    });
    await rememberNeighbors(db, wallet, membership.neighborhoodId, now);
  }
  return { db, now, players };
}

test('only explicit presets produce bounded signals; ordinary chat remains chat, and scene is recorded at send', async (t) => {
  const {
    db,
    now,
    players: [a, b],
  } = await fixture(t);
  await sendCrewMessage(
    db,
    a.wallet,
    a.controller,
    { message: QUICK_PINGS.wave },
    now,
  );
  assert.equal(
    (await crewSignalPacket(db, b.wallet, b.membership.neighborhoodId, now))
      .items.length,
    0,
  );
  const id = await sendCrewMessage(
    db,
    a.wallet,
    a.controller,
    { ping: 'wave', message: 'ignored', scene: 'forged' },
    now + 5000,
  );
  const changed = await changeScene(
    db,
    a.wallet,
    a.controller,
    'home-' + a.id,
    now + 5001,
  );
  assert.equal(changed.scene, 'home-' + a.id);
  const packet = await crewSignalPacket(
    db,
    b.wallet,
    b.membership.neighborhoodId,
    now + 5002,
  );
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0].id, id);
  assert.equal(packet.items[0].scene, 'commons');
  assert.equal(packet.items[0].ping, 'wave');
  assert.equal(JSON.stringify(packet).includes(a.wallet), false);
  assert.equal(
    db.sqlite.prepare('SELECT message FROM crew_messages WHERE id=?').get(id)
      .message,
    QUICK_PINGS.wave,
  );
  assert.equal(
    (
      await crewSignalPacket(
        db,
        b.wallet,
        b.membership.neighborhoodId,
        now + 5000 + SIGNAL_LIFETIME_MS,
      )
    ).items.length,
    0,
  );
});

test('signals enforce neighborhood isolation, mute, both block directions and message removal', async (t) => {
  const {
    db,
    now,
    players: [a, b, , , , outside],
  } = await fixture(t);
  const id = await sendCrewMessage(
    db,
    a.wallet,
    a.controller,
    { ping: 'parts' },
    now,
  );
  const read = () =>
    crewSignalPacket(db, b.wallet, b.membership.neighborhoodId, now + 1);
  assert.equal((await read()).items.length, 1);
  assert.equal(
    (
      await crewSignalPacket(
        db,
        outside.wallet,
        outside.membership.neighborhoodId,
        now + 1,
      )
    ).items.length,
    0,
  );
  await setSocialPreference(db, b.wallet, a.id, 'mute', true);
  assert.equal((await read()).items.length, 0);
  await setSocialPreference(db, b.wallet, a.id, 'mute', false);
  assert.equal((await read()).items.length, 1);
  await setSocialPreference(db, b.wallet, a.id, 'block', true);
  assert.equal((await read()).items.length, 0);
  await setSocialPreference(db, b.wallet, a.id, 'block', false);
  await setSocialPreference(db, a.wallet, b.id, 'block', true);
  assert.equal((await read()).items.length, 0);
  await setSocialPreference(db, a.wallet, b.id, 'block', false);
  db.sqlite.prepare('DELETE FROM crew_messages WHERE id=?').run(id);
  assert.equal((await read()).items.length, 0);
});

test('preset sending keeps the message cooldown, controller fence and explicit preset validation', async (t) => {
  const {
    db,
    now,
    players: [a],
  } = await fixture(t);
  await assert.rejects(
    sendCrewMessage(db, a.wallet, a.controller, { ping: '__proto__' }, now),
    /Choose a crew signal/,
  );
  await assert.rejects(
    sendCrewMessage(
      db,
      a.wallet,
      { ...a.controller, generation: 999 },
      { ping: 'wave' },
      now,
    ),
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM crew_messages').get().n,
    0,
  );
  await sendCrewMessage(db, a.wallet, a.controller, { ping: 'thanks' }, now);
  await assert.rejects(
    sendCrewMessage(db, a.wallet, a.controller, { ping: 'wave' }, now + 4999),
    /Wait a few seconds/,
  );
  await sendCrewMessage(
    db,
    a.wallet,
    a.controller,
    { ping: 'wave' },
    now + 5000,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM crew_messages').get().n,
    2,
  );
});

const signal = (id, createdAt, author = 'a') => ({
  id,
  author,
  name: 'Crew ' + author,
  ping: 'wave',
  scene: 'commons',
  createdAt,
});
test('joining establishes a baseline, repeated snapshots never renew expiry, and stale packets cannot resurrect signals', () => {
  let state = advanceCrewSignals(
    null,
    'wallet:room:scene:generation',
    { observedAt: 1000, items: [signal('old', 990)] },
    5000,
  );
  assert.deepEqual(state.active, []);
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 2000, items: [signal('new', 1500), signal('old', 990)] },
    6000,
  );
  assert.equal(state.active.length, 1);
  const expiry = state.active[0].expiresAt;
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 8000, items: [signal('new', 1500)] },
    12000,
  );
  assert.equal(state.active[0].expiresAt, expiry);
  const same = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 7000, items: [signal('stale', 6999)] },
    13000,
  );
  assert.equal(same, state);
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 26000, items: [signal('new', 1500)] },
    30000,
  );
  assert.equal(state.active.length, 0);
});
test('account, neighborhood, generation and scene changes rebaseline; suppression cannot be undone by replay', () => {
  let state = advanceCrewSignals(
    null,
    'a:room:home:1',
    { observedAt: 1000, items: [] },
    1000,
  );
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 2000, items: [signal('new', 1500)] },
    2000,
  );
  assert.equal(state.active.length, 1);
  for (const scope of [
    'b:room:home:1',
    'a:other:home:1',
    'a:room:commons:1',
    'a:room:home:2',
  ])
    assert.equal(
      advanceCrewSignals(
        state,
        scope,
        { observedAt: 2001, items: [signal('new', 1500)] },
        2001,
      ).active.length,
      0,
    );
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 3000, items: [] },
    3000,
  );
  assert.equal(state.active.length, 0);
  state = advanceCrewSignals(
    state,
    state.scope,
    { observedAt: 4000, items: [signal('new', 1500)] },
    4000,
  );
  assert.equal(state.active.length, 0);
});
test('latest signal per player wins and future-dated, expired and unknown signals are ignored', () => {
  let state = advanceCrewSignals(
    null,
    'a',
    { observedAt: 1000, items: [] },
    1000,
  );
  state = advanceCrewSignals(
    state,
    'a',
    {
      observedAt: 25000,
      items: [
        signal('latest', 24000),
        signal('earlier', 23000),
        signal('future', 25001, 'b'),
        signal('old', 5000, 'c'),
        { ...signal('invalid', 24000, 'd'), ping: 'raw text' },
        signal('ok', 24000, 'e'),
      ],
    },
    25000,
  );
  assert.deepEqual(
    state.active.map((s) => s.id),
    ['latest', 'ok'],
  );
});

test('a send committed after an overlapping empty read is still presented', () => {
  let state = advanceCrewSignals(null, 'a', { observedAt: 1, items: [] }, 1);
  state = advanceCrewSignals(state, 'a', { observedAt: 110, items: [] }, 110);
  state = advanceCrewSignals(
    state,
    'a',
    { observedAt: 130, items: [signal('late-commit', 100)] },
    130,
  );
  assert.equal(state.active[0].id, 'late-commit');
});
test('network delay consumes signal lifetime rather than extending it', () => {
  let state = advanceCrewSignals(
    null,
    'a',
    { observedAt: 1, items: [], requestStartedAt: 1001 },
    1002,
  );
  state = advanceCrewSignals(
    state,
    'a',
    {
      observedAt: 1000,
      items: [signal('delayed', 999)],
      requestStartedAt: 1900,
    },
    21901,
  );
  assert.equal(state.active.length, 0);
});
test('signal migration retains legacy chat and all other database rows without creating historical emotes', async (t) => {
  const { readFileSync } = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const journal = JSON.parse(
    readFileSync(
      new URL('../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  ).entries;
  for (const migration of journal.slice(0, -1))
    db.exec(
      readFileSync(
        new URL('../drizzle/' + migration.tag + '.sql', import.meta.url),
        'utf8',
      ),
    );
  db.prepare(
    'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
  ).run('owner', 'Tech', 1, JSON.stringify(newFacility(1)));
  db.prepare(
    'INSERT INTO crew_messages(id,wallet,message,created_at) VALUES (?,?,?,?)',
  ).run('legacy', 'owner', QUICK_PINGS.wave, 1);
  const before = db.prepare('SELECT * FROM players').get();
  db.exec(
    readFileSync(
      new URL('../drizzle/0011_curly_chameleon.sql', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(db.prepare('SELECT * FROM players').get(), before);
  const message = db.prepare('SELECT * FROM crew_messages').get();
  assert.equal(message.message, QUICK_PINGS.wave);
  assert.equal(message.ping, null);
  assert.equal(message.signal_scene, null);
});
