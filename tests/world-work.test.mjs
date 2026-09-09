import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
  OBJECTS,
} from '../lib/facility.ts';
import { worldWork, workEffectTarget } from '../lib/world-work.ts';
import { CONTRACT_TEMPLATES } from '../lib/contracts.ts';
const now = 1000000,
  uuid = () => crypto.randomUUID();
const base = () => normalizeFacility(newFacility(now), now);
const run = (fields = {}) => ({
  id: 'contract-1',
  template: CONTRACT_TEMPLATES.find((t) => t.family === 'workload').id,
  acceptedAt: now,
  state: 'running',
  style: 'standard',
  rack: 'rack-g',
  startedAt: now,
  readyAt: now + 15000,
  reward: 30,
  reputation: 10,
  cost: {},
  steps: 0,
  nextStepAt: 0,
  duration: 15,
  ...fields,
});

test('running and ready client work points to its assigned rack and exact job until claim', () => {
  const f = base();
  f.career.active = [run()];
  let signal = worldWork(f, now)[0];
  assert.equal(signal.objectId, 'rack-g');
  assert.equal(signal.phase, 'running');
  assert.equal(signal.progress, 0);
  assert.deepEqual(signal.view, { jobsTab: 'board', jobId: 'contract-1' });
  signal = worldWork(f, now + 15000)[0];
  assert.equal(signal.phase, 'ready');
  assert.equal(signal.progress, 1);
  assert.match(signal.caption, /ready/);
  f.career.active = [];
  assert.deepEqual(worldWork(f, now + 15001), []);
});
test('service indicators require the actual repair step and leave ordinary station definitions intact', () => {
  const f = base(),
    object = structuredClone(OBJECTS.find((o) => o.id === 'scrap-c'));
  f.career.active = [
    run({
      template: 'dust-patrol',
      rack: null,
      readyAt: null,
      nextStepAt: now + 3000,
    }),
  ];
  assert.equal(worldWork(f, now)[0].objectId, 'scrap-c');
  assert.equal(worldWork(f, now)[0].phase, 'running');
  assert.match(worldWork(f, now + 3000)[0].caption, /inspect/);
  f.career.active[0].steps = 2;
  assert.match(worldWork(f, now + 3000)[0].caption, /run test/);
  assert.notEqual(worldWork(f, now + 3000)[0].phase, 'ready');
  f.career.active[0].state = 'ready';
  assert.equal(worldWork(f, now + 3000)[0].phase, 'ready');
  assert.deepEqual(
    OBJECTS.find((o) => o.id === 'scrap-c'),
    object,
  );
});
test('commissioning frees its indicator at the deadline without needing a claim or altering saves', () => {
  const f = base();
  f.projectReservations = [
    {
      id: uuid(),
      projectId: uuid(),
      rack: 'rack-a',
      startedAt: now,
      readyAt: now + 300000,
    },
  ];
  const saved = structuredClone(f);
  assert.equal(worldWork(f, now + 150000)[0].progress, 0.5);
  assert.deepEqual(worldWork(f, now + 300000), []);
  assert.deepEqual(f, saved);
});
test('crafting freezes its start, shows bulk progress and stays ready until explicit collection', () => {
  const f = base();
  f.inventory = { scrap: 50, copper: 50, silicon: 50 };
  const made = applyFacility(
    f,
    { type: 'craft', id: 'kit', quantity: 3, requestId: uuid() },
    1000,
    now,
  ).facility;
  assert.equal(made.craft.startedAt, now);
  assert.equal(made.craft.quantity, 3);
  const end = made.craft.readyAt;
  assert.equal(worldWork(made, (now + end) / 2)[0].progress, 0.5);
  assert.match(worldWork(made, end)[0].caption, /3 ×.*ready/);
  assert.equal(worldWork(made, end)[0].panel, 'crafting');
  assert.ok(made.craft);
  const old = structuredClone(made);
  delete old.craft.startedAt;
  assert.equal(worldWork(old, now)[0].progress, null);
  assert.equal(worldWork(old, end)[0].phase, 'ready');
});
test('private work is absent in campus/visitor presentation and effects resolve before removal', () => {
  const f = base();
  f.career.active = [run()];
  f.craft = { recipe: 'kit', readyAt: now + 15000 };
  assert.deepEqual(worldWork(f, now, false), []);
  assert.equal(
    workEffectTarget(f, { type: 'contract-claim', id: 'contract-1' }),
    'rack-g',
  );
  assert.equal(
    workEffectTarget(f, {
      type: 'contract-start',
      id: 'contract-1',
      rack: 'rack-f',
    }),
    'rack-f',
  );
  assert.equal(
    workEffectTarget(f, { type: 'contract-claim', id: 'not-a-job' }),
    undefined,
  );
});
