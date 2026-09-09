import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
} from '../lib/facility.ts';
import { contractTemplate } from '../lib/contracts.ts';
import { resolveObjective } from '../lib/objectives.ts';
import { guidanceFor } from '../lib/guidance.ts';
import { partsPlanObjective } from '../lib/parts-plan.ts';
const now = 1700000000000;
const fresh = () => normalizeFacility(newFacility(now), now);
function withJob() {
  let f = fresh();
  f.builds = { 'rack-a': 1 };
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  f = applyFacility(
    f,
    { type: 'contract-accept', id: offer.id, requestId: crypto.randomUUID() },
    f.compute,
    now,
  ).facility;
  return {
    f,
    source: {
      label: 'Training',
      panel: 'contracts',
      view: { jobsTab: 'board', jobId: offer.id },
    },
  };
}
test('bulk parts guidance requires the whole batch, not one recipe', () => {
  const f = fresh();
  f.storage = 5;
  f.inventory = { scrap: 4, copper: 3, silicon: 3 };
  const step = resolveObjective(f, f.compute, now, { items: { board: 24 } });
  assert.equal(step.action.type, 'gather');
  assert.match(step.detail, /92 more/);
  f.inventory = { scrap: 96, copper: 72, silicon: 72 };
  const ready = resolveObjective(f, f.compute, now, { items: { board: 24 } });
  assert.equal(ready.action.quantity, 24);
  assert.match(ready.detail, /192 seconds/);
  const guide = guidanceFor(ready);
  assert.deepEqual(guide.view, { recipe: 'board', quantity: 24 });
  assert.equal(guide.panel, 'crafting');
  assert.equal(guide.action, undefined);
});
test('large component goals suggest explicit feasible batches without lowering the goal', () => {
  const f = fresh();
  f.inventory = { scrap: 48, copper: 36, silicon: 36 };
  const request = { items: { board: 24 } };
  const before = structuredClone(request);
  const step = resolveObjective(f, f.compute, now, request);
  assert.equal(step.action.quantity, 12);
  assert.match(step.detail, /12 now toward 24/);
  assert.deepEqual(request, before);
  f.inventory = { board: 12, scrap: 40, copper: 30, silicon: 30 };
  const next = resolveObjective(f, f.compute, now, request);
  assert.equal(next.action.quantity, 10);
  assert.match(next.detail, /10 now toward 12/);
});
test('banked components are used before planning fabrication of the remainder', () => {
  const f = fresh();
  f.storage = 5;
  f.inventory = { board: 5 };
  f.bank = { board: 3 };
  const request = { items: { board: 24 } };
  assert.equal(resolveObjective(f, f.compute, now, request).action.quantity, 3);
  f.inventory = { board: 8, scrap: 64, copper: 48, silicon: 48 };
  f.bank = {};
  assert.equal(
    resolveObjective(f, f.compute, now, request).action.quantity,
    16,
  );
});
test('supplies follow their source job through pickups and return to it without changing tracking', () => {
  const { f, source } = withJob();
  f.career.selected = 'other-job';
  f.inventory = {};
  const plan = { items: { silicon: 9, copper: 3 }, source };
  const original = structuredClone(plan);
  assert.match(partsPlanObjective(f, f.compute, now, plan).title, /chips/i);
  f.inventory.silicon = 9;
  assert.match(partsPlanObjective(f, f.compute, now, plan).title, /wire/i);
  f.inventory.copper = 3;
  const ready = partsPlanObjective(f, f.compute, now, plan);
  assert.equal(ready.panel, 'contracts');
  assert.deepEqual(ready.view, source.view);
  assert.equal(ready.action, undefined);
  assert.equal(f.career.selected, 'other-job');
  assert.deepEqual(plan, original);
});
test('started or missing source jobs cannot keep a stale supply plan alive', () => {
  const { f, source } = withJob();
  const plan = { items: { board: 4 }, source };
  f.career.active[0].state = 'running';
  assert.equal(partsPlanObjective(f, f.compute, now, plan), null);
  f.career.active = [];
  assert.equal(partsPlanObjective(f, f.compute, now, plan), null);
});
test('explicit oversized crafting requests return to batch selection instead of an impossible gather loop', () => {
  const f = fresh();
  const plan = {
    items: { scrap: 96, copper: 72, silicon: 72 },
    source: {
      label: '24 boards',
      panel: 'crafting',
      view: { recipe: 'board', quantity: 24 },
    },
  };
  const step = partsPlanObjective(f, f.compute, now, plan);
  assert.equal(step.panel, 'crafting');
  assert.equal(step.view.quantity, 24);
  assert.match(step.detail, /240 spaces.*120/);
  assert.equal(step.action, undefined);
});
test('finished batch pickup preserves its identity and routes a full backpack to storage', () => {
  const { f, source } = withJob();
  f.craft = {
    id: 'actual-batch',
    recipe: 'board',
    quantity: 12,
    readyAt: now - 1,
  };
  f.inventory = {};
  const plan = { items: { board: 24 }, source };
  assert.equal(
    partsPlanObjective(f, f.compute, now, plan).action.id,
    'actual-batch',
  );
  f.inventory = { copper: 115 };
  const blocked = partsPlanObjective(f, f.compute, now, plan);
  assert.equal(blocked.action.type, 'bank');
  assert.equal(blocked.action.direction, 'deposit');
  assert.equal(f.craft.quantity, 12);
});
test('ready recipe supplies return with selected recipe and quantity intact', () => {
  const f = fresh();
  f.inventory = { scrap: 48, copper: 36, silicon: 36 };
  const plan = {
    items: { ...f.inventory },
    source: {
      label: '12 boards',
      panel: 'crafting',
      view: { recipe: 'board', quantity: 12 },
    },
  };
  const step = partsPlanObjective(f, f.compute, now, plan);
  assert.deepEqual(step.view, plan.source.view);
  assert.equal(step.target, 'workbench');
  assert.equal(step.action, undefined);
});
test('oversized job input quotes return to configuration rather than cycling stored ingredients', () => {
  const { f, source } = withJob();
  const plan = { items: { board: 30, silicon: 90, copper: 30 }, source };
  f.inventory = { board: 30, silicon: 90 };
  const next = partsPlanObjective(f, f.compute, now, plan);
  assert.equal(next.panel, 'contracts');
  assert.equal(next.action, undefined);
  assert.equal(next.view.jobId, source.view.jobId);
  assert.match(next.detail, /150 spaces.*120/);
});
test('a built equipment module invalidates its supply plan without demanding replacement ingredients', () => {
  const f = fresh();
  const plan = {
    items: { board: 4 },
    source: {
      label: 'Fast',
      panel: 'contracts',
      view: { jobsTab: 'equipment', moduleId: 'fast' },
    },
  };
  assert.ok(partsPlanObjective(f, f.compute, now, plan));
  f.career.modules.push('fast');
  assert.equal(partsPlanObjective(f, f.compute, now, plan), null);
});
test('full backpack guidance stores unrelated surplus before required ingredients', () => {
  const f = fresh();
  f.inventory = { board: 24, silicon: 90, scrap: 6 };
  const step = resolveObjective(f, f.compute, now, {
    items: { board: 24, silicon: 90, copper: 3 },
  });
  assert.equal(step.action.type, 'bank');
  assert.equal(step.action.item, 'scrap');
  assert.equal(step.action.quantity, 6);
});
