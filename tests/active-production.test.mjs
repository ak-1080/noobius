import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_COMPUTE_JOBS,
  ITEMS,
  activeBatchSeconds,
  applyFacility,
  newActiveFacility,
  newFacility,
  normalizeFacility,
  storedComputeNow,
} from '../lib/facility.ts';
import { contractFor } from '../lib/contracts.ts';
import { auditActiveEconomy } from '../scripts/audit-active-economy.mjs';

const id = () => crypto.randomUUID();
const act = (f, credits, now, type, extra = {}) => {
  const result = applyFacility(
    f,
    { type, requestId: id(), ...extra },
    credits,
    now,
  );
  return [result.facility, credits + result.credits];
};

test('active saves never mint Compute from time alone', () => {
  const f = newActiveFacility(1000);
  f.builds['rack-a'] = 1;
  f.builds['rack-b'] = 3;
  f.computeBoost = 5;
  assert.equal(storedComputeNow(f, 1000 + 7 * 86400000), 0);
  const later = normalizeFacility(f, 1000 + 7 * 86400000);
  assert.equal(later.storedCompute, 0);
  assert.equal(later.productionVersion, 3);
});

test('old earned ticks settle once and a promised old batch can still be claimed', () => {
  let old = newFacility(0);
  old.builds['rack-a'] = 1;
  old = act(old, 0, 0, 'compute-start', { id: 'quick' })[0];
  const promised = old.workload.reward;
  const migrated = normalizeFacility(old, 45000, 3);
  assert.equal(migrated.productionVersion, 3);
  assert.equal(migrated.storedCompute, 18);
  assert.equal(migrated.workload.reward, promised);
  assert.equal(storedComputeNow(migrated, 86400000), 18);
  const reread = normalizeFacility(migrated, 86400000, 3);
  assert.equal(reread.storedCompute, 18);
  const [claimed, credits] = act(reread, 0, 86400000, 'compute-collect');
  assert.equal(credits, promised);
  assert.equal(claimed.workload, null);
});

test('supplied batches consume inputs once, pay only on collection and do not restart', () => {
  let f = newActiveFacility(0);
  f = act(f, 0, 0, 'build', { id: 'rack-a' })[0];
  assert.throws(
    () => act(f, 0, 0, 'compute-start', { id: 'quick' }),
    /backpack/,
  );
  f.inventory.scrap = 2;
  const requestId = id();
  const started = applyFacility(
    f,
    { type: 'compute-start', id: 'quick', requestId },
    0,
    1000,
  );
  assert.equal(started.credits, 0);
  assert.equal(started.facility.inventory.scrap, 0);
  assert.equal(started.facility.workload.reward, 8);
  assert.equal(started.facility.workload.readyAt, 21000);
  assert.equal(
    applyFacility(
      started.facility,
      { type: 'compute-start', id: 'quick', requestId },
      0,
      1000,
    ).credits,
    0,
  );
  assert.throws(
    () => act(started.facility, 0, 20000, 'compute-collect'),
    /still running/,
  );
  const [claimed, credits] = act(started.facility, 0, 21000, 'compute-collect');
  assert.equal(credits, 8);
  assert.equal(claimed.workload, null);
  assert.equal(storedComputeNow(claimed, 86400000), 0);
  assert.throws(
    () => act(claimed, credits, 86400000, 'compute-collect'),
    /still running/,
  );
});

test('every supplied batch costs more at the NPC shop than it rewards', () => {
  for (const batch of ACTIVE_COMPUTE_JOBS) {
    const price = Object.entries(batch.cost).reduce(
      (sum, [item, count]) => sum + ITEMS[item].buy * count,
      0,
    );
    assert.ok(
      price > batch.reward,
      `${batch.id} shop inputs ${price} must exceed ${batch.reward} reward`,
    );
  }
});

test('existing speed upgrades shorten new batches without changing accepted ones', () => {
  const f = newActiveFacility(0);
  f.builds['rack-a'] = 1;
  f.inventory.scrap = 2;
  const started = act(f, 0, 0, 'compute-start', { id: 'quick' })[0];
  assert.equal(started.workload.readyAt, 20000);
  assert.equal(activeBatchSeconds({ ...f, computeBoost: 5 }, 20), 14);
  assert.equal(started.workload.readyAt, 20000);
});

test('serialized legacy client work keeps its paid inputs and promised terms through migration', () => {
  let f = newFacility(0);
  f.builds['rack-a'] = 1;
  f.inventory = { copper: 2, silicon: 2 };
  f = normalizeFacility(f, 0);
  const offer = f.career.offers.find(
    (o) => contractFor(o).family === 'workload',
  );
  [f] = act(f, 200, 0, 'contract-accept', { id: offer.id });
  [f] = act(f, 200, 0, 'contract-start', { id: offer.id, rack: 'rack-a' });
  const promised = structuredClone(f.career.active[0]);
  const inventory = structuredClone(f.inventory);
  for (const now of [14999, 45000, 86400000]) {
    let migrated = normalizeFacility(JSON.parse(JSON.stringify(f)), now, 3);
    assert.deepEqual(migrated.career.active[0], promised);
    assert.deepEqual(migrated.inventory, inventory);
    assert.equal(migrated.compute, 200);
    migrated = normalizeFacility(
      JSON.parse(JSON.stringify(migrated)),
      now + 86400000,
      3,
    );
    assert.deepEqual(migrated.career.active[0], promised);
    const requestId = id();
    const paid = applyFacility(
      migrated,
      { type: 'contract-claim', id: offer.id, requestId },
      200,
      now + 86400000,
    );
    assert.equal(paid.credits, promised.reward);
    assert.equal(paid.facility.compute, 200 + promised.reward);
    assert.equal(
      applyFacility(
        paid.facility,
        { type: 'contract-claim', id: offer.id, requestId },
        paid.facility.compute,
        now + 86400000,
      ).credits,
      0,
    );
    assert.throws(
      () =>
        act(
          paid.facility,
          paid.facility.compute,
          now + 86400000,
          'contract-claim',
          { id: offer.id },
        ),
      /job|offer/i,
    );
  }
});

test('migration freezes old storage once and concurrent craft/batch rewards survive reload independently', () => {
  let f = newFacility(0);
  f.builds['rack-a'] = 1;
  f.inventory = { scrap: 6, copper: 3 };
  [f] = act(f, 100, 0, 'craft', { id: 'kit' });
  [f] = act(f, 100, 0, 'compute-start', { id: 'quick' });
  const craftId = f.craft.id,
    batchReward = f.workload.reward;
  f = normalizeFacility(JSON.parse(JSON.stringify(f)), 45000, 3);
  const frozen = f.storedCompute;
  assert.equal(frozen, 18);
  for (let i = 1; i <= 5; i++) {
    f = normalizeFacility(JSON.parse(JSON.stringify(f)), i * 86400000, 3);
    assert.equal(f.storedCompute, frozen);
    assert.equal(f.workload.reward, batchReward);
    assert.equal(f.craft.id, craftId);
  }
  let credits = 100;
  [f, credits] = act(f, credits, 5 * 86400000, 'compute-harvest');
  assert.equal(credits, 100 + frozen);
  [f, credits] = act(f, credits, 5 * 86400000, 'compute-collect');
  assert.equal(credits, 100 + frozen + batchReward);
  [f, credits] = act(f, credits, 5 * 86400000, 'collect', { id: craftId });
  assert.equal(f.inventory.kit, 1);
  assert.throws(
    () => act(f, credits, 6 * 86400000, 'compute-harvest'),
    /supplied/,
  );
  assert.equal(credits, 100 + frozen + batchReward);
  assert.throws(
    () => act(f, credits, 6 * 86400000, 'collect', { id: craftId }),
    /bench/,
  );
});

test('economy diagnostic accounts for all bought inputs and distinguishes idle minting from client profit', () => {
  const report = auditActiveEconomy();
  assert.equal(report.idleComputeAfterSevenDays, 0);
  assert.equal(report.conclusions.npcSuppliedBatchLoopProfitable, false);
  assert.equal(report.conclusions.npcClientWorkProfitable, true);
  assert.equal(report.conclusions.botResistanceProven, false);
  for (const scenario of report.repeatStrategies) {
    const invoice = Object.entries(scenario.purchased).reduce(
      (sum, [item, n]) => sum + ITEMS[item].buy * n,
      0,
    );
    assert.equal(scenario.spentCompute, invoice);
    assert.equal(
      scenario.finalCompute - scenario.initialCompute,
      scenario.earnedCompute - invoice,
    );
    assert.ok(scenario.completedJobs > 0);
    assert.ok(scenario.elapsedSeconds <= 3600);
    assert.equal(scenario.pendingWork, 0);
    assert.equal(
      Object.values(scenario.remainingInventory).reduce((a, b) => a + b, 0),
      0,
    );
  }
  for (const route of report.workloadRoutes.filter(
    (r) => r.id === 'wobbly-training',
  ))
    assert.ok(
      route.craftingSeconds > 0,
      'Training throughput includes the time to craft boards',
    );
});
