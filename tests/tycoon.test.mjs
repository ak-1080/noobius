import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
  storedComputeNow,
  modules,
  computePerTick,
  computeTankCapacity,
  rackPrice,
  BOOST_PRICES,
} from '../lib/facility.ts';
import { tycoonObjective } from '../lib/tycoon.ts';

test('collection coach recognizes below, exact, and above the purchase threshold', () => {
  const f = newFacility(0);
  f.builds['rack-a'] = 1;
  f.seen.push('intro:welcome');
  const waiting = tycoonObjective(f, 0, 0);
  assert.equal(waiting.title, 'Faster machines');
  assert.equal(waiting.panel, 'facility');
  assert.equal(waiting.target, undefined);
  assert.match(tycoonObjective(f, 1, 45000).detail, /19 \/ 20/);
  for (const balance of [2, 10]) {
    const next = tycoonObjective(f, balance, 45000);
    assert.equal(next.title, waiting.title);
    assert.match(next.detail, /18 Compute ready\. Collect, then spend 20/);
    assert.equal(next.action.type, 'compute-harvest');
    assert.doesNotMatch(next.detail, /\/ 20/);
  }
});

test('fully upgraded data center offers an available bonus or the Locker, never a completed daily loop', () => {
  const now = Date.UTC(2026, 8, 8, 12),
    f = newFacility(now);
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
  f.computeBoost = 5;
  f.seen.push('intro:welcome');
  f.workdays = 3;
  assert.equal(tycoonObjective(f, 0, now).panel, 'appearance');
  f.daily.computeEarned = 100;
  assert.equal(tycoonObjective(f, 0, now).panel, 'contracts');
  f.lastWorkday = f.day;
  const done = tycoonObjective(f, 0, now);
  assert.equal(done.panel, 'appearance');
  assert.match(done.detail, /tomorrow/);
  const tomorrow = tycoonObjective(f, 0, now + 86400000);
  assert.equal(tomorrow.action.type, 'compute-harvest');
});

const action = (f, type, balance, now, extras = {}) =>
  applyFacility(
    f,
    { type, requestId: crypto.randomUUID(), ...extras },
    balance,
    now,
  );
test('zero-balance player can build, earn, upgrade, expand, and finish the whole tycoon path', () => {
  let f = newFacility(0),
    balance = 0,
    now = 0,
    builds = 0;
  f.seen.push('intro:welcome');
  const seen = new Set();
  for (let turn = 0; turn < 3000; turn++) {
    const step = tycoonObjective(f, balance, now);
    if (step.action) {
      const n = action(f, step.action.type, balance, now, step.action);
      f = n.facility;
      balance += n.credits;
      assert.ok(balance >= 0);
      seen.add(step.action.type);
      if (step.action.type === 'build') builds++;
    } else if (f.computeBoost === 5 && modules(f) === 21) break;
    now += 15000;
  }
  assert.equal(f.unlocked.length, 7);
  assert.equal(modules(f), 21);
  assert.equal(f.computeBoost, 5);
  assert.equal(builds, 21);
  assert.deepEqual([...seen].sort(), [
    'build',
    'compute-harvest',
    'compute-upgrade',
    'unlock',
  ]);
  assert.deepEqual(f.inventory, {});
});
test('starter is free only once; no parts or power gate, and purchases cannot overspend or replay', () => {
  let f = newFacility(0);
  const id = crypto.randomUUID();
  const first = action(f, 'build', 0, 0, { id: 'rack-a', requestId: id });
  assert.equal(first.credits, 0);
  f = first.facility;
  assert.equal(
    action(f, 'build', 0, 1, { id: 'rack-a', requestId: id }).facility.builds[
      'rack-a'
    ],
    1,
  );
  assert.equal(rackPrice(f, 'rack-a'), 90);
  assert.throws(() => action(f, 'build', 0, 0, { id: 'rack-a' }), /Compute/);
  assert.throws(() => action(f, 'build', 74, 0, { id: 'rack-b' }), /Compute/);
  const second = action(f, 'build', 75, 0, { id: 'rack-b' });
  assert.equal(second.credits, -75);
  assert.deepEqual(second.facility.inventory, {});
  assert.equal(second.facility.power, 0);
});
test('first speed upgrade is earned in one minute and raises income from 24 to 36', () => {
  let f = action(newFacility(0), 'build', 0, 0, { id: 'rack-a' }).facility;
  assert.equal(storedComputeNow(f, 14999), 0);
  assert.equal(storedComputeNow(f, 15000), 6);
  assert.equal(computePerTick(f) * 4, 24);
  const collected = action(f, 'compute-harvest', 0, 60000);
  assert.equal(collected.credits, 24);
  const boost = action(collected.facility, 'compute-upgrade', 24, 60000);
  assert.equal(boost.credits, -BOOST_PRICES[0]);
  assert.equal(computePerTick(boost.facility) * 4, 36);
  assert.equal(computeTankCapacity(boost.facility), 2160);
});
test('legacy rate settles once, honors its old cap/outage, and retains all saved work', () => {
  const old = {
    ...newFacility(0),
    tycoonVersion: undefined,
    economyVersion: 2,
    compute: 500,
    builds: { 'rack-a': 2 },
    computeBoost: 2,
    storedCompute: 7,
    computeAt: 0,
    version: 23,
    inventory: { kit: 2 },
    outfit: 'mint',
    accessory: 'pack',
    owned: ['classic', 'mint', 'pack'],
    craft: { recipe: 'kit', readyAt: 5000 },
    workload: {
      id: 'old-job',
      rack: 'rack-a',
      label: 'Quick batch',
      startedAt: 0,
      readyAt: 15000,
      reward: 40,
    },
    incident: { at: 31000, rack: 'rack-a', kind: 'heat', startedAt: null },
  };
  const now = 864000000;
  const migrated = normalizeFacility(old, now);
  assert.equal(migrated.storedCompute, 19); // two old ticks × six, plus seven saved
  assert.equal(migrated.computeAt, now);
  assert.equal(migrated.economyVersion, 2);
  assert.equal(migrated.tycoonVersion, 1);
  for (const key of [
    'version',
    'inventory',
    'owned',
    'outfit',
    'accessory',
    'craft',
    'workload',
    'incident',
    'compute',
  ])
    assert.deepEqual(migrated[key], old[key]);
  assert.deepEqual(normalizeFacility(migrated, now + 1000), migrated);
  assert.equal(storedComputeNow(migrated, now + 15000), 43);
  const batch = action(migrated, 'compute-collect', 500, now);
  assert.equal(batch.credits, 40);
  assert.equal(batch.facility.compute, 540);
  const full = normalizeFacility(
    { ...old, incident: null, storedCompute: 200 },
    now,
  );
  assert.equal(full.storedCompute, 280); // old cap, never retroactive new-rate income
});
test('bonus boost recharge and daily reward are enforced once, across nonconsecutive days', () => {
  let f = action(newFacility(0), 'build', 0, 0, { id: 'rack-a' }).facility;
  f = action(f, 'compute-start', 0, 0, { id: 'quick' }).facility;
  f = action(f, 'compute-collect', 0, 15000).facility;
  assert.throws(
    () => action(f, 'compute-start', 10, 15000, { id: 'quick' }),
    /charging/,
  );
  assert.ok(
    action(f, 'compute-start', 10, 90000, { id: 'quick' }).facility.workload,
  );
  let balance = 10;
  for (const now of [1200000, 86400000 * 3, 86400000 * 7]) {
    const collected = action(f, 'compute-harvest', balance, now);
    f = collected.facility;
    balance += collected.credits;
    assert.ok(f.daily.computeEarned >= 100);
    const id = crypto.randomUUID();
    const reward = action(f, 'tycoon-daily', balance, now, { requestId: id });
    f = reward.facility;
    balance += reward.credits;
    assert.equal(reward.credits, 35);
    assert.equal(
      action(f, 'tycoon-daily', balance, now, { requestId: id }).credits,
      0,
    );
    assert.throws(() => action(f, 'tycoon-daily', balance, now), /100 Compute/);
  }
  assert.equal(f.workdays, 3);
  assert.ok(f.owned.includes('afterhours'));
});
test('optional bonus repairs do not discard a nearly completed production tick', () => {
  let f = action(newFacility(0), 'build', 0, 0, { id: 'rack-a' }).facility;
  f.incident = { at: 0, rack: 'rack-a', kind: 'power', startedAt: 20000 };
  f = action(f, 'outage-fix', 0, 29999, {
    id: '0',
    direction: 'Disconnect power|Reset the breaker|Reconnect power',
  }).facility;
  assert.equal(storedComputeNow(f, 30000), 12);
});

test('buying machines or speed keeps the production clock and settles old output first', () => {
  const starter = action(newFacility(0), 'build', 0, 0, {
    id: 'rack-a',
  }).facility;
  for (const [type, id, cost, nextTick] of [
    ['build', 'rack-b', 75, 12],
    ['build', 'rack-a', 90, 12],
    ['compute-upgrade', undefined, 20, 9],
  ]) {
    const bought = action(starter, type, cost, 29999, { id });
    assert.equal(
      bought.facility.storedCompute,
      6,
      'completed tick uses old output',
    );
    assert.equal(
      bought.facility.computeAt,
      15000,
      'purchase preserves the partial tick',
    );
    assert.equal(storedComputeNow(bought.facility, 30000), 6 + nextTick);
    assert.equal(bought.credits, -cost);
  }
});

import { ZONES } from '../lib/facility.ts';
import { roomUnlockState } from '../lib/room-progress.ts';
test('room requirement display matches authoritative unlock acceptance at each boundary', () => {
  for (const room of ZONES.filter((z) => z.cost > 0)) {
    for (const levels of [room.modules - 1, room.modules, room.modules + 1]) {
      for (const balance of [room.cost - 1, room.cost, room.cost + 1]) {
        for (const gpuOpen of [false, true]) {
          const f = newFacility(0);
          f.builds = {
            'rack-a': Math.min(3, levels),
            'rack-b': Math.min(3, Math.max(0, levels - 3)),
            'rack-c': Math.max(0, levels - 6),
          };
          if (gpuOpen && room.id !== 'compute') f.unlocked.push('compute');
          const state = roomUnlockState(f, balance, room);
          let accepted = false;
          try {
            action(f, 'unlock', balance, 0, { id: room.id });
            accepted = true;
          } catch {}
          assert.equal(
            state.canUnlock,
            accepted,
            `${room.id}: ${levels} levels, ${balance} balance, GPU ${gpuOpen}`,
          );
        }
      }
    }
  }
});
test('unlocking buys space only; travel and machine building remain separate actions', () => {
  for (const room of ZONES.filter((z) => z.cost > 0)) {
    const f = newFacility(0);
    f.builds = { 'rack-a': 3, 'rack-b': 3 };
    if (room.id === 'core') f.unlocked.push('compute');
    const result = action(f, 'unlock', room.cost, 0, { id: room.id });
    assert.equal(result.credits, -room.cost);
    assert.deepEqual(result.facility.builds, f.builds);
    assert.equal(result.facility.zone, f.zone);
    assert.equal(computePerTick(result.facility), computePerTick(f));
    assert.equal(roomUnlockState(result.facility, 0, room).canUnlock, false);
    const traveled = action(result.facility, 'travel', 0, 1, { id: room.id });
    assert.equal(traveled.facility.zone, room.id);
    assert.equal(traveled.credits, 0);
  }
});

import { roomMachinePrice } from '../lib/room-progress.ts';
test('future room previews show post-starter prices, not a second free machine', () => {
  const before = newFacility(0);
  const after = action(before, 'build', 0, 0, { id: 'rack-a' }).facility;
  assert.equal(roomMachinePrice(before, 'rack-a'), 0);
  for (const id of [
    'rack-b',
    'rack-c',
    'rack-d',
    'rack-e',
    'rack-f',
    'rack-g',
  ]) {
    assert.ok(roomMachinePrice(before, id) > 0);
    assert.equal(roomMachinePrice(before, id), rackPrice(after, id));
  }
  assert.equal(roomMachinePrice(after, 'rack-a'), 90);
});
