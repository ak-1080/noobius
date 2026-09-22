import test from 'node:test';
import { realmAnswer } from './realm-answer.mjs';
import assert from 'node:assert/strict';
import { playerProgress, playerLevel, xpForLevel } from '../lib/progression.ts';
import { REALMS, realmRequirement } from '../lib/realm-catalog.ts';
import { fieldQuote, validFieldWork } from '../lib/realm-operations.ts';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
} from '../lib/facility.ts';
import { careerFor } from '../lib/contracts.ts';
import { actionWorksite, needsHome } from '../lib/action-authority.ts';
import { guestProfile } from '../lib/game.ts';
import { GuestSaveStore } from '../lib/guest-save.ts';
import { database } from './sqlite-d1.mjs';
import {
  joinNeighborhood,
  neighborhoodSnapshot,
} from '../lib/neighborhoods-server.ts';

const now = Date.UTC(2026, 8, 20, 12);
const action = (type, extras = {}) => ({
  type,
  requestId: crypto.randomUUID(),
  ...extras,
});
const answer = (p) =>
  p.type === 'boot' ? p.sequence : p.type === 'cooling' ? p.targets : p.mapping;
function equipped() {
  const f = newFacility(now);
  f.inventory = { scrap: 100, copper: 100, silicon: 100, fiber: 100 };
  f.career = careerFor(f);
  f.career.completed = { service: 2, supply: 2, workload: 2 };
  f.career.modules = ['fast'];
  f.career.commissioned = 1;
  return f;
}
function start(
  realm = 'commons',
  approach = 'standard',
  f = equipped(),
  requestId = crypto.randomUUID(),
) {
  return applyFacility(
    f,
    action('field-start', {
      realm,
      id: `field-${realm}-0`,
      direction: approach,
      requestId,
    }),
    1000,
    now,
    { realm, xp: 5000 },
  );
}
function solve(started, at = now + 3000) {
  const run = started.facility.fieldWork.active;
  return applyFacility(
    started.facility,
    action('field-answer', { id: run.id, answer: realmAnswer(run) }),
    1000 + started.credits,
    at,
  );
}

test('earned levels have stable boundaries and keep progressing beyond the last realm', () => {
  for (const level of [1, 2, 3, 5, 8, 20, 100]) {
    const xp = xpForLevel(level);
    assert.equal(playerLevel(xp), level);
    if (level > 1) assert.equal(playerLevel(xp - 1), level - 1);
    assert.equal(playerProgress(xp).remaining, xpForLevel(level + 1) - xp);
  }
  for (const bad of [-1, NaN, Infinity, '1000', 3.5])
    assert.equal(playerLevel(bad), 1);
  assert.match(realmRequirement('gpu', 799, true), /level 5/);
  assert.match(realmRequirement('gpu', 800, false), /license/);
  assert.equal(realmRequirement('thermal', 200, false), null);
});

for (const realm of REALMS)
  test(`${realm.name}: repeatable work consumes quoted inputs, requires the actual diagnostic and delivers once to Storage`, () => {
    const f = equipped(),
      quote = fieldQuote(realm.id, 'standard'),
      started = start(realm.id, 'standard', f);
    assert.equal(started.credits, 0 - quote.compute);
    assert.equal(started.xp, 0);
    for (const [item, n] of Object.entries(quote.cost))
      assert.equal(started.facility.inventory[item], f.inventory[item] - n);
    const run = started.facility.fieldWork.active;
    assert.throws(
      () =>
        applyFacility(
          started.facility,
          action('field-claim', { id: run.id }),
          1000,
          now + 999999,
        ),
      /still running/,
    );
    assert.throws(
      () =>
        applyFacility(
          started.facility,
          action('field-answer', { id: run.id, answer: realmAnswer(run) }),
          1000,
          now,
        ),
      /settle/,
    );
    const solved = solve(started),
      finished = solved.facility.fieldWork.active;
    assert.ok(validFieldWork(solved.facility.fieldWork));
    assert.throws(
      () =>
        applyFacility(
          solved.facility,
          action('field-claim', { id: run.id }),
          1000,
          finished.readyAt - 1,
        ),
      /still running/,
    );
    solved.facility.inventory.scrap = 100000;
    const claim = action('field-claim', { id: run.id });
    const collected = applyFacility(
      solved.facility,
      claim,
      1000,
      finished.readyAt,
    );
    assert.equal(collected.xp, quote.xp);
    assert.equal(collected.facility.fieldWork.completed[realm.id], 1);
    assert.equal(collected.facility.fieldWork.clean[realm.id], 1);
    assert.equal(collected.facility.fieldWork.active, null);
    assert.equal(collected.facility.skills[realm.skill], quote.xp);
    for (const [item, n] of Object.entries(quote.reward))
      assert.equal(collected.facility.bank[item], n);
    assert.equal(
      applyFacility(collected.facility, claim, 1000, finished.readyAt).xp,
      0,
    );
    assert.throws(
      () =>
        applyFacility(
          collected.facility,
          action('field-claim', { id: run.id }),
          1000,
          finished.readyAt,
        ),
      /already/,
    );
    assert.ok(
      start(realm.id, 'standard', collected.facility).facility.fieldWork.active,
    );
  });

test('a paid diagnostic and earned results remain finishable after leaving or losing holder access', () => {
  const started = start('core'),
    run = started.facility.fieldWork.active;
  const wrong = applyFacility(
    started.facility,
    action('field-answer', { id: run.id, answer: [] }),
    920,
    now + 3000,
  );
  assert.equal(wrong.credits, 0);
  assert.equal(wrong.xp, 0);
  assert.equal(wrong.facility.fieldWork.active.state, 'diagnostics');
  assert.equal(wrong.facility.fieldWork.active.checkAt, now + 7000);
  const correct = applyFacility(
    wrong.facility,
    action('field-answer', { id: run.id, answer: realmAnswer(run) }),
    920,
    now + 7000,
  );
  const final = applyFacility(
    correct.facility,
    action('field-claim', { id: run.id }),
    920,
    now + 100000,
  );
  assert.equal(final.xp, 40);
  assert.equal(final.facility.fieldWork.clean.core, undefined);
  assert.equal(
    actionWorksite(started.facility, { type: 'field-answer' }),
    undefined,
  );
  assert.equal(needsHome({ type: 'field-answer' }), false);
  assert.equal(
    actionWorksite(started.facility, { type: 'field-start' }).id,
    'bank',
  );
});

test('access, invalid input and insufficient resources cannot start field work', () => {
  const f = newFacility(now);
  const call = (a, context) => applyFacility(f, a, 0, now, context);
  assert.throws(
    () =>
      call(action('field-start', { realm: 'core', direction: 'standard' }), {
        realm: 'commons',
        xp: 5000,
      }),
    /another realm/,
  );
  assert.throws(
    () =>
      call(
        action('field-start', {
          realm: 'thermal',
          id: 'field-thermal-0',
          direction: 'standard',
        }),
        {
          realm: 'thermal',
          xp: 0,
        },
      ),
    /level 3/,
  );
  assert.throws(
    () =>
      call(action('field-start', { realm: 'gpu', direction: 'standard' }), {
        realm: 'gpu',
        xp: 800,
      }),
    /license/,
  );
  assert.throws(
    () =>
      call(
        action('field-start', {
          realm: 'thermal',
          id: 'field-thermal-0',
          direction: 'standard',
        }),
        {
          realm: 'thermal',
          xp: 200,
        },
      ),
    /Compute/,
  );
  assert.throws(
    () =>
      call(
        action('field-start', { realm: 'commons', direction: 'free-money' }),
        { realm: 'commons', xp: 0 },
      ),
    /approach/,
  );
  assert.throws(
    () =>
      call(action('field-start', { realm: 'commons', direction: 'standard' })),
    /Visit/,
  );
  assert.equal(needsHome({}), false);
  assert.equal(needsHome({ type: 3 }), false);
  assert.deepEqual(f.inventory, {});
});

test('recovery approaches exchange time and supplies without selling extra XP', () => {
  for (const realm of REALMS) {
    const normal = fieldQuote(realm.id, 'standard'),
      deep = fieldQuote(realm.id, 'careful'),
      fast = fieldQuote(realm.id, 'express');
    assert.ok(deep.compute > normal.compute);
    assert.ok(deep.seconds > normal.seconds);
    assert.ok(fast.seconds < normal.seconds);
    assert.equal(fast.cost.copper, (normal.cost.copper ?? 0) + 2);
    assert.equal(deep.xp, normal.xp);
    assert.equal(fast.xp, normal.xp);
    for (const [item, n] of Object.entries(normal.reward))
      assert.equal(deep.reward[item], n * 2);
  }
});

test('request history eviction cannot make an old answer or claim identify a new recovery', () => {
  const requestId = crypto.randomUUID(),
    started = start('commons', 'standard', equipped(), requestId),
    run = started.facility.fieldWork.active;
  const finished = solve(started),
    claim = action('field-claim', { id: run.id });
  let f = applyFacility(finished.facility, claim, 1000, now + 40000).facility;
  for (let i = 0; i < 110; i++)
    f = applyFacility(
      f,
      action('travel', { id: 'commons' }),
      1000,
      now + 50000 + i,
    ).facility;
  assert.ok(!f.requests.includes(requestId));
  const newer = start('commons', 'standard', f, requestId);
  assert.notEqual(newer.facility.fieldWork.active.id, run.id);
  assert.throws(
    () =>
      applyFacility(
        newer.facility,
        action('field-answer', { id: run.id, answer: realmAnswer(run) }),
        1000,
        now + 60000,
      ),
    /no longer/,
  );
  const newReady = solve(newer);
  assert.throws(
    () => applyFacility(newReady.facility, claim, 1000, now + 100000),
    /already.*changed/,
  );
});

test('existing saves and active diagnostics survive reload; malformed/newer field data fails closed', () => {
  const original = newFacility(now),
    old = normalizeFacility(JSON.parse(JSON.stringify(original)), now);
  assert.equal(old.fieldWork, undefined);
  assert.deepEqual(old.builds, original.builds);
  const started = start('commons'),
    saved = JSON.parse(JSON.stringify(started.facility.fieldWork));
  assert.ok(validFieldWork(saved));
  for (const corrupt of [
    (v) => {
      delete v.active.puzzle.labels;
    },
    (v) => {
      v.active.puzzle.labels = 'crash';
    },
    (v) => {
      v.version = 2;
    },
    (v) => {
      v.active.realm = 'unknown';
    },
    (v) => {
      v.active.seconds = Infinity;
    },
    (v) => {
      v.active.state = 'processing';
      v.active.readyAt = 0;
    },
  ]) {
    const bad = structuredClone(saved);
    corrupt(bad);
    assert.equal(validFieldWork(bad), false);
    assert.throws(() =>
      normalizeFacility({ ...original, fieldWork: bad }, now),
    );
  }
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    };
  const p = guestProfile();
  p.facility = started.facility;
  p.credits = 1000 + started.credits;
  p.xp = 900;
  const store = new GuestSaveStore(
    () => storage,
    () => now,
  );
  store.read();
  assert.equal(store.write(p, null).kind, 'saved');
  const reloaded = new GuestSaveStore(
    () => storage,
    () => now + 5000,
  ).read().snapshot;
  assert.equal(reloaded.profile.facility.fieldWork.active.id, saved.active.id);
  assert.equal(reloaded.profile.xp, 900);
});

test('database admission enforces earned levels, free realms work without a token, and holder worlds stay closed without proof', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const wallet = '0x' + 'c'.repeat(40),
    clientId = crypto.randomUUID(),
    clock = Date.now();
  db.sqlite
    .prepare(
      'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
    )
    .run(wallet, 'Realm tester', clock, JSON.stringify(equipped()));
  const first = await joinNeighborhood(
    db,
    wallet,
    'commons',
    0,
    clientId,
    {},
    clock,
  );
  await assert.rejects(
    joinNeighborhood(db, wallet, 'thermal', 0, clientId, {}, clock),
    /level 3/,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT neighborhood_id FROM crew_presence WHERE wallet=?')
      .get(wallet).neighborhood_id,
    first.neighborhoodId,
  );
  db.sqlite.prepare('UPDATE players SET xp=200 WHERE wallet=?').run(wallet);
  const cooling = await joinNeighborhood(
    db,
    wallet,
    'thermal',
    0,
    clientId,
    {},
    clock,
  );
  assert.equal(cooling.realm, 'thermal');
  db.sqlite.prepare('UPDATE players SET xp=2450 WHERE wallet=?').run(wallet);
  await assert.rejects(
    joinNeighborhood(db, wallet, 'gpu', 1, clientId, {}, clock),
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT neighborhood_id FROM crew_presence WHERE wallet=?')
      .get(wallet).neighborhood_id,
    cooling.neighborhoodId,
  );
  const core = await joinNeighborhood(
    db,
    wallet,
    'core',
    1,
    clientId,
    { permit: { localTest: true, policy: null } },
    clock,
  );
  assert.equal(core.realm, 'core');
  await assert.rejects(
    joinNeighborhood(db, wallet, 'void', 0, clientId, {}, clock),
    /valid realm/,
  );
  const state = await neighborhoodSnapshot(
    db,
    wallet,
    { clientId, generation: core.generation },
    clock,
  );
  assert.equal(state.membership.realm, 'core');
});
