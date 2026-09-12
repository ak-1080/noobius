import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
} from '../lib/facility.ts';
import { contractFor } from '../lib/contracts.ts';
import {
  startPersonalGoal,
  personalGoalProgress,
  personalGoalObjective,
  readPersonalGoal,
  SHIFT_GOALS,
} from '../lib/personal-goals.ts';
import { shiftObjective } from '../lib/experience.ts';
import { partsPlanObjective, nestedPartsPlan } from '../lib/parts-plan.ts';
const now = 1700000000000;
const fresh = () => normalizeFacility(newFacility(now), now);
test('a mixed shift counts new collected jobs, not repeated work in one family or spent reports', () => {
  const f = fresh();
  f.career.completed = { service: 20, supply: 10, workload: 5 };
  const goal = startPersonalGoal(f, 'mixed');
  assert.equal(personalGoalProgress(f, goal).done, 0);
  f.career.completed.service += 8;
  assert.equal(personalGoalProgress(f, goal).done, 1);
  f.career.completed.supply++;
  f.career.completed.workload++;
  f.career.projectUsed = { ...f.career.completed };
  assert.equal(personalGoalProgress(f, goal).complete, true);
  const before = structuredClone(f);
  assert.equal(personalGoalObjective(f, goal).view.jobsTab, 'progress');
  assert.equal(personalGoalProgress(f, startPersonalGoal(f, 'mixed')).done, 0);
  assert.deepEqual(
    f,
    before,
    'reading and repeating a goal never grants currency or changes the game',
  );
});
test('family goals work after every collection is complete and ignore other job families', () => {
  const f = fresh();
  f.career.completed = { service: 900, supply: 900, workload: 900 };
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.discoveries = Array.from({ length: 12 }, (_, i) => String(i));
  for (const spec of SHIFT_GOALS)
    assert.equal(
      personalGoalProgress(f, startPersonalGoal(f, spec.id)).done,
      0,
    );
  const goal = startPersonalGoal(f, 'workload');
  f.career.completed.supply += 30;
  assert.equal(personalGoalProgress(f, goal).done, 0);
  f.career.completed.workload += 3;
  assert.equal(personalGoalProgress(f, goal).complete, true);
  f.career.completed.workload = 0;
  assert.equal(personalGoalProgress(f, goal).reset, true);
  assert.equal(personalGoalProgress(f, goal).complete, false);
});
test('invalid or future browser journals cannot break the game', () => {
  const goal = startPersonalGoal(fresh(), 'mixed');
  assert.deepEqual(readPersonalGoal(JSON.stringify(goal)), goal);
  for (const input of [
    null,
    '',
    '{broken',
    'null',
    '{}',
    JSON.stringify({ ...goal, version: 2 }),
    JSON.stringify({ ...goal, id: 'payout' }),
    JSON.stringify({
      ...goal,
      baseline: { service: -1, supply: 0, workload: 0 },
    }),
  ])
    assert.equal(readPersonalGoal(input), null);
});
test('the first accepted job teaches its own required supplies without completing the job', () => {
  let f = fresh();
  f.seen.push('intro:arrival', 'intro:welcome');
  f.builds = { 'rack-a': 1 };
  assert.equal(shiftObjective(f, 0, now).title, 'Pick your first job');
  const offer = f.career.offers.find((o) => contractFor(o).family === 'supply');
  f = applyFacility(
    f,
    { type: 'contract-accept', id: offer.id, requestId: crypto.randomUUID() },
    f.compute,
    now,
  ).facility;
  f.inventory = {};
  const before = structuredClone(f);
  const objective = shiftObjective(f, 0, now);
  assert.match(objective.chapter, /^SUPPLIES FOR/);
  assert.ok(objective.target);
  assert.notEqual(objective.target, contractFor(offer).target);
  assert.deepEqual(f, before);
});
test('project supplies retain their exact destination through nested crafting and pickups', () => {
  const f = fresh();
  const plan = {
    items: { board: 1 },
    source: {
      label: 'Test cluster',
      panel: 'project',
      view: {
        projectId: 'project-a',
        projectRealm: 'commons',
        projectNeighborhood: 'crew-a',
      },
    },
  };
  const nested = nestedPartsPlan(plan, {
    recipe: 'board',
    source: {
      label: 'Circuit board',
      panel: 'crafting',
      view: { recipe: 'board' },
    },
  });
  assert.deepEqual(nested, plan);
  f.inventory = { board: 1 };
  const step = partsPlanObjective(f, 0, now, nested);
  assert.equal(step.panel, 'project');
  assert.deepEqual(step.view, plan.source.view);
  assert.equal(step.action, undefined);
});
test('an unavailable machine or oversized batch returns to setup before gathering', () => {
  let f = fresh();
  f.seen.push('intro:arrival', 'intro:welcome');
  f.builds = { 'rack-a': 1 };
  const offer = f.career.offers.find(
    (o) => contractFor(o).family === 'workload',
  );
  f = applyFacility(
    f,
    { type: 'contract-accept', id: offer.id, requestId: crypto.randomUUID() },
    f.compute,
    now,
  ).facility;
  f.inventory = {};
  for (const draft of [
    { rack: '', style: 'standard', quantity: 3 },
    { rack: 'rack-a', style: 'standard', quantity: 3 },
    { rack: 'rack-a', style: 'fast', quantity: 1 },
  ]) {
    const step = shiftObjective(f, f.compute, now, false, {
      [offer.id]: draft,
    });
    assert.equal(step.panel, 'contracts');
    assert.equal(step.view.jobId, offer.id);
    assert.equal(step.action, undefined);
    assert.equal(step.target, undefined);
  }
  const valid = shiftObjective(f, f.compute, now, false, {
    [offer.id]: { rack: 'rack-a', style: 'standard', quantity: 1 },
  });
  assert.match(valid.chapter, /^SUPPLIES FOR/);
});
