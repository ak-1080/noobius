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
} from '../lib/facility.ts';
const act = (f, type, extras = {}, credits = 1000, now = 100000) =>
  applyFacility(
    f,
    { type, ...extras, requestId: crypto.randomUUID() },
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
  assert.equal(cr, 115);
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
  assert.throws(() => act(f, 'build', { id: 'rack-b' }), /power/);
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
    /credits/,
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
