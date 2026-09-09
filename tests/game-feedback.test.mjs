import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  applyFacility,
  computeTankCapacity,
  storedComputeNow,
  dayKey,
} from '../lib/facility.ts';
import {
  facilityReceipt,
  returnSummary,
  dailyRewardReady,
} from '../lib/game-feedback.ts';

const act = (f, type, balance, now, fields = {}) => {
  const action = { type, requestId: crypto.randomUUID(), ...fields };
  const result = applyFacility(f, action, balance, now);
  return { ...result, receipt: facilityReceipt(f, action, result), action };
};
const starter = (now = 0) => {
  const f = act(newFacility(now), 'build', 0, now, { id: 'rack-a' }).facility;
  f.seen.push('intro:identity', 'intro:welcome');
  return f;
};

test('a collection receipt uses the applied amount across a production tick, not the old HUD', () => {
  const f = starter();
  assert.equal(storedComputeNow(f, 29999), 6);
  const collected = act(f, 'compute-harvest', 0, 30000);
  assert.equal(collected.credits, 12);
  assert.match(collected.receipt.detail, /^\+12 Compute/);
  // Later unrelated activity or a subsequent profile read cannot change it.
  act(collected.facility, 'compute-harvest', 12, 60000);
  assert.match(collected.receipt.detail, /^\+12 Compute/);
});

test('free builds and paid upgrades show the applied income change; retries have no new celebration', () => {
  const f = newFacility(0);
  const first = act(f, 'build', 0, 0, { id: 'rack-a' });
  assert.match(
    first.receipt.detail,
    /Free starter built · 0 → 24 Compute \/ min/,
  );
  const replay = applyFacility(first.facility, first.action, 0, 0);
  assert.equal(facilityReceipt(first.facility, first.action, replay), null);
  const upgraded = act(first.facility, 'compute-upgrade', 20, 1);
  assert.match(
    upgraded.receipt.detail,
    /20 Compute spent · 24 → 36 Compute \/ min/,
  );
});

test('return summary is capped, includes uncollected output, and never mutates the save', () => {
  const f = starter();
  const snapshot = structuredClone(f);
  assert.equal(returnSummary(f, 59999), null);
  assert.equal(returnSummary(f, 60000).ready, 24);
  const full = returnSummary(f, 86400000);
  assert.equal(full.ready, computeTankCapacity(f));
  assert.equal(full.full, true);
  assert.deepEqual(f, snapshot);
  f.storedCompute = 6;
  assert.equal(returnSummary(f, 60000).ready, 30);
  assert.equal(returnSummary(newFacility(0), 86400000), null);
  f.seen = [];
  assert.equal(returnSummary(f, 86400000), null);
});

test('daily indicator and gold receipt distinguish ready, claimed, new day and already owned', () => {
  const now = Date.UTC(2026, 8, 8, 12),
    f = starter(now);
  f.daily.computeEarned = 100;
  assert.equal(dailyRewardReady(f, now), true);
  f.workdays = 2;
  const gold = act(f, 'tycoon-daily', 100, now);
  assert.equal(gold.receipt.title, 'Gold outfit unlocked!');
  assert.match(
    gold.receipt.detail,
    /^\+35 Compute · \+25 XP · Try it in your Locker/,
  );
  assert.equal(dailyRewardReady(gold.facility, now), false);
  assert.equal(dailyRewardReady(f, now + 86400000), false);
  const tomorrow = structuredClone(gold.facility);
  tomorrow.day = dayKey(now + 86400000);
  tomorrow.daily.computeEarned = 100;
  const again = act(tomorrow, 'tycoon-daily', 135, now + 86400000);
  assert.equal(again.receipt.title, 'Daily goal complete!');
  assert.match(again.receipt.detail, /tomorrow/);
  assert.doesNotMatch(again.receipt.detail, /toward/);
});

test('either final machine purchase celebrates equipment without declaring the game finished', () => {
  for (const type of ['compute-upgrade', 'build']) {
    const f = starter();
    f.builds = Object.fromEntries(
      'abcdefg'.split('').map((id) => ['rack-' + id, 3]),
    );
    f.unlocked = [
      'commons',
      'salvage',
      'workshop',
      'thermal',
      'compute',
      'network',
      'core',
    ];
    f.computeBoost = type === 'compute-upgrade' ? 4 : 5;
    if (type === 'build') f.builds['rack-g'] = 2;
    const result = act(f, type, 99999, 1, { id: 'rack-g' });
    assert.equal(result.receipt.title, 'Every machine upgraded!');
    assert.match(result.receipt.detail, /client work and crew projects/);
    assert.match(
      result.receipt.detail,
      /Compute spent · .* → 6,804 Compute \/ min/,
    );
  }
});
