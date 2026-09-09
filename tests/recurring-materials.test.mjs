import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
  recipeFor,
  craftQuote,
  ITEMS,
  SHOP_ITEMS,
} from '../lib/facility.ts';
import {
  contractFor,
  contractTemplate,
  eligibleContracts,
  validCareer,
  serviceChallenge,
} from '../lib/contracts.ts';
import { jobSetup } from '../lib/job-choices.ts';
import { resolveObjective } from '../lib/objectives.ts';
import {
  partsPlanObjective,
  nestedPartsPlan,
  withBoardVariant,
} from '../lib/parts-plan.ts';
import { worldWork } from '../lib/world-work.ts';
import { GuestSaveStore } from '../lib/guest-save.ts';
import { guestProfile } from '../lib/game.ts';

const now = Date.UTC(2026, 8, 9, 12);
function fixture() {
  const f = normalizeFacility(newFacility(now), now);
  f.unlocked = [
    'commons',
    'salvage',
    'workshop',
    'thermal',
    'compute',
    'network',
    'core',
  ];
  f.skills.engineering = 20;
  f.storage = 5;
  f.builds = { 'rack-a': 1 };
  f.career.completed = { service: 12, supply: 12, workload: 12 };
  f.inventory = {
    scrap: 30,
    copper: 30,
    silicon: 20,
    coolant: 20,
    pump: 2,
    board: 2,
    battery: 2,
    kit: 2,
  };
  return f;
}
const act = (f, type, fields = {}, at = now) =>
  applyFacility(
    f,
    { type, ...fields, requestId: crypto.randomUUID() },
    f.compute,
    at,
  ).facility;
function offer(f, template, version) {
  const family = contractTemplate(template).family;
  const o = f.career.offers.find((o) => contractFor(o).family === family);
  o.template = template;
  if (version === undefined) delete o.termsVersion;
  else o.termsVersion = version;
  return o;
}
function finish(f, id) {
  let run = f.career.active.find((r) => r.id === id),
    at = run.readyAt;
  if (contractFor(run).family === 'service') {
    for (const direction of ['Inspect', serviceChallenge(run).answer, 'Test']) {
      at = f.career.active.find((r) => r.id === id).nextStepAt;
      f = act(f, 'contract-service', { id, direction }, at);
    }
    at = f.career.active.find((r) => r.id === id).nextStepAt;
  }
  return act(f, 'contract-claim', { id }, at);
}

for (const template of ['cooling-call', 'field-stock']) {
  for (const version of [undefined, 1, 2])
    test(`${template} terms ${version ?? 'legacy'} survive acceptance, cancel, reload and payment`, () => {
      let f = fixture();
      const saved = structuredClone(offer(f, template, version));
      const terms = contractTemplate(template, version ?? 1);
      const untouched = structuredClone(
        f.career.offers.filter((o) => o.id !== saved.id),
      );
      assert.deepEqual(
        jobSetup(f, contractFor(saved), 'standard').cost,
        terms.cost,
      );
      f = act(f, 'contract-accept', { id: saved.id });
      assert.equal(f.career.active[0].termsVersion, version);
      assert.equal(f.career.active[0].quoteVersion, 2);
      f = act(f, 'contract-cancel', { id: saved.id });
      assert.deepEqual(
        f.career.offers.find((o) => o.id === saved.id),
        saved,
      );
      f = act(f, 'contract-accept', { id: saved.id });
      // Old terms do not acquire new room/skill restrictions after a reload.
      if (version !== 2) {
        f.unlocked = ['commons', 'salvage', 'workshop'];
        f.skills.engineering = 0;
      }
      f = act(
        normalizeFacility(JSON.parse(JSON.stringify(f)), now),
        'contract-start',
        { id: saved.id },
      );
      const run = structuredClone(f.career.active[0]);
      assert.deepEqual(run.cost, terms.cost);
      assert.equal(run.reward, terms.reward);
      assert.equal(run.duration, terms.seconds);
      assert.deepEqual(normalizeFacility(f, now + 1000).career.active[0], run);
      f = finish(f, saved.id);
      assert.equal(f.career.lastReceipt.reward, terms.reward);
      assert.ok(validCareer(f.career));
      assert.deepEqual(
        f.career.offers.filter((o) => untouched.some((a) => a.id === o.id)),
        untouched,
      );
      assert.equal(
        f.career.offers.find((o) => !untouched.some((a) => a.id === o.id))
          .termsVersion,
        2,
      );
    });
}
test('pre-upgrade accepted runs keep both legacy quote behavior and original materials', () => {
  let f = fixture();
  const o = offer(f, 'field-stock');
  f = act(f, 'contract-accept', { id: o.id });
  delete f.career.active[0].quoteVersion;
  f = act(f, 'contract-start', { id: o.id });
  assert.equal(f.career.active[0].quoteVersion, undefined);
  assert.deepEqual(f.career.active[0].cost, { kit: 1, board: 1, battery: 1 });
  assert.equal(finish(f, o.id).career.lastReceipt.reward, 340);
});
test('explicit dispatch replacement adopts current terms once and survives cancellation', () => {
  let f = fixture();
  const o = offer(f, 'loose-link');
  const ticket = `${crypto.randomUUID()}:0`;
  f.career.dispatchChoices = { service: [ticket] };
  const before = structuredClone(f);
  assert.throws(
    () =>
      act(f, 'contract-accept', {
        id: o.id,
        template: o.template,
        dispatchTicket: ticket,
      }),
    /different job/,
  );
  assert.deepEqual(f, before);
  f = act(f, 'contract-accept', {
    id: o.id,
    template: 'cooling-call',
    dispatchTicket: ticket,
  });
  assert.equal(f.career.active[0].termsVersion, 2);
  assert.deepEqual(f.career.dispatchChoices.service, []);
  f = act(f, 'contract-cancel', { id: o.id });
  f = act(f, 'contract-accept', { id: o.id });
  f = act(f, 'contract-start', { id: o.id });
  assert.deepEqual(f.career.active[0].cost, { pump: 1 });
  assert.equal(f.career.active[0].reward, 135);
});
test('new pump offers require Thermal and Engineering 2; malformed saved versions fail', () => {
  const f = fixture();
  const available = () =>
    ['service', 'supply']
      .flatMap((family) => eligibleContracts(f.career, f, family))
      .map((t) => t.id);
  assert.ok(
    available().includes('cooling-call') && available().includes('field-stock'),
  );
  f.skills.engineering = 19;
  assert.ok(
    !available().includes('cooling-call') &&
      !available().includes('field-stock'),
  );
  f.skills.engineering = 20;
  f.unlocked = f.unlocked.filter((z) => z !== 'thermal');
  assert.ok(
    !available().includes('cooling-call') &&
      !available().includes('field-stock'),
  );
  for (const invalid of [null, 0, 3, '2']) {
    const bad = fixture();
    bad.career.offers[0].termsVersion = invalid;
    assert.equal(validCareer(bad.career), false);
    assert.throws(() => normalizeFacility(bad, now), /job terms/);
  }
  const base = fixture();
  const o = offer(base, 'cooling-call');
  const mismatch = act(base, 'contract-accept', { id: o.id });
  mismatch.career.active[0].termsVersion = 2;
  assert.equal(validCareer(mismatch.career), false);
  assert.throws(() => normalizeFacility(mismatch, now), /job terms/);
});
for (const quantity of [1, 30])
  test(`recovered batch ${quantity} spends exactly once and freezes the ordinary board output`, () => {
    let f = fixture();
    f.inventory = { scrap: 4 * quantity, fiber: 2 * quantity, core: quantity };
    const started = act(f, 'craft', {
      id: 'board',
      variant: 'recovered',
      quantity,
    });
    assert.deepEqual(started.inventory, { scrap: 0, fiber: 0, core: 0 });
    assert.equal(started.craft.recipe, 'board');
    assert.equal(started.craft.variant, 'recovered');
    assert.equal(started.craft.readyAt, now + 8000 * quantity);
    assert.equal(
      worldWork(started, now).find((s) => s.kind === 'craft').view
        .recipeVariant,
      'recovered',
    );
    const frozen = structuredClone(started.craft);
    assert.throws(
      () => act(started, 'craft', { id: 'board', variant: 'standard' }),
      /Collect/,
    );
    assert.deepEqual(started.craft, frozen);
    f = act(
      normalizeFacility(started, now + 1),
      'collect',
      { id: frozen.id },
      frozen.readyAt,
    );
    assert.equal(f.inventory.board, quantity);
    assert.equal(f.craft, null);
  });
test('server recipe whitelist, Core access and skill gates reject without spending', () => {
  const f = fixture(),
    before = structuredClone(f);
  for (const fields of [
    { id: 'board', variant: 'free' },
    { id: 'board', variant: null },
    { id: 'pump', variant: 'recovered' },
    { id: 'recovered-board' },
  ])
    assert.throws(() => act(f, 'craft', fields), /recipe/);
  assert.deepEqual(f, before);
  f.unlocked = f.unlocked.filter((z) => z !== 'core');
  assert.throws(
    () => act(f, 'craft', { id: 'board', variant: 'recovered' }),
    /department/,
  );
  f.unlocked.push('core');
  f.skills.engineering = 19;
  assert.throws(
    () => act(f, 'craft', { id: 'board', variant: 'recovered' }),
    /engineering/,
  );
  assert.deepEqual(craftQuote(recipeFor('board')), {
    cost: { scrap: 4, copper: 3, silicon: 3 },
    seconds: 8,
  });
});
test('old pending boards preserve finish time, quantity and guest loading', () => {
  const f = fixture();
  f.inventory = {};
  f.craft = { recipe: 'board', quantity: 3, readyAt: now + 7777 };
  const normalized = normalizeFacility(f, now);
  assert.deepEqual(normalized.craft, f.craft);
  assert.equal(act(f, 'collect', {}, f.craft.readyAt).inventory.board, 3);
  const profile = guestProfile();
  profile.facility = f;
  profile.credits = f.compute;
  let text = null;
  const storage = {
    getItem: () => text,
    setItem: (_, value) => {
      text = value;
    },
  };
  const store = () =>
    new GuestSaveStore(
      () => storage,
      () => now,
    );
  const first = store();
  first.read();
  first.write(profile, null);
  assert.deepEqual(store().read().snapshot.profile.facility.craft, f.craft);
  const saved = JSON.parse(text);
  saved.profile.facility.craft.variant = 'unknown';
  text = JSON.stringify(saved);
  assert.equal(store().read().issue, 'invalid');
});
test('recovered guidance keeps a parent job through feasible batches, pickup and return', () => {
  let f = fixture();
  const o = offer(f, 'wobbly-training', 2);
  f = act(f, 'contract-accept', { id: o.id });
  f.storage = 0;
  f.inventory = { scrap: 68, fiber: 34, core: 17 };
  const parent = {
    items: { board: 24 },
    source: {
      label: 'Training',
      panel: 'contracts',
      view: { jobId: o.id, jobsTab: 'board' },
    },
  };
  const request = {
    items: { scrap: 96, fiber: 48, core: 24 },
    boardVariant: 'recovered',
    source: {
      label: '24 boards',
      panel: 'crafting',
      view: { recipe: 'board', quantity: 24, recipeVariant: 'recovered' },
    },
  };
  const plan = nestedPartsPlan(parent, request);
  assert.deepEqual(plan.items, { board: 24 });
  assert.deepEqual(plan.source, parent.source);
  const step = partsPlanObjective(f, f.compute, now, plan);
  assert.deepEqual(step.action, {
    type: 'craft',
    id: 'board',
    quantity: 17,
    variant: 'recovered',
  });
  assert.equal(step.view.recipeVariant, 'recovered');
  f = act(f, 'craft', step.action);
  const pending = partsPlanObjective(f, f.compute, now, plan);
  assert.equal(pending.view.recipeVariant, 'recovered');
  assert.equal(pending.view.quantity, 17);
  f = act(f, 'collect', { id: f.craft.id }, f.craft.readyAt);
  f.inventory = { board: 24 };
  const done = partsPlanObjective(f, f.compute, now + 200000, plan);
  assert.equal(done.panel, 'contracts');
  assert.deepEqual(done.view, parent.source.view);
  assert.equal(done.action, undefined);
  f.inventory = { scrap: 4, fiber: 2, core: 1 };
  const switched = withBoardVariant(plan, 'standard');
  assert.deepEqual(switched.source, parent.source);
  assert.equal(
    resolveObjective(f, f.compute, now, {
      recipe: 'board',
      boardVariant: switched.boardVariant,
    }).action.id,
    'copper-a',
  );
  assert.equal(parent.boardVariant, undefined);
});
test('recovered preference does not leak into coffee prerequisites; routes retain the bench tradeoff', () => {
  const f = fixture();
  f.inventory = { scrap: 4, fiber: 2, coolant: 2 };
  f.energy = 0;
  f.energyAt = now;
  const step = resolveObjective(f, f.compute, now, {
    recipe: 'board',
    boardVariant: 'recovered',
  });
  assert.equal(step.action.id, 'coffee');
  assert.equal(step.action.variant, undefined);
  const cost = (bag) =>
    Object.entries(bag).reduce((sum, [id, n]) => sum + ITEMS[id].buy * n, 0);
  const ordinary = recipeFor('board'),
    recovered = recipeFor('board', 'recovered');
  assert.equal(cost(ordinary.cost), 77);
  assert.equal(cost({ scrap: 4, fiber: 2 }), 44);
  assert.equal(ordinary.seconds, recovered.seconds);
  assert.equal(SHOP_ITEMS.includes('core'), false);
  assert.equal(135 - cost(recipeFor('pump').cost), 44);
  assert.equal(
    380 -
      cost(recipeFor('pump').cost) -
      cost(ordinary.cost) -
      cost(recipeFor('battery').cost),
    135,
  );
});
