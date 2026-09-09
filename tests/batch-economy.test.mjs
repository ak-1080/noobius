import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
  computePerTick,
  storedComputeNow,
  computeTankCapacity,
  machinePerTick,
  workloadCapacity,
  MACHINE_POWER,
  RECIPES,
  craftQuote,
  ITEMS,
} from '../lib/facility.ts';
import {
  contractQuote,
  contractTemplate,
  validCareer,
} from '../lib/contracts.ts';
const act = (f, type, now, extra = {}) =>
  applyFacility(
    f,
    { type, requestId: crypto.randomUUID(), ...extra },
    f.compute,
    now,
  ).facility;
const maxed = (at = 0) => {
  const f = normalizeFacility(newFacility(at), at);
  f.builds = Object.fromEntries(
    Object.keys(MACHINE_POWER).map((id) => [id, 3]),
  );
  f.computeBoost = 5;
  f.storage = 5;
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.loadout = ['fast', 'stable'];
  f.career.completed = { service: 20, supply: 20, workload: 20 };
  f.inventory = { board: 40, silicon: 120, copper: 60, scrap: 20 };
  return f;
};
function accept(f, template = 'wobbly-training', now = 0) {
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  offer.template = template;
  return [act(f, 'contract-accept', now, { id: offer.id }), offer.id];
}

test('idle production stays modest while expensive machines unlock parallel work', () => {
  const f = maxed();
  assert.equal(computePerTick(f) * 4, 476);
  assert.equal(machinePerTick(f, 'rack-g') * 4, 68);
  assert.equal(machinePerTick(f, 'rack-a') * 4, 68);
  assert.equal(workloadCapacity(f, 'rack-a'), 3);
  assert.equal(workloadCapacity(f, 'rack-g'), 30);
  const small = contractQuote(
    f,
    contractTemplate('wobbly-training'),
    'fast',
    'rack-a',
    0,
    3,
  );
  const large = contractQuote(
    f,
    contractTemplate('wobbly-training'),
    'fast',
    'rack-g',
    0,
    30,
  );
  assert.equal(small.duration, large.duration);
  assert.equal(small.reward, 756);
  assert.equal(large.reward, 6696);
  assert.equal(small.lostIdle, large.lostIdle);
});

test('batch quotes aggregate before rounding, scale Fast supplies, and make Stable save boards', () => {
  const f = maxed(),
    t = contractTemplate('wobbly-training');
  const fast = contractQuote(f, t, 'fast', 'rack-g', 0, 30);
  const efficient = contractQuote(f, t, 'efficient', 'rack-g', 0, 30);
  const stable = contractQuote(f, t, 'stable', 'rack-g', 0, 30);
  assert.deepEqual(fast.cost, { board: 30, silicon: 90, copper: 30 });
  assert.deepEqual(efficient.cost, { board: 30, silicon: 59 });
  assert.deepEqual(stable.cost, { board: 24, silicon: 90 });
  assert.deepEqual(
    [fast.duration, efficient.duration, stable.duration],
    [168, 288, 240],
  );
  assert.deepEqual(
    [fast.lostIdle, efficient.lostIdle, stable.lostIdle],
    [187, 323, 272],
  );
  assert.equal(contractQuote(f, t, 'stable', 'rack-g', 0, 4).cost.board, 4);
  assert.equal(contractQuote(f, t, 'stable', 'rack-g', 0, 5).cost.board, 4);
  assert.equal(
    contractQuote(
      f,
      contractTemplate('tiny-model'),
      'efficient',
      'rack-g',
      0,
      30,
    ).cost.silicon,
    20,
  );
});

test('two stocked-job strategies and a fabrication strategy have concrete different advantages', () => {
  const f = maxed();
  const materialCost = (q) =>
    Object.entries(q.cost).reduce(
      (n, [id, count]) => n + count * (id === 'board' ? 77 : ITEMS[id].buy),
      0,
    );
  const net = (q) => q.reward - materialCost(q) - q.lostIdle;
  const quote = (template, style) =>
    contractQuote(f, contractTemplate(template), style, 'rack-g', 0, 30);
  const fastTiny = quote('tiny-model', 'fast'),
    efficientTiny = quote('tiny-model', 'efficient');
  assert.ok(
    net(efficientTiny) / efficientTiny.duration >
      net(fastTiny) / fastTiny.duration,
  );
  const fast = quote('wobbly-training', 'fast'),
    stable = quote('wobbly-training', 'stable'),
    efficient = quote('wobbly-training', 'efficient');
  assert.deepEqual(
    [net(fast), net(efficient), net(stable)],
    [2909, 3355, 3496],
  );
  assert.ok(net(fast) / fast.duration > net(stable) / stable.duration);
  assert.ok(
    net(stable) / (stable.duration + stable.cost.board * 8) >
      net(fast) / (fast.duration + fast.cost.board * 8),
  );
  assert.ok(efficient.cost.silicon < stable.cost.silicon);
});

test('starter one-unit Standard jobs preserve profitable bought-input margins', () => {
  const f = newFacility(0);
  f.builds = { 'rack-a': 1 };
  const tiny = contractQuote(
    f,
    contractTemplate('tiny-model'),
    'standard',
    'rack-a',
    0,
  );
  const render = contractQuote(
    f,
    contractTemplate('render-rush'),
    'standard',
    'rack-a',
    0,
  );
  assert.equal(tiny.reward - 12 - tiny.lostIdle, 20);
  assert.equal(render.reward - 38 - render.lostIdle, 27);
});

test('start validates capacity and equipment, freezes one batch, and mints only one report', () => {
  const accepted = accept(maxed()), id = accepted[1];
  let f = accepted[0];
  const before = structuredClone(f);
  for (const quantity of [-1, 0, 1.5, 31, '2', Infinity])
    assert.throws(() =>
      act(f, 'contract-start', 0, { id, rack: 'rack-g', quantity }),
    );
  assert.throws(
    () => act(f, 'contract-start', 0, { id, rack: 'rack-a', quantity: 4 }),
    /too large/,
  );
  assert.throws(
    () =>
      act(f, 'contract-start', 0, {
        id,
        rack: 'rack-g',
        quantity: 30,
        direction: 'efficient',
      }),
    /Equip/,
  );
  assert.deepEqual(f, before);
  f = act(f, 'contract-start', 0, {
    id,
    rack: 'rack-g',
    quantity: 30,
    direction: 'stable',
  });
  const run = structuredClone(f.career.active[0]);
  assert.equal(run.quoteVersion, 2);
  assert.equal(run.quantity, 30);
  assert.equal(run.reward, 6696);
  assert.equal(f.inventory.board, 16);
  assert.ok(validCareer(f.career));
  assert.throws(
    () => act(f, 'contract-start', 1, { id, rack: 'rack-a', quantity: 1 }),
    /already started/,
  );
  f = act(f, 'module-equip', 1, { id: 'stable' });
  assert.deepEqual(f.career.active[0], run);
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt - 1, { id }),
    /Finish/,
  );
  f = act(f, 'contract-claim', run.readyAt, { id });
  assert.equal(f.compute, 6696);
  assert.equal(f.career.completed.workload, 21);
  assert.equal(f.career.reportStyles.workload.stable, 1);
  assert.equal(f.career.mastery['wobbly-training'].stable, 1);
  f.requests = [];
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt + 1, { id }),
    /no longer active/,
  );
});

test('new workload reservations conserve production at every start phase and late claim', () => {
  for (const start of [0, 1, 14999, 15000, 15001, 29999]) {
    const accepted = accept(maxed(), 'wobbly-training', start), id = accepted[1];
    let f = accepted[0];
    f = act(f, 'contract-start', start, {
      id,
      rack: 'rack-g',
      quantity: 30,
      direction: 'fast',
    });
    const base = structuredClone(f),
      end = f.career.active[0].readyAt;
    const expected = storedComputeNow(base, end + 30000);
    for (let at = start + 7000; at < end; at += 7000)
      f = act(f, 'contract-track', at, { id });
    f = act(f, 'contract-claim', end + 30000, { id });
    assert.equal(f.storedCompute, expected);
    assert.equal(f.compute, 6696);
    assert.ok(f.storedCompute >= 0);
  }
});

test('old rate settles once and grandfathered overflow survives actions, reload and harvest', () => {
  const old = maxed();
  delete old.productionVersion;
  old.compute = 880287;
  old.storedCompute = 408240;
  old.version = 42;
  old.career.dispatchChoices = { workload: [`${crypto.randomUUID()}:0`] };
  const preserved = structuredClone(old);
  const f = normalizeFacility(old, 45001);
  assert.equal(f.productionVersion, 2);
  assert.equal(f.computeAt, 45000);
  assert.equal(f.storedCompute, 408240);
  assert.ok(f.storedCompute > computeTankCapacity(f));
  for (const key of [
    'compute',
    'version',
    'inventory',
    'builds',
    'career',
    'bank',
    'owned',
  ])
    assert.deepEqual(f[key], preserved[key]);
  assert.equal(storedComputeNow(f, 60000), 408240);
  const touched = act(f, 'travel', 60000, { id: 'commons' });
  assert.equal(touched.storedCompute, 408240);
  const reread = normalizeFacility(JSON.parse(JSON.stringify(touched)), 60000);
  assert.equal(reread.storedCompute, 408240);
  const harvested = act(reread, 'compute-harvest', 60000);
  assert.equal(harvested.compute, 1288527);
  assert.equal(harvested.storedCompute, 0);
  assert.throws(() => act(harvested, 'compute-harvest', 60000), /warming/);
  assert.equal(storedComputeNow(harvested, 75000), 119);
});

test('old jobs crossing the transition keep promised payment and reserve only new-rate output after it', () => {
  const accepted = accept(maxed()), id = accepted[1];
  let old = accepted[0];
  delete old.productionVersion;
  delete old.career.active[0].quoteVersion;
  // Start directly through applyFacility after migration, preserving accepted v1 terms.
  old = act(old, 'contract-start', 0, {
    id,
    rack: 'rack-g',
    direction: 'fast',
  });
  const promise = structuredClone(old.career.active[0]);
  assert.equal(promise.reward, 7150);
  delete old.productionVersion; // persisted running save from the old release
  old.computeAt = 0;
  old.storedCompute = 0;
  const migrated = normalizeFacility(old, 30001);
  assert.equal(migrated.storedCompute, 2 * (1701 - 630));
  assert.equal(migrated.computeAt, 30000);
  assert.deepEqual(migrated.career.active[0], promise);
  assert.equal(
    storedComputeNow(migrated, 45000),
    migrated.storedCompute + 119 - 17,
  );
  const claimed = act(migrated, 'contract-claim', promise.readyAt, { id });
  assert.equal(claimed.compute, 7150);
  assert.equal(claimed.storedCompute, 2142 + 9 * 102);
});

test('old accepted jobs keep one-unit terms while new acceptance uses batch pricing', () => {
  const [old, id] = accept(maxed());
  delete old.productionVersion;
  delete old.career.active[0].quoteVersion;
  const f = normalizeFacility(old, 1000);
  assert.throws(
    () => act(f, 'contract-start', 1000, { id, rack: 'rack-g', quantity: 2 }),
    /between 1 and 1/,
  );
  const running = act(f, 'contract-start', 1000, {
    id,
    rack: 'rack-g',
    direction: 'fast',
  });
  assert.equal(running.career.active[0].reward, 7150);
  let fresh = act(f, 'contract-cancel', 1000, { id });
  fresh = act(fresh, 'contract-accept', 1000, { id });
  fresh = act(fresh, 'contract-start', 1000, {
    id,
    rack: 'rack-g',
    quantity: 30,
    direction: 'fast',
  });
  assert.equal(fresh.career.active[0].reward, 6696);
});

test('migration preserves partial/future clocks and rejects unknown versions', () => {
  const old = maxed();
  delete old.productionVersion;
  const f = normalizeFacility(old, 29999);
  assert.equal(f.storedCompute, 1701);
  assert.equal(f.computeAt, 15000);
  assert.equal(storedComputeNow(f, 30000), 1701 + 119);
  assert.equal(normalizeFacility(f, 29999).storedCompute, 1701);
  const future = normalizeFacility({ ...old, computeAt: 60000 }, 29999);
  assert.equal(future.computeAt, 60000);
  assert.equal(storedComputeNow(future, 59999), 0);
  assert.throws(
    () => normalizeFacility({ ...old, productionVersion: 3 }),
    /newer/,
  );
});

test('bulk fabrication equals individual ingredients, elapsed work and per-item progress', () => {
  let f = maxed();
  f.skills.engineering = 20;
  f.inventory = { scrap: 120, copper: 90, silicon: 90 };
  const q = craftQuote(
    RECIPES.find((r) => r.id === 'board'),
    30,
  );
  assert.deepEqual(q, {
    cost: { scrap: 120, copper: 90, silicon: 90 },
    seconds: 240,
  });
  f = act(f, 'craft', 0, { id: 'board', quantity: 30 });
  const batch = structuredClone(f.craft);
  assert.deepEqual(f.inventory, { scrap: 0, copper: 0, silicon: 0 });
  assert.throws(
    () => act(f, 'collect', 239999, { id: batch.id }),
    /still working/,
  );
  const result = applyFacility(
    f,
    { type: 'collect', id: batch.id, requestId: crypto.randomUUID() },
    0,
    240000,
  );
  assert.equal(result.facility.inventory.board, 30);
  assert.equal(result.facility.skills.engineering, 320);
  assert.equal(result.facility.stats.crafted, 30);
  assert.equal(result.xp, 150);
  assert.equal(result.facility.craft, null);
  assert.equal(result.facility.career.completed.workload, 20);
});

test('craft validation, full-backpack recovery, and a stale pickup cannot lose or duplicate parts', () => {
  let f = maxed();
  f.inventory = { scrap: 12, copper: 6 };
  f.storage = 0;
  const before = structuredClone(f);
  for (const quantity of [0, -1, 31, 2.1, '2'])
    assert.throws(() => act(f, 'craft', 0, { id: 'kit', quantity }));
  assert.throws(
    () => act(f, 'craft', 0, { id: 'kit', quantity: 3 }),
    /more parts/,
  );
  assert.deepEqual(f, before);
  f = act(f, 'craft', 0, { id: 'kit', quantity: 2 });
  const batch = f.craft.id;
  f.inventory = { scrap: 120 };
  assert.throws(
    () => act(f, 'collect', 10000, { id: batch }),
    /Storage is full/,
  );
  assert.equal(f.craft.quantity, 2);
  f.inventory.scrap = 118;
  f = act(f, 'collect', 10000, { id: batch });
  assert.equal(f.inventory.kit, 2);
  f.inventory = { scrap: 6, copper: 3 };
  f = act(f, 'craft', 10000, { id: 'kit' });
  f.requests = [];
  assert.throws(
    () => act(f, 'collect', 15000, { id: batch }),
    /no longer at the bench/,
  );
  assert.throws(() => act(f, 'collect', 15000), /no longer at the bench/);
  assert.ok(f.craft);
  f = act(f, 'collect', 15000, { id: f.craft.id });
  assert.equal(f.inventory.kit, 1);
  const legacy = { ...f, craft: { recipe: 'kit', readyAt: 1000 } };
  assert.equal(act(legacy, 'collect', 15000).inventory.kit, 2);
});

test('craft-batch identity stays unique after request history eviction and replay', () => {
  let f = maxed();
  f.inventory = { scrap: 12, copper: 6 };
  const requestId = crypto.randomUUID();
  f = act(f, 'craft', 0, { id: 'kit', requestId });
  const firstBatch = f.craft.id;
  f = act(f, 'collect', 5000, { id: firstBatch });
  f.requests = [];
  f = act(f, 'craft', 5000, { id: 'kit', requestId });
  assert.notEqual(f.craft.id, firstBatch);
  assert.throws(
    () => act(f, 'collect', 10000, { id: firstBatch }),
    /no longer at the bench/,
  );
  assert.equal(f.inventory.kit, 1);
});
