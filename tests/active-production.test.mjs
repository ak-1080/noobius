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

const id = () => crypto.randomUUID();
const act = (f, credits, now, type, extra = {}) => {
  const result = applyFacility(f, { type, requestId: id(), ...extra }, credits, now);
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
  assert.throws(() => act(f, 0, 0, 'compute-start', { id: 'quick' }), /backpack/);
  f.inventory.scrap = 2;
  const requestId = id();
  const started = applyFacility(f, { type: 'compute-start', id: 'quick', requestId }, 0, 1000);
  assert.equal(started.credits, 0);
  assert.equal(started.facility.inventory.scrap, 0);
  assert.equal(started.facility.workload.reward, 8);
  assert.equal(started.facility.workload.readyAt, 21000);
  assert.equal(applyFacility(started.facility, { type: 'compute-start', id: 'quick', requestId }, 0, 1000).credits, 0);
  assert.throws(() => act(started.facility, 0, 20000, 'compute-collect'), /still running/);
  const [claimed, credits] = act(started.facility, 0, 21000, 'compute-collect');
  assert.equal(credits, 8);
  assert.equal(claimed.workload, null);
  assert.equal(storedComputeNow(claimed, 86400000), 0);
  assert.throws(() => act(claimed, credits, 86400000, 'compute-collect'), /still running/);
});

test('every supplied batch costs more at the NPC shop than it rewards', () => {
  for (const batch of ACTIVE_COMPUTE_JOBS) {
    const price = Object.entries(batch.cost).reduce((sum, [item, count]) => sum + ITEMS[item].buy * count, 0);
    assert.ok(price > batch.reward, `${batch.id} shop inputs ${price} must exceed ${batch.reward} reward`);
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
