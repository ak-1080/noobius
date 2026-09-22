import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
  ITEMS,
  OBJECTS,
  ZONES,
  storedComputeNow,
} from '../lib/facility.ts';
import {
  commissionOffers,
  commissionQuote,
  newCommissions,
  validCommissions,
  milestoneProgress,
} from '../lib/commissions.ts';
import {
  careerFor,
  availableRacks,
  contractTemplate,
} from '../lib/contracts.ts';
import { canTrade } from '../lib/market.ts';
import {
  makeRealmChallenge,
  validRealmChallenge,
  solveRealmChallenge,
} from '../lib/realm-challenges.ts';
import { validFieldWork } from '../lib/realm-operations.ts';
import { realmSites, realmWorld } from '../lib/realm-worlds.ts';
import { floorClear, legalMovement } from '../lib/world-navigation.ts';
import { planPath } from '../lib/navigation.ts';
import { returnSummary, facilityReceipt } from '../lib/game-feedback.ts';
import { worldWork } from '../lib/world-work.ts';
import { shiftObjective } from '../lib/experience.ts';
import { GuestSaveStore } from '../lib/guest-save.ts';
import { guestProfile } from '../lib/game.ts';
import { realmAnswer } from './realm-answer.mjs';
const t = Date.UTC(2026, 8, 20, 12);
function fixture() {
  const f = normalizeFacility(newFacility(t), t);
  f.compute = 100000;
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 1000]));
  f.unlocked = ZONES.map((z) => z.id);
  f.builds = Object.fromEntries(
    OBJECTS.filter((o) => o.kind === 'build').map((o) => [o.id, 3]),
  );
  f.computeBoost = 5;
  f.seen.push('intro:identity', 'intro:welcome');
  f.career = careerFor(f);
  f.career.completed = { service: 2, supply: 2, workload: 2 };
  f.career.modules = ['fast'];
  f.career.commissioned = 1;
  return f;
}
const action = (type, rest = {}) => ({
  type,
  requestId: crypto.randomUUID(),
  ...rest,
});
const act = (f, type, now = t, rest = {}) =>
  applyFacility(f, action(type, rest), f.compute, now).facility;
function book(f, kind = 'fast', now = t, rack = 'rack-a', quantity = 2) {
  return act(f, 'commission-start', now, {
    id: commissionOffers(f).find((o) => o.kind === kind).id,
    rack,
    quantity,
  });
}
function deliver(f, kind = 'fast', now = t) {
  f = book(f, kind, now);
  const run = f.commissions.active[0];
  return [
    act(f, 'commission-claim', run.readyAt, { id: run.id }),
    run.readyAt + 1,
  ];
}
function recover(f, realm, now = t) {
  f = applyFacility(
    f,
    action('field-start', {
      id: `field-${realm}-0`,
      realm,
      direction: 'standard',
    }),
    f.compute,
    now,
    { realm, xp: 5000 },
  ).facility;
  let r = f.fieldWork.active;
  f = act(f, 'field-answer', r.checkAt, { id: r.id, answer: realmAnswer(r) });
  r = f.fieldWork.active;
  return [act(f, 'field-claim', r.readyAt, { id: r.id }), r.readyAt + 1];
}

test('three genuinely competing clients rotate while accepted terms and machine use stay frozen', () => {
  const f = fixture(),
    board = commissionOffers(f);
  assert.equal(new Set(board.map((o) => o.client)).size, 3);
  const started = book(f),
    run = structuredClone(started.commissions.active[0]);
  assert.ok(!availableRacks(started, t).includes('rack-a'));
  assert.ok(validCommissions(started.commissions));
  assert.notDeepEqual(commissionOffers(started), board);
  assert.throws(
    () =>
      act(started, 'commission-start', t, { id: board[1].id, rack: 'rack-b' }),
    /changed/,
  );
  assert.throws(
    () =>
      act(started, 'commission-start', t, {
        id: commissionOffers(started)[0].id,
        rack: 'rack-a',
      }),
    /available/,
  );
  assert.throws(() => act(started, 'compute-upgrade', t), /commissions/);
  assert.throws(() => act(started, 'build', t, { id: 'rack-a' }), /commission/);
  started.power = 3;
  started.cooling = 3;
  assert.deepEqual(started.commissions.active[0], run);
  assert.equal(
    storedComputeNow(started, run.readyAt),
    storedComputeNow(f, run.readyAt) - run.lostIdle,
  );
  assert.throws(
    () => act(started, 'commission-claim', run.readyAt - 1, { id: run.id }),
    /processing/,
  );
  const result = applyFacility(
    started,
    action('commission-claim', { id: run.id }),
    started.compute,
    run.readyAt,
  );
  assert.equal(result.credits, run.reward);
  assert.equal(result.xp, run.xp);
  assert.equal(result.facility.daily.computeEarned, run.reward);
  assert.equal(result.facility.stats.computeEarned, run.reward);
  assert.equal(result.facility.commissions.completed.fast, 1);
  assert.ok(availableRacks(result.facility, run.readyAt).includes(run.rack));
  assert.match(
    facilityReceipt(started, action('commission-claim', { id: run.id }), result)
      .title,
    /paid/,
  );
  assert.throws(
    () => act(result.facility, 'commission-claim', run.readyAt, { id: run.id }),
    /already/,
  );
});
test('client capacity, shared slots and invalid input fail without spending', () => {
  const f = fixture();
  for (const quantity of [0, -1, 1.5, 31, NaN])
    assert.throws(() => book(f, 'fast', t, 'rack-a', quantity));
  assert.equal(f.compute, 100000);
  let s = book(f);
  s = book(s, 'efficient', t, 'rack-b');
  assert.throws(() => book(s, 'stable', t, 'rack-c'), /Two client/);
  assert.throws(
    () => act(s, 'contract-accept', t, { id: s.career.offers[0].id }),
    /client|job|two/i,
  );
  const poor = fixture();
  poor.inventory = {};
  assert.throws(() => book(poor), /supplies/);
  assert.equal(poor.compute, 100000);
  const q = commissionQuote(f, 'fast', 'rack-a', 1);
  assert.throws(() => book(f, 'fast', t, 'rack-a', q.capacity + 1), /fit/);
});
test('certifications require earned records, cost resources, preserve other branches and cannot replay into next tier', () => {
  let f = fixture();
  assert.throws(
    () => act(f, 'commission-certify', t, { id: 'fast', quantity: 1 }),
    /Finish/,
  );
  let now = t;
  for (let i = 0; i < 3; i++) [f, now] = deliver(f, 'fast', now);
  const before = commissionQuote(f, 'fast', 'rack-b', 2),
    a = action('commission-certify', { id: 'fast', quantity: 1 });
  const result = applyFacility(f, a, f.compute, now);
  f = result.facility;
  assert.equal(result.credits, -500);
  assert.equal(f.commissions.certificates.fast, 1);
  assert.equal(f.commissions.certificates.efficient, 0);
  assert.ok(commissionQuote(f, 'fast', 'rack-b', 2).seconds < before.seconds);
  f.commissions.completed.fast = 18;
  f.requests = [];
  assert.throws(() => applyFacility(f, a, f.compute, now), /changed/);
  assert.equal(f.commissions.certificates.fast, 1);
  const resourceful = commissionQuote(f, 'efficient', 'rack-b', 3);
  f.commissions.certificates.efficient = 3;
  const advanced = commissionQuote(f, 'efficient', 'rack-b', 3);
  assert.ok(advanced.cost.silicon < resourceful.cost.silicon);
  assert.equal(advanced.seconds, resourceful.seconds);
  assert.ok(advanced.capacity > resourceful.capacity);
});
test('maxed players finish two fresh free-world distinction portfolios without resetting their center', () => {
  let f = fixture(),
    now = t;
  const originalBuilds = { ...f.builds };
  assert.equal(milestoneProgress(f).ready, false);
  assert.throws(
    () => act(f, 'commission-milestone', now, { id: 'milestone-1' }),
    /Finish/,
  );
  for (let chapter = 1; chapter <= 2; chapter++) {
    const needed = milestoneProgress(f).needed;
    for (let i = 0; i < needed; i++)
      [f, now] = deliver(f, i % 2 ? 'efficient' : 'fast', now);
    assert.equal(milestoneProgress(f).ready, false);
    [f, now] = recover(f, 'commons', now);
    [f, now] = recover(f, 'thermal', now);
    assert.equal(milestoneProgress(f).ready, true);
    const prior = f,
      request = action('commission-milestone', { id: `milestone-${chapter}` }),
      r = applyFacility(f, request, f.compute, now);
    f = r.facility;
    assert.equal(r.credits, -milestoneProgress(prior).compute);
    assert.equal(r.xp, 60);
    assert.equal(f.commissions.milestone, chapter);
    assert.deepEqual(f.builds, originalBuilds);
    assert.equal(milestoneProgress(f).jobs, 0);
    assert.equal(milestoneProgress(f).visits.reclaim, 0);
    assert.equal(milestoneProgress(f).ready, false);
    f.requests = [];
    assert.throws(() => applyFacility(f, request, f.compute, now), /advanced/);
    assert.equal(shiftObjective(f, f.compute, now).panel, 'operations');
  }
});
test('completed and running work is discoverable after returning and survives guest serialization', () => {
  let f = book(fixture());
  const run = f.commissions.active[0];
  assert.equal(returnSummary(f, run.readyAt).work[0].panel, 'operations');
  assert.equal(
    worldWork(f, run.readyAt).find((w) => w.key === 'client:' + run.id).phase,
    'ready',
  );
  f = applyFacility(
    f,
    action('field-start', {
      id: 'field-commons-0',
      realm: 'commons',
      direction: 'standard',
    }),
    f.compute,
    t,
    { realm: 'commons', xp: 5000 },
  ).facility;
  assert.ok(
    returnSummary(f, run.readyAt).work.some((w) => w.panel === 'field'),
  );
  const profile = guestProfile();
  profile.facility = f;
  profile.credits = f.compute;
  let data;
  const storage = {
    getItem: () => data ?? null,
    setItem: (_, v) => {
      data = v;
    },
  };
  const store = new GuestSaveStore(
    () => storage,
    () => t,
  );
  store.read();
  assert.equal(store.write(profile, null).kind, 'saved');
  const restored = new GuestSaveStore(
    () => storage,
    () => t,
  ).read();
  assert.ok(restored.snapshot);
  assert.deepEqual(
    restored.snapshot.profile.facility.commissions,
    f.commissions,
  );
  assert.deepEqual(restored.snapshot.profile.facility.fieldWork, f.fieldWork);
});
for (const realm of ['commons', 'thermal', 'gpu', 'core'])
  test(`${realm}: all stations are reachable and repeated activities vary without becoming unsolvable`, () => {
    const f = fixture(),
      clear = (x, z) => floorClear(f, true, x, z, realm),
      seen = new Set();
    for (const site of realmSites(realm))
      for (const [x, z] of [
        [site.x, site.z + 1.65],
        [site.x + 1.65, site.z],
        [site.x - 1.65, site.z],
        [site.x, site.z - 1.65],
      ]) {
        const path = planPath([0, 17], [x, z], clear, 0.5, 18000);
        assert.ok(path.length, `${site.id}: ${x},${z}`);
        assert.ok(path.every((p) => clear(...p)));
        let from = { x: 0, z: 17 };
        for (const [px, pz] of path) {
          assert.ok(
            legalMovement(f, true, from, { x: px, z: pz }, 1000, realm),
          );
          from = { x: px, z: pz };
        }
      }
    for (let i = 0; i < 100; i++) {
      const c = makeRealmChallenge(realm);
      assert.ok(validRealmChallenge(c));
      const solution = realmAnswer({ challenge: c });
      assert.ok(solveRealmChallenge(c, solution));
      assert.equal(solveRealmChallenge(c, []), false);
      seen.add(JSON.stringify(c));
    }
    assert.ok(seen.size > 10);
    assert.equal(clear(80, 80), false);
    assert.equal(
      new Set(realmWorld(realm).floors.map((r) => JSON.stringify(r))).size,
      realmWorld(realm).floors.length,
    );
  });
test('invalid and impossible challenges fail closed, old already-paid diagnostics still finish', () => {
  assert.equal(
    validRealmChallenge({
      kind: 'pipes',
      tiles: Array(9).fill('straight'),
      rotations: Array(9).fill(0),
    }),
    false,
  );
  assert.equal(
    validRealmChallenge({
      kind: 'scheduler',
      jobs: Array(4).fill({ name: 'live', slots: 5, latency: true }),
      capacity: [1, 1],
    }),
    false,
  );
  assert.equal(
    validRealmChallenge({
      kind: 'restore',
      model: 'N-7',
      snapshots: Array(4).fill({
        name: 'x',
        minute: 2,
        complete: false,
        model: 'N-7',
      }),
    }),
    false,
  );
  let f = fixture();
  assert.throws(
    () =>
      applyFacility(
        f,
        action('field-start', { realm: 'commons', direction: 'standard' }),
        f.compute,
        t,
        { realm: 'commons', xp: 5000 },
      ),
    /worksite/,
  );
  f = applyFacility(
    f,
    action('field-start', {
      id: 'field-commons-0',
      realm: 'commons',
      direction: 'standard',
    }),
    f.compute,
    t,
    { realm: 'commons', xp: 5000 },
  ).facility;
  const invalid = structuredClone(f.fieldWork);
  invalid.active.challenge = makeRealmChallenge('core');
  assert.equal(validFieldWork(invalid), false);
  delete f.fieldWork.active.challenge;
  delete f.fieldWork.active.site;
  assert.ok(validFieldWork(f.fieldWork));
  const r = f.fieldWork.active;
  f = act(f, 'field-answer', r.checkAt, { id: r.id, answer: realmAnswer(r) });
  assert.equal(f.fieldWork.active.state, 'processing');
});

test('rotating demand gives all three specialties a strong mature-player use case', () => {
  const f = fixture();
  f.power = f.cooling = 3;
  f.commissions = newCommissions();
  const names = ['fast', 'efficient', 'stable'];
  for (let tier = 0; tier <= 3; tier++)
    for (let scale = 0; scale < 4; scale++)
      for (let index = 0; index < 3; index++) {
        f.commissions.certificates = {
          fast: tier,
          efficient: tier,
          stable: tier,
        };
        f.commissions.milestone = scale * 2;
        f.commissions.serial = index + 1;
        const quotes = names.map((kind) => {
          const q = commissionQuote(f, kind, 'rack-g', 30);
          const materials = Object.entries(q.cost).reduce(
            (s, [id, n]) => s + ITEMS[id].buy * n,
            0,
          );
          return {
            kind,
            net: (q.reward - q.fee - q.lostIdle - materials) / q.seconds,
          };
        });
        quotes.sort((a, b) => b.net - a.net);
        assert.equal(
          quotes[0].kind,
          names[index],
          JSON.stringify({ tier, scale, index, quotes }),
        );
      }
});
test('unsupported cross-ledger saves cannot create impossible reservations or purchased achievements', () => {
  const f = book(fixture());
  const bad = structuredClone(f);
  bad.commissions.fieldBaseline.commons = 5;
  assert.throws(() => normalizeFacility(bad, t), /commission/);
  const fake = structuredClone(f);
  fake.commissions.certificates.fast = 3;
  assert.throws(() => normalizeFacility(fake, t), /commission/);
  const orphan = structuredClone(f);
  delete orphan.builds['rack-a'];
  assert.throws(() => normalizeFacility(orphan, t), /commission/);
});
test('an unclaimed completed machine bonus can share the rack with a later commission without invalidating the save', () => {
  let f = fixture();
  f = act(f, 'compute-start', t, { id: 'quick' });
  const bonus = f.workload,
    at = bonus.readyAt + 1;
  f = book(f, 'fast', at, bonus.rack, 1);
  assert.ok(normalizeFacility(f, at));
  const reward = f.workload.reward;
  const old = f.compute;
  f = act(f, 'compute-collect', at + 1);
  assert.equal(f.compute, old + reward);
  assert.equal(f.commissions.active.length, 1);
  assert.ok(normalizeFacility(f, at + 2));
});

test('client payment earns trading access without legacy jobs or upgrades', () => {
  let f = newFacility(t);
  f.builds = { 'rack-a': 1 };
  f.compute = 100;
  f.inventory = { silicon: 3, copper: 6 };
  assert.equal(canTrade(f), false);
  f = book(f, 'fast', t, 'rack-a', 1);
  assert.equal(canTrade(f), false);
  const run = f.commissions.active[0];
  f = act(f, 'commission-claim', run.readyAt, { id: run.id });
  assert.equal(canTrade(f), true);
  assert.equal(f.computeBoost, 0);
  assert.equal(
    Object.values(careerFor(f).completed).reduce((a, b) => a + b, 0),
    0,
  );
});

test('mature guidance supports legacy saves and does not hide a ready payment behind processing recovery', () => {
  let f = fixture();
  assert.equal(shiftObjective(f, f.compute, t).panel, 'operations');
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  f = act(f, 'contract-accept', t, { id: offer.id });
  f = act(f, 'contract-start', t, { id: offer.id, rack: 'rack-a' });
  const at = f.career.active[0].readyAt;
  f = applyFacility(
    f,
    action('field-start', {
      id: 'field-commons-0',
      realm: 'commons',
      direction: 'standard',
    }),
    f.compute,
    at,
    { realm: 'commons', xp: 5000 },
  ).facility;
  let field = f.fieldWork.active;
  f = act(f, 'field-answer', field.checkAt, {
    id: field.id,
    answer: realmAnswer(field),
  });
  field = f.fieldWork.active;
  assert.equal(
    shiftObjective(f, f.compute, field.checkAt).title,
    'Your work paid off',
  );
  assert.equal(shiftObjective(f, f.compute, field.readyAt).panel, 'field');
});
