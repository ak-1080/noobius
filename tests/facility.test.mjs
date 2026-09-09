import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  applyFacility,
  FacilityError,
  repairLoot,
  modules,
  energyNow,
  STORY,
  RECIPES,
  ZONES,
  normalizeFacility,
  DAILY_TASKS,
} from '../lib/facility.ts';
import { resolveObjective } from '../lib/objectives.ts';
const act = (f, type, extras = {}, credits = 1000, now = 100000) =>
  applyFacility(
    f,
    { type, ...(type === 'collect' ? { id: f.craft?.id } : {}), ...extras, requestId: extras.requestId ?? crypto.randomUUID() },
    credits,
    now,
  );
test('a new technician can gather, craft, build, and claim progress without free transferable grants', () => {
  let f = newFacility(0),
    cr = 0;
  assert.deepEqual(f.inventory, {});
  const doAction = (type, extras = {}, now = 100000) => {
    const n = act(f, type, extras, cr, now);
    f = n.facility;
    cr += n.credits;
    return n;
  };
  doAction('gather', { id: 'scrap-a' });
  doAction('gather', { id: 'scrap-c' });
  doAction('gather', { id: 'copper-a' });
  doAction('claim', { id: 'welcome' });
  assert.equal(cr, 25);
  doAction('craft', { id: 'kit' });
  assert.throws(() => doAction('collect'), /still working/);
  doAction('collect', {}, 105001);
  doAction('claim', { id: 'maker' }, 105001);
  doAction('gather', { id: 'copper-a' }, 120001);
  doAction('build', { id: 'rack-a' }, 120001);
  doAction('claim', { id: 'first-light' }, 120001);
  assert.equal(modules(f), 1);
  assert.equal(cr, 130);
  const persisted = JSON.parse(JSON.stringify(f));
  assert.equal(persisted.builds['rack-a'], 1);
  assert.throws(
    () => act(persisted, 'claim', { id: 'first-light' }),
    /claimed/,
  );
});
test('facility retries pay once, rejection leaves inventory intact, and recipes use server time', () => {
  const f = newFacility(0);
  f.inventory = { scrap: 10, copper: 8 };
  const action = { type: 'craft', id: 'kit', requestId: crypto.randomUUID() };
  const n = applyFacility(f, action, 100, 1000);
  assert.deepEqual(f.inventory, { scrap: 10, copper: 8 });
  assert.deepEqual(applyFacility(n.facility, action, 100, 2000), {
    facility: n.facility,
    credits: 0,
    xp: 0,
    message: 'Already recorded.',
  });
  assert.throws(() => act(n.facility, 'collect', {}, 100, 5999), FacilityError);
  const collected = act(n.facility, 'collect', {}, 100, 6000);
  assert.equal(collected.facility.inventory.kit, 1);
  assert.throws(() => act(collected.facility, 'collect'), FacilityError);
});
test('frequent successful actions preserve fractional energy recharge', () => {
  let f = newFacility(0);
  f.energy = 0;
  for (let t = 4000; t <= 40000; t += 4000)
    f = act(f, 'travel', { id: 'commons' }, 0, t).facility;
  assert.equal(energyNow(f, 40000), 8);
});
test('locked wings, cooldowns, utility limits, and malformed quantities cannot be bypassed', () => {
  const f = newFacility(0);
  f.inventory = { kit: 10, copper: 50, board: 10 };
  assert.throws(() => act(f, 'travel', { id: 'core' }), FacilityError);
  assert.throws(() => act(f, 'gather', { id: 'core-a' }), FacilityError);
  const gathered = act(f, 'gather', { id: 'scrap-a' }).facility;
  assert.throws(
    () => act(gathered, 'gather', { id: 'scrap-a' }),
    /replenishing/,
  );
  f.builds = { 'rack-a': 2, 'rack-b': 1 };
  assert.equal(act(f, 'build', { id: 'rack-b' }).facility.builds['rack-b'], 2);
  assert.throws(() => act(f, 'build', { id: 'rack-b' }, 0), /Compute/);
  for (const quantity of [0, -1, 51, 1.5, '2', NaN])
    assert.throws(
      () => act(f, 'buy', { item: 'scrap', quantity }),
      FacilityError,
    );
  assert.throws(
    () => act(f, 'buy', { item: '__proto__', quantity: 1 }),
    FacilityError,
  );
  assert.throws(
    () => act(f, 'buy', { item: 'scrap', quantity: 1 }, 0),
    /Compute/,
  );
});
test('bank transfers conserve items, storage caps only the backpack, repairs survive a full bank', () => {
  const f = newFacility(0);
  f.inventory = { scrap: 120 };
  f.bank = { copper: 600 };
  assert.throws(
    () =>
      act(f, 'bank', { direction: 'withdraw', item: 'copper', quantity: 1 }),
    /Storage/,
  );
  const n = act(f, 'bank', {
    direction: 'deposit',
    item: 'scrap',
    quantity: 120,
  }).facility;
  assert.equal(n.bank.scrap, 120);
  assert.equal(n.inventory.scrap, 0);
  const loot = repairLoot(n, 'network');
  assert.equal(loot.bank.copper, 602);
  assert.equal(loot.stats.repairs, 1);
});
test('UTC daily reset and ordered story claims do not double award', () => {
  const now = Date.UTC(2026, 8, 7, 23, 59, 59),
    f = newFacility(now);
  f.daily.gathered = 30;
  f.stats.gathered = 30;
  const c = act(f, 'claim', { id: 'welcome' }, 0, now);
  assert.equal(c.credits, 25);
  assert.throws(
    () => act(c.facility, 'claim', { id: 'maker' }, 25, now),
    /not complete/,
  );
  const d = act(c.facility, 'daily', { id: 'gather' }, 25, now);
  assert.equal(d.credits, 35);
  assert.throws(
    () => act(d.facility, 'daily', { id: 'gather' }, 60, now),
    /not ready/,
  );
  const reset = act(
    d.facility,
    'travel',
    { id: 'commons' },
    60,
    now + 2000,
  ).facility;
  assert.deepEqual(reset.daily, {});
  assert.deepEqual(reset.dailyClaims, []);
});
test('merchant spread never pays more than purchase cost and crafting consumes ingredients', () => {
  const f = newFacility(0);
  const bought = act(f, 'buy', { item: 'scrap', quantity: 10 }, 100);
  assert.equal(bought.credits, -50);
  const sold = act(
    bought.facility,
    'sell',
    { item: 'scrap', quantity: 10 },
    50,
  );
  assert.equal(sold.credits, 10);
  assert.equal(sold.facility.inventory.scrap, 0);
  assert.equal(new Set(STORY.map((c) => c.id)).size, 9);
  assert.equal(ZONES.length, 7);
  for (const recipe of RECIPES)
    assert.ok(Object.values(recipe.cost).every((n) => n > 0));
});
test('old saves gain daily-card defaults without changing progress or the concurrency version', () => {
  const f = newFacility(100000);
  f.version = 42;
  f.builds = { 'rack-a': 2 };
  f.bank = { copper: 39 };
  delete f.workdays;
  delete f.lastWorkday;
  const n = normalizeFacility(JSON.parse(JSON.stringify(f)), 100000);
  assert.equal(n.version, 42);
  assert.equal(n.builds['rack-a'], 2);
  assert.equal(n.bank.copper, 39);
  assert.equal(n.workdays, 0);
  assert.equal(n.lastWorkday, '');
});
test('daily stamp pays once per UTC day and earns the gold shirt across nonconsecutive days', () => {
  let now = Date.UTC(2026, 8, 7, 12),
    f = newFacility(now);
  assert.throws(
    () => act(f, 'outfit', { id: 'afterhours' }, 10000, now),
    /3 different days/,
  );
  for (let day = 0; day < 3; day++) {
    now += 3 * 86400000;
    f = normalizeFacility(f, now);
    for (const task of DAILY_TASKS) {
      f.daily[task.stat] = task.target;
      f = act(f, 'daily', { id: task.id }, 0, now).facility;
    }
    const a = { type: 'daily-bonus', requestId: crypto.randomUUID() };
    const paid = applyFacility(f, a, 0, now);
    assert.equal(paid.credits, 25);
    f = paid.facility;
    assert.equal(applyFacility(f, a, 0, now).credits, 0);
    assert.throws(() => act(f, 'daily-bonus', {}, 0, now), /all three daily/);
  }
  assert.equal(f.workdays, 3);
  assert.ok(f.owned.includes('afterhours'));
  const next = act(f, 'outfit', { id: 'afterhours' }, 0, now);
  assert.equal(next.credits, 0);
  assert.equal(next.facility.outfit, 'afterhours');
});
test('guidance recovers from spent starter credits, banked parts and full backpacks', () => {
  const now = 100000,
    f = newFacility(now);
  f.claims = ['welcome', 'maker'];
  f.inventory = { kit: 1, copper: 4 };
  f.stats.crafted = 1;
  assert.equal(resolveObjective(f, 0, now).action.type, 'build');
  f.inventory = { copper: 4 };
  f.bank = { kit: 1 };
  assert.deepEqual(resolveObjective(f, 15, now, { items: { kit: 1 } }).action, {
    type: 'bank',
    item: 'kit',
    quantity: 1,
    direction: 'withdraw',
  });
  const full = newFacility(now);
  full.inventory = { copper: 120 };
  assert.equal(resolveObjective(full, 0, now).action.direction, 'deposit');
  full.craft = { recipe: 'kit', readyAt: now };
  assert.equal(resolveObjective(full, 0, now).action.direction, 'deposit');
});
test('one objective route can finish every story project without invented inventory or currency', () => {
  let now = Date.UTC(2026, 8, 7, 10),
    f = newFacility(now),
    credits = 0;
  for (
    let step = 0;
    step < 1400 &&
    f.claims.filter((id) => STORY.some((c) => c.id === id)).length < 9;
    step++
  ) {
    const next = resolveObjective(f, credits, now);
    if (next.wait) {
      now += 60000;
      continue;
    }
    if (next.repair) {
      f = repairLoot(f, 'network', now);
      credits += 25;
      continue;
    }
    assert.ok(next.action, `No action for ${next.title}`);
    const result = act(f, next.action.type, next.action, credits, now);
    f = result.facility;
    credits += result.credits;
    now += 1000;
  }
  assert.equal(
    f.claims.filter((id) => STORY.some((c) => c.id === id)).length,
    9,
  );
  assert.ok(resolveObjective(f, credits, now).title);
});

test('tycoon storage is capped, keeps fractional ticks, and continues during optional outages', async () => {
  const { storedComputeNow, computeTankCapacity } =
    await import('../lib/facility.ts');
  let f = newFacility(0);
  f.builds = { 'rack-a': 1 };
  assert.equal(storedComputeNow(f, 14999), 0);
  assert.equal(storedComputeNow(f, 15000), 6);
  f = act(f, 'intro', { id: 'arrival' }, 0, 16000).facility;
  assert.equal(storedComputeNow(f, 30000), 12);
  assert.equal(storedComputeNow(f, 86400000), computeTankCapacity(f));
  f.incident = { at: 45000, rack: 'rack-a', kind: 'heat', startedAt: null };
  assert.equal(storedComputeNow(f, 86400000), computeTankCapacity(f));
  const claimed = act(f, 'compute-harvest', {}, 0, 50000);
  assert.equal(claimed.facility.compute, 18);
  assert.equal(claimed.facility.storedCompute, 0);
  assert.throws(
    () => act(claimed.facility, 'compute-harvest', {}, 18, 50001),
    /warming up/,
  );
});
test('compute jobs require racks and time, snapshot output, and pay once', () => {
  let f = newFacility(0);
  assert.throws(() => act(f, 'compute-start', { id: 'quick' }, 0, 0), /rack/);
  f.builds = { 'rack-a': 1 };
  assert.throws(() => act(f, 'compute-start', { id: 'heavy' }, 0, 0), /rack/);
  f = act(f, 'compute-start', { id: 'quick' }, 0, 0).facility;
  assert.equal(f.workload.reward, 10);
  assert.throws(
    () => act(f, 'compute-start', { id: 'quick' }, 0, 0),
    /current/,
  );
  assert.throws(() => act(f, 'compute-collect', {}, 0, 14999), /running/);
  const id = crypto.randomUUID();
  f = act(f, 'compute-collect', { requestId: id }, 0, 15000).facility;
  assert.equal(f.compute, 10);
  assert.equal(f.stats.computeJobs, 1);
  assert.equal(f.incident.at, 315000);
  assert.equal(
    act(f, 'compute-collect', { requestId: id }, 10, 16000).facility.compute,
    10,
  );
  assert.throws(() => act(f, 'compute-collect', {}, 0, 16000), /running/);
});
test('outages preserve waiting batches and require a timed ordered repair, with a single bonus', async () => {
  const { OUTAGE_STEPS, storedComputeNow } = await import('../lib/facility.ts');
  let f = newFacility(0);
  f.builds = { 'rack-a': 1 };
  f = act(f, 'compute-start', { id: 'quick' }, 0, 0).facility;
  f.incident = { at: 10000, rack: 'rack-a', kind: 'power', startedAt: null };
  assert.equal(act(f, 'compute-collect', {}, 0, 15000).credits, 10);
  assert.throws(
    () =>
      act(
        f,
        'outage-fix',
        { id: '10000', direction: OUTAGE_STEPS.power.join('|') },
        0,
        15000,
      ),
    /moment/,
  );
  f = act(f, 'outage-start', { id: '10000' }, 0, 15000).facility;
  assert.throws(
    () => act(f, 'outage-fix', { id: '10000', direction: 'wrong' }, 0, 19000),
    /order/,
  );
  f = act(
    f,
    'outage-fix',
    { id: '10000', direction: OUTAGE_STEPS.power.join('|') },
    0,
    19000,
  ).facility;
  assert.equal(f.compute, 40);
  assert.equal(f.builds['rack-a'], 1);
  assert.equal(storedComputeNow(f, 20000), 6);
  assert.throws(
    () =>
      act(
        f,
        'outage-fix',
        { id: '10000', direction: OUTAGE_STEPS.power.join('|') },
        0,
        20000,
      ),
    /no longer/,
  );
  f = act(f, 'compute-collect', {}, 40, 20000).facility;
  assert.equal(f.compute, 50);
});
test('Compute is the spendable balance; accessories and upgrades debit once and token exchange is closed', () => {
  let f = newFacility(0);
  f.builds = { 'rack-a': 1 };
  const id = crypto.randomUUID();
  const n = act(f, 'compute-upgrade', { requestId: id }, 180, 0);
  assert.equal(n.credits, -20);
  assert.equal(n.facility.compute, 160);
  assert.equal(
    act(n.facility, 'compute-upgrade', { requestId: id }, 100, 0).credits,
    0,
  );
  const worn = act(n.facility, 'accessory', { id: 'pack' }, 100, 0);
  assert.equal(worn.credits, -60);
  assert.equal(worn.facility.accessory, 'pack');
  assert.equal(
    act(worn.facility, 'accessory', { id: 'pack' }, 40, 0).credits,
    0,
  );
  assert.throws(
    () => act(worn.facility, 'accessory', { id: 'beacon' }, 40, 0),
    /Compute/,
  );
  assert.throws(
    () => act(worn.facility, 'compute-exchange', {}, 1000, 0),
    /not open/,
  );
});
test('first shift introduces Margo then guides building without forcing optional outages', async () => {
  const { shiftObjective, nextBriefing } = await import('../lib/experience.ts');
  let f = newFacility(0);
  assert.equal(nextBriefing(f).id, 'arrival');
  f = act(f, 'intro', { id: 'arrival' }, 0, 0).facility;
  assert.equal(shiftObjective(f, 0, 0).target, 'margo');
  f = act(f, 'intro', { id: 'welcome' }, 0, 0).facility;
  assert.equal(shiftObjective(f, 0, 0).action.type, 'build');
  assert.throws(() => act(f, 'intro', { id: 'compute' }, 0, 0), /not ready/);
  f.builds = { 'rack-a': 1 };
  assert.equal(shiftObjective(f, 0, 0).target, 'scrap-a');
  f.stats.gathered = 4; f.stats.crafted = 1;
  assert.equal(shiftObjective(f, 20, 0).panel, 'contracts');
  assert.equal(shiftObjective(f, 20, 0).action, undefined);
  f.incident = { at: 0, rack: 'rack-a', kind: 'heat', startedAt: null };
  assert.equal(shiftObjective(f, 0, 0).panel, 'contracts');
  const old = { version: 17, builds: { 'rack-a': 1 }, computeAt: undefined };
  delete old.computeAt;
  assert.equal(normalizeFacility(old, 40000).computeAt, 40000);
  assert.equal(normalizeFacility(old, 40000).compute, 0);
  assert.equal(normalizeFacility(old, 40000).version, 17);
});

test('starter appearance saves without spending Compute or unlocking earned cosmetics', () => {
  let f = newFacility(100000);
  for (const [type, id] of [
    ['outfit', 'starter-coral'],
    ['accessory', 'cap'],
    ['intro', 'arrival'],
    ['intro', 'identity'],
  ]) {
    const next = act(f, type, { id }, 0);
    assert.equal(next.credits, 0);
    f = next.facility;
  }
  assert.equal(f.outfit, 'starter-coral');
  assert.equal(f.accessory, 'cap');
  assert.ok(f.seen.includes('intro:identity'));
  const restored = normalizeFacility(JSON.parse(JSON.stringify(f)), 100000);
  assert.equal(restored.outfit, 'starter-coral');
  assert.equal(restored.accessory, 'cap');
  assert.throws(
    () => act(restored, 'outfit', { id: 'afterhours' }, 0),
    FacilityError,
  );
  assert.throws(
    () => act(restored, 'accessory', { id: 'pack' }, 0),
    FacilityError,
  );
});
