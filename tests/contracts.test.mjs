import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
  storedComputeNow,
  computeTankCapacity,
  ITEMS,
} from '../lib/facility.ts';
import {
  careerFor,
  contractTemplate,
  serviceChallenge,
  SERVICE_REPAIRS,
  validCareer,
  operatorLicense,
  contractQuote,
} from '../lib/contracts.ts';
import { actionWorksite } from '../lib/action-authority.ts';
import { guidanceFor } from '../lib/guidance.ts';
import { shiftObjective } from '../lib/experience.ts';

function fixture(at = 0) {
  const f = normalizeFacility(newFacility(at), at);
  f.builds = { 'rack-a': 1, 'rack-b': 1 };
  f.seen.push('intro:welcome');
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 100]));
  return f;
}
function act(f, type, now, extra = {}) {
  return applyFacility(
    f,
    { type, requestId: crypto.randomUUID(), ...extra },
    f.compute,
    now,
  ).facility;
}
function accept(f, family, now) {
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === family,
  );
  return [act(f, 'contract-accept', now, { id: offer.id }), offer.id];
}
function finish(f, id, now) {
  let r = f.career.active.find((r) => r.id === id);
  if (contractTemplate(r.template).family === 'service') {
    now = r.nextStepAt;
    f = act(f, 'contract-service', now, { id, direction: 'Inspect' });
    now = f.career.active[0].nextStepAt;
    f = act(f, 'contract-service', now, {
      id,
      direction: serviceChallenge(r).answer,
    });
    now = f.career.active[0].nextStepAt;
    f = act(f, 'contract-service', now, { id, direction: 'Test' });
  } else now = r.readyAt;
  return [act(f, 'contract-claim', now, { id }), now];
}

test('canceling and reaccepting keeps the same offer, with no earned progress or free rerolls', () => {
  let f = fixture();
  const initial = structuredClone(f.career.offers);
  for (let i = 0; i < 30; i++) {
    const [accepted, id] = accept(f, 'supply', i);
    assert.throws(
      () => act(accepted, 'contract-accept', i, { id }),
      /already been taken/,
    );
    assert.ok(validCareer(accepted.career));
    f = act(accepted, 'contract-cancel', i, { id });
  }
  assert.deepEqual(f.career.offers, initial);
  assert.equal(f.career.reputation, 0);
  assert.deepEqual(f.career.completed, { service: 0, supply: 0, workload: 0 });
});

test('two job limit, escrow, delivery delay, and once-only payout survive retry-history eviction', () => {
  let [f, id] = accept(fixture(), 'supply', 0);
  [f] = accept(f, 'service', 0);
  assert.throws(() => accept(f, 'workload', 0), /before accepting/);
  const before = structuredClone(f);
  f = act(f, 'contract-start', 1000, { id });
  const run = f.career.active.find((r) => r.id === id);
  for (const [item, count] of Object.entries(run.cost))
    assert.equal(f.inventory[item], before.inventory[item] - count);
  assert.throws(
    () => act(f, 'contract-start', 1000, { id }),
    /already started/,
  );
  assert.throws(
    () => act(f, 'contract-cancel', 1000, { id }),
    /already started/,
  );
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt - 1, { id }),
    /Finish the work/,
  );
  f = act(f, 'contract-claim', run.readyAt, { id });
  assert.equal(f.compute, run.reward);
  assert.equal(f.career.completed.supply, 1);
  assert.ok(!f.career.offers.some((o) => o.id === id));
  // Expired request cache cannot make a consumed contract exist again.
  f.requests = Array.from({ length: 100 }, () => crypto.randomUUID());
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt + 1, { id }),
    /no longer active/,
  );
  assert.ok(validCareer(f.career));
});

test('diagnosis requires observation, a correct repair and server-timed verification', () => {
  let [f, id] = accept(fixture(), 'service', 0);
  f = act(f, 'contract-start', 0, { id });
  const r = f.career.active[0],
    expected = serviceChallenge(r).answer;
  assert.throws(
    () => act(f, 'contract-service', 0, { id, direction: 'Inspect' }),
    /finish first/,
  );
  assert.throws(
    () => act(f, 'contract-service', 3000, { id, direction: expected }),
    /Inspect/,
  );
  f = act(f, 'contract-service', 3000, { id, direction: 'Inspect' });
  const wrong = SERVICE_REPAIRS.find((answer) => answer !== expected);
  const inventory = structuredClone(f.inventory);
  f = act(f, 'contract-service', 6000, { id, direction: wrong });
  assert.equal(f.career.active[0].steps, 1);
  assert.deepEqual(f.inventory, inventory);
  assert.throws(
    () => act(f, 'contract-service', 9999, { id, direction: expected }),
    /finish first/,
  );
  f = act(f, 'contract-service', 10000, { id, direction: expected });
  assert.throws(
    () => act(f, 'contract-claim', 10000, { id }),
    /Finish the work/,
  );
  assert.throws(
    () => act(f, 'contract-service', 10000, { id, direction: 'Test' }),
    /finish first/,
  );
  const end = f.career.active[0].nextStepAt;
  f = act(f, 'contract-service', end, { id, direction: 'Test' });
  f = act(f, 'contract-claim', end, { id });
  assert.equal(f.career.completed.service, 1);
  assert.ok(validCareer(f.career));
});

test('workload output is conserved across clock boundaries, repeated settlement, late claims and cap', () => {
  for (const start of [0, 1, 14999, 15000, 15001, 29999])
    for (const full of [false, true]) {
      let f = fixture();
      f.career.offers.find(
        (o) => contractTemplate(o.template).family === 'workload',
      ).template = 'tiny-model';
      if (full) f.storedCompute = computeTankCapacity(f);
      let id;
      [f, id] = accept(f, 'workload', start);
      f = act(f, 'contract-start', start, { id, rack: 'rack-a' });
      const r = f.career.active[0],
        before = f.storedCompute;
      assert.equal(r.reward, 32 + 4 * 6);
      assert.throws(
        () => act(f, 'compute-upgrade', start, {}),
        /running client workloads/,
      );
      assert.throws(() => act(f, 'build', start, { id: 'rack-a' }), /reserved/);
      const end = r.readyAt;
      // Repeated unrelated actions must not duplicate or erase reservation ticks.
      for (let at = start + 7000; at < end; at += 7000)
        f = act(f, 'contract-track', at, { id });
      assert.equal(
        storedComputeNow(f, end),
        Math.min(computeTankCapacity(f), before + 4 * 6),
      );
      f = act(f, 'contract-claim', end + 30000, { id });
      assert.equal(f.compute, r.reward);
      assert.equal(
        f.storedCompute,
        Math.min(computeTankCapacity(f), before + 4 * 6 + 2 * 12),
      );
      assert.ok(validCareer(f.career));
    }
});

test('module choices alter committed inputs/time; running jobs keep their configuration', () => {
  let f = fixture();
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.loadout = ['fast', 'efficient'];
  const template = contractTemplate('quiet-inference');
  const plain = contractQuote(f, template, 'standard', 'rack-a', 0);
  const efficient = contractQuote(f, template, 'efficient', 'rack-a', 0);
  const fast = contractQuote(f, template, 'fast', 'rack-a', 0);
  assert.ok(efficient.cost.silicon < plain.cost.silicon);
  assert.ok(efficient.duration > plain.duration);
  assert.ok(fast.cost.copper > plain.cost.copper);
  assert.ok(fast.duration < plain.duration);
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  offer.template = template.id;
  f = act(f, 'contract-accept', 0, { id: offer.id });
  assert.throws(
    () =>
      act(f, 'contract-start', 0, {
        id: offer.id,
        rack: 'rack-a',
        direction: 'stable',
      }),
    /Equip/,
  );
  f = act(f, 'contract-start', 0, {
    id: offer.id,
    rack: 'rack-a',
    direction: 'fast',
  });
  const snapshot = structuredClone(f.career.active[0]);
  f = act(f, 'module-equip', 1000, { id: 'stable' });
  assert.deepEqual(f.career.active[0], snapshot);
});

test('off-grid harvest from a full tank cannot change the production phase or overpay a workload', () => {
  for (const harvestAt of [1, 1000, 14000]) {
    let f = fixture();
    f.storedCompute = computeTankCapacity(f);
    const initialTank = f.storedCompute;
    f.career.offers.find(
      (o) => contractTemplate(o.template).family === 'workload',
    ).template = 'tiny-model';
    let id;
    [f, id] = accept(f, 'workload', 0);
    f = act(f, 'contract-start', 0, { id, rack: 'rack-a' });
    f = act(f, 'compute-harvest', harvestAt);
    f = act(f, 'contract-claim', 60000, { id });
    assert.equal(f.compute + f.storedCompute - initialTank, 4 * 12 + 32);
  }
});

test('a fully upgraded player still has renewable offers and cannot purchase qualification', () => {
  let f = fixture(),
    now = 0;
  f.builds = Object.fromEntries(
    'abcdefg'.split('').map((id) => ['rack-' + id, 3]),
  );
  f.computeBoost = 5;
  f.compute = 1000000;
  f.unlocked = [
    'commons',
    'salvage',
    'workshop',
    'thermal',
    'compute',
    'network',
    'core',
  ];
  f.stats.gathered = 50;
  f.stats.crafted = 20;
  const seen = new Set();
  assert.equal(operatorLicense(f.career), false);
  assert.throws(
    () => act(f, 'module-build', now, { id: 'fast' }),
    /Complete 2/,
  );
  for (let i = 0; i < 36; i++) {
    let id;
    [f, id] = accept(f, ['service', 'supply', 'workload'][i % 3], now);
    assert.ok(!seen.has(id));
    seen.add(id);
    f = act(f, 'contract-start', now, { id, rack: 'rack-a' });
    [f, now] = finish(f, id, now);
    assert.equal(f.career.offers.length, 3);
    assert.ok(validCareer(f.career));
    now += 1000;
  }
  f = act(f, 'module-build', now, { id: 'fast' });
  assert.equal(
    operatorLicense(f.career),
    false,
    'Commission a shared cluster to finish the license',
  );
  f.career.commissioned = 1;
  assert.ok(operatorLicense(f.career));
  assert.equal(shiftObjective(f, f.compute, now).panel, 'contracts');
  assert.equal(f.career.completed.service, 12);
  assert.equal(f.career.completed.supply, 12);
  assert.equal(f.career.completed.workload, 12);
});

test('legacy saves retain property and resources while gaining a fresh career', () => {
  const f = newFacility(1000);
  f.inventory = { kit: 4 };
  f.owned.push('mint');
  f.compute = 41000;
  f.builds = { 'rack-a': 3 };
  f.craft = { recipe: 'kit', readyAt: 10000 };
  const before = structuredClone(f),
    upgraded = normalizeFacility(f, 1000);
  for (const key of ['inventory', 'owned', 'compute', 'builds', 'craft'])
    assert.deepEqual(upgraded[key], before[key]);
  assert.ok(validCareer(upgraded.career));
  const invalid = structuredClone(upgraded.career);
  invalid.offers[1].template = invalid.offers[0].template;
  assert.equal(validCareer(invalid), false);
  for (const item of ['kit', 'board', 'battery', 'core'])
    assert.throws(
      () => act(upgraded, 'buy', 1000, { item, quantity: 1 }),
      /Craft equipment/,
    );
});

test('all guidance discards commands; following a direction cannot claim or buy anything', () => {
  for (const type of [
    'build',
    'craft',
    'gather',
    'contract-claim',
    'compute-harvest',
    'unlock',
  ]) {
    const next = {
      title: 'Useful work',
      detail: '',
      cta: 'Do it',
      target: 'rack-a',
      action: { type, id: 'rack-a' },
      repair: 'boot',
    };
    const before = structuredClone(next),
      guide = guidanceFor(next);
    assert.equal(guide.action, undefined);
    assert.equal(guide.repair, undefined);
    assert.equal(guide.target, 'rack-a');
    assert.deepEqual(next, before);
  }
});

test('service diagnosis and verification resolve the physical job site for server authority', () => {
  const [f, id] = accept(fixture(), 'service', 0);
  const target = contractTemplate(f.career.active[0].template).target;
  for (const type of ['contract-start', 'contract-service'])
    assert.equal(actionWorksite(f, { type, id }).id, target);
  assert.equal(actionWorksite(f, { type: 'contract-claim', id }), undefined);
});
