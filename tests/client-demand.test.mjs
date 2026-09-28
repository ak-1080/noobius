import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFacility,
  newActiveFacility,
  newFacility,
  normalizeFacility,
  ITEMS,
  OBJECTS,
  ZONES,
} from '../lib/facility.ts';
import { contractFor, serviceChallenge } from '../lib/contracts.ts';
import { commissionOffers } from '../lib/commissions.ts';
import {
  CLIENT_DEMAND,
  clientDemandStatus,
  clientDemandQuote,
  validClientDemand,
} from '../lib/client-demand.ts';
import { shiftObjective } from '../lib/experience.ts';
import { careerSuggestions } from '../lib/job-choices.ts';

const t = Date.UTC(2026, 8, 28, 23, 50);
const request = (type, extra = {}) => ({
  type,
  requestId: crypto.randomUUID(),
  ...extra,
});
const act = (f, type, now = t, extra = {}) =>
  applyFacility(f, request(type, extra), f.compute, now).facility;
function fixture(active = true) {
  const f = normalizeFacility(
    active ? newActiveFacility(t) : newFacility(t),
    t,
  );
  f.compute = 100000;
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 1000]));
  f.builds = Object.fromEntries(
    OBJECTS.filter((o) => o.kind === 'build').map((o) => [o.id, 3]),
  );
  f.unlocked = ZONES.map((z) => z.id);
  f.career.completed = { service: 25, supply: 25, workload: 25 };
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.loadout = ['fast', 'efficient'];
  return f;
}
const booking = (i, reward, at = t) => ({
  kind: i % 2 ? 'job' : 'commission',
  id: `booked-${String(i).padStart(3, '0')}`,
  at,
  reward,
});
function accept(f, family, now = t, template) {
  const offer = f.career.offers.find((o) => contractFor(o).family === family);
  if (template) offer.template = template;
  return [act(f, 'contract-accept', now, { id: offer.id }), offer.id];
}
function start(f, family, now = t, extra = {}) {
  let id;
  [f, id] = accept(f, family, now, extra.template);
  f = act(f, 'contract-start', now, {
    id,
    ...(family === 'workload' ? { rack: 'rack-g' } : {}),
    ...extra,
  });
  return [f, id];
}
function collect(f, id) {
  const run = f.career.active.find((r) => r.id === id);
  let now = run.readyAt;
  if (contractFor(run).family === 'service') {
    now = run.nextStepAt;
    for (const direction of ['Inspect', serviceChallenge(run).answer, 'Test']) {
      f = act(f, 'contract-service', now, { id, direction });
      now = f.career.active.find((r) => r.id === id).nextStepAt;
    }
  }
  return [act(f, 'contract-claim', now, { id }), now];
}

test('all three job families and the specialist desk share a persisted 12-booking allowance', () => {
  let f = fixture(),
    now = t;
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 3) {
      f = act(f, 'commission-start', now, {
        id: commissionOffers(f)[0].id,
        rack: 'rack-g',
        quantity: 1,
      });
      const run = f.commissions.active[0];
      now = run.readyAt;
      f = act(f, 'commission-claim', now, { id: run.id });
    } else {
      let id;
      [f, id] = start(f, ['service', 'supply', 'workload'][i % 4], now);
      [f, now] = collect(f, id);
    }
    now++;
    f = normalizeFacility(JSON.parse(JSON.stringify(f)), now);
    assert.equal(clientDemandStatus(f, now).usedBookings, i + 1);
  }
  const status = clientDemandStatus(f, now);
  assert.equal(status.remainingBookings, 0);
  assert.ok(
    status.usedCompute < CLIENT_DEMAND.compute,
    'Booking count blocks even when payment allowance remains',
  );
  for (const family of ['service', 'supply', 'workload'])
    assert.throws(() => start(f, family, now), /bookings are used/);
  assert.throws(
    () =>
      act(f, 'commission-start', now, {
        id: commissionOffers(f)[0].id,
        rack: 'rack-g',
      }),
    /bookings are used/,
  );
});

test('the 4,000 allowance counts full promised payment at start, independently of collection', () => {
  let f = fixture();
  f.clientDemand.bookings = [booking(1, 3812)];
  // Tiny-model one unit pays 56; five pays 184, leaving just 4 of the 188.
  [f] = start(f, 'workload', t, { template: 'tiny-model', quantity: 5 });
  const run = f.career.active[0];
  assert.equal(run.reward, 184);
  assert.equal(clientDemandStatus(f, t).remainingCompute, 4);
  const before = structuredClone(f);
  assert.throws(() => start(f, 'supply', t + 1), /client demand/);
  assert.throws(
    () =>
      act(f, 'commission-start', t + 1, {
        id: commissionOffers(f)[0].id,
        rack: 'rack-f',
      }),
    /client demand/,
  );
  assert.deepEqual(
    f,
    before,
    'Denied starts consume no inputs, fee or allowance',
  );
  const after = collect(f, run.id)[0];
  assert.equal(after.compute, f.compute + run.reward);
  assert.equal(
    clientDemandStatus(after, t + 1000000).remainingCompute,
    4,
    'Claiming does not return demand',
  );
});

test('an exact allowance fit is legal, but an oversized batch cannot start with empty demand', () => {
  const f = fixture();
  f.clientDemand.bookings = [booking(1, 3944)];
  const [started] = start(f, 'workload', t, {
    template: 'tiny-model',
    quantity: 1,
  });
  assert.equal(clientDemandStatus(started, t).remainingCompute, 0);
  assert.equal(clientDemandQuote(started, 1, t).allowed, false);
  const empty = fixture();
  assert.throws(
    () =>
      start(empty, 'workload', t, {
        template: 'wobbly-training',
        quantity: 30,
      }),
    /Choose a smaller batch/,
  );
  const [smaller] = start(empty, 'workload', t, {
    template: 'wobbly-training',
    quantity: 17,
  });
  assert.ok(smaller.career.active[0].reward <= CLIENT_DEMAND.compute);
});

test('request replay, failed starts and canceling unstarted jobs neither refund nor multiply demand', () => {
  let f = fixture(),
    id;
  [f, id] = accept(f, 'workload', t, 'tiny-model');
  const accepted = structuredClone(f);
  f.inventory = {};
  assert.throws(
    () => act(f, 'contract-start', t, { id, rack: 'rack-g' }),
    /missing parts/,
  );
  assert.equal(clientDemandStatus(f, t).usedBookings, 0);
  f = accepted;
  f = act(f, 'contract-cancel', t, { id });
  [f, id] = accept(f, 'workload', t);
  const a = request('contract-start', { id, rack: 'rack-g' });
  f = applyFacility(f, a, f.compute, t).facility;
  const after = structuredClone(f);
  const replay = applyFacility(f, a, f.compute, t + 10);
  assert.equal(replay.credits, 0);
  assert.deepEqual(replay.facility.clientDemand, after.clientDemand);
  assert.deepEqual(replay.facility.inventory, after.inventory);
  assert.throws(() => act(f, 'contract-cancel', t, { id }), /already started/);
  assert.throws(
    () => act(f, 'contract-start', t, { id, rack: 'rack-g' }),
    /already started/,
  );
  f = act(f, 'module-equip', t, { id: 'stable' });
  assert.deepEqual(f.clientDemand, after.clientDemand);
  const readyAt = f.career.active[0].readyAt;
  const claim = request('contract-claim', { id });
  f = applyFacility(f, claim, f.compute, readyAt).facility;
  f.requests = [];
  assert.throws(
    () => act(f, 'contract-claim', readyAt, { id }),
    /no longer active/,
  );
  assert.deepEqual(
    f.clientDemand,
    after.clientDemand,
    'A finished offer stays spent outside the retry cache',
  );
});

test('the specialist desk spends demand once and cannot evade it through new board serials or retries', () => {
  let f = fixture();
  f.clientDemand.bookings = Array.from({ length: 11 }, (_, i) =>
    booking(i, 100),
  );
  const a = request('commission-start', {
    id: commissionOffers(f)[0].id,
    rack: 'rack-g',
  });
  f = applyFacility(f, a, f.compute, t).facility;
  const ledger = structuredClone(f.clientDemand);
  assert.equal(clientDemandStatus(f, t).usedBookings, 12);
  f = applyFacility(f, a, f.compute, t).facility;
  assert.deepEqual(f.clientDemand, ledger);
  assert.throws(
    () =>
      act(f, 'commission-start', t, {
        id: commissionOffers(f)[0].id,
        rack: 'rack-f',
      }),
    /bookings are used/,
  );
  const run = f.commissions.active[0];
  f = act(f, 'commission-claim', run.readyAt, { id: run.id });
  assert.deepEqual(f.clientDemand, ledger);
});

test('two accepted jobs compete for the last booking and a smaller budget cannot be overspent', () => {
  const initial = fixture();
  initial.clientDemand.bookings = Array.from({ length: 11 }, (_, i) =>
    booking(i, 100),
  );
  const [one, a] = accept(initial, 'supply');
  const [two, b] = accept(one, 'workload');
  const f = act(two, 'contract-start', t, { id: a });
  assert.equal(clientDemandStatus(f, t).usedBookings, 12);
  const before = structuredClone(f);
  assert.throws(
    () => act(f, 'contract-start', t, { id: b, rack: 'rack-g' }),
    /bookings are used/,
  );
  assert.deepEqual(f, before);
});

test('24-hour expiry is rolling, survives reload and midnight, and does not bank unused days', () => {
  const f = fixture();
  f.clientDemand.bookings = [booking(1, 2200, t), booking(2, 1800, t + 60000)];
  const reload = (at) => normalizeFacility(JSON.parse(JSON.stringify(f)), at);
  assert.equal(
    clientDemandQuote(reload(t + 3600000), 1, t + 3600000).allowed,
    false,
    'UTC midnight is not a reset',
  );
  assert.equal(
    clientDemandQuote(
      reload(t + CLIENT_DEMAND.windowMs - 1),
      1,
      t + CLIENT_DEMAND.windowMs - 1,
    ).allowed,
    false,
  );
  const at = t + CLIENT_DEMAND.windowMs;
  assert.equal(clientDemandStatus(reload(at), at).remainingCompute, 2200);
  assert.equal(clientDemandQuote(reload(at), 2200, at).allowed, true);
  assert.equal(clientDemandQuote(f, 2201, at).availableAt, at + 60000);
  const week = t + 7 * CLIENT_DEMAND.windowMs;
  const [started] = start(reload(week), 'workload', week, {
    template: 'tiny-model',
  });
  assert.equal(
    started.clientDemand.bookings.length,
    1,
    'Expired history is pruned on booking',
  );
  assert.equal(clientDemandStatus(started, week).remainingBookings, 11);
  assert.equal(clientDemandStatus(started, week).remainingCompute, 3944);
});

test('migration preserves already-running promises even above the new cap, and never rewards them twice', () => {
  const [old, id] = start(fixture(false), 'workload', t, {
    template: 'wobbly-training',
    quantity: 30,
  });
  const run = structuredClone(old.career.active[0]);
  assert.ok(run.reward > CLIENT_DEMAND.compute);
  let f = normalizeFacility(JSON.parse(JSON.stringify(old)), t + 1, 3);
  assert.deepEqual(f.career.active[0], run);
  assert.equal(clientDemandStatus(f, t + 1).remainingCompute, 0);
  assert.equal(
    clientDemandQuote(f, 1, t + 1).availableAt,
    t + CLIENT_DEMAND.windowMs,
  );
  f = act(f, 'contract-claim', t + 7 * CLIENT_DEMAND.windowMs, { id });
  assert.equal(
    f.compute,
    old.compute + run.reward,
    'Even a late collection keeps every promised Compute',
  );
  assert.throws(
    () => act(f, 'contract-claim', t + 7 * CLIENT_DEMAND.windowMs, { id }),
    /no longer active/,
  );
  assert.equal(
    clientDemandStatus(f, t + 7 * CLIENT_DEMAND.windowMs).remainingCompute,
    CLIENT_DEMAND.compute,
  );
});

test('migration counts a specialist booking from its original start and preserves its quoted fee and reward', () => {
  let old = fixture(false);
  old = act(old, 'commission-start', t, {
    id: commissionOffers(old)[0].id,
    rack: 'rack-g',
    quantity: 30,
  });
  const run = structuredClone(old.commissions.active[0]);
  let f = normalizeFacility(JSON.parse(JSON.stringify(old)), t + 1, 3);
  f = normalizeFacility(JSON.parse(JSON.stringify(f)), t + 60000, 3);
  assert.deepEqual(f.commissions.active[0], run);
  assert.equal(clientDemandStatus(f, t + 60000).usedCompute, run.reward);
  assert.equal(f.clientDemand.bookings[0].at, t);
  f = act(f, 'commission-claim', run.readyAt, { id: run.id });
  assert.equal(f.compute, old.compute + run.reward);
  assert.equal(clientDemandStatus(f, run.readyAt).usedCompute, run.reward);
});

test('one player cannot drain another player’s allowance and legacy v2 rules are unchanged', () => {
  const full = fixture();
  full.clientDemand.bookings = [booking(1, 4000)];
  assert.equal(clientDemandQuote(full, 1, t).allowed, false);
  assert.equal(clientDemandQuote(fixture(), 4000, t).allowed, true);
  const legacy = fixture(false);
  assert.equal(clientDemandStatus(legacy, t), null);
  assert.equal(clientDemandQuote(legacy, 10000, t).allowed, true);
});

test('guidance suggests useful preparation at the cap, but still finishes and collects promised work', () => {
  let f = fixture();
  f.seen.push('intro:welcome');
  f.clientDemand.bookings = [booking(1, 4000)];
  const suggestions = careerSuggestions(f, f.compute, false, t);
  assert.ok(
    suggestions.every((s) => !s.view?.family),
    'No unavailable client offers are recommended',
  );
  assert.equal(shiftObjective(f, f.compute, t).panel, 'field');
  [f] = accept(f, 'supply', t);
  f.inventory = {};
  assert.equal(
    shiftObjective(f, f.compute, t).title,
    'Review remaining client demand',
    'Do not prepare supplies for an unavailable booking',
  );
  let running = fixture();
  running.seen.push('intro:welcome');
  [running] = start(running, 'workload', t, { template: 'tiny-model' });
  running.clientDemand.bookings.push(booking(2, 3944));
  assert.equal(
    shiftObjective(running, running.compute, running.career.active[0].readyAt)
      .title,
    'Your work paid off',
  );
});

test('invalid or duplicate demand records fail closed; a backwards clock cannot create free demand', () => {
  const f = fixture();
  const bad = [
    { version: 2, bookings: [] },
    { version: 1, bookings: [booking(1, -1)] },
    { version: 1, bookings: [booking(1, 100), booking(1, 100)] },
    {
      version: 1,
      bookings: Array.from({ length: 15 }, (_, i) => booking(i, 1)),
    },
  ];
  for (const clientDemand of bad) {
    assert.equal(validClientDemand(clientDemand), false);
    assert.throws(
      () => normalizeFacility({ ...f, clientDemand }, t),
      /unsupported client demand/,
    );
  }
  f.clientDemand.bookings = [booking(1, 4000, t + 10000)];
  assert.equal(clientDemandQuote(f, 1, t).allowed, false);
  assert.equal(
    clientDemandQuote(f, 1, t).availableAt,
    t + 10000 + CLIENT_DEMAND.windowMs,
  );
});
