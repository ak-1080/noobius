import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFacility,
  newFacility,
  normalizeFacility,
  storedComputeNow,
  computeTankCapacity,
  ITEMS,
} from '../lib/facility.ts';
import {
  careerFor,
  contractTemplate,
  serviceChallenge,
  SERVICE_REPAIRS,
  validCareer,
  operatorLicense,
  contractQuote,
  CONTRACT_TEMPLATES,
  masteryStamps,
} from '../lib/contracts.ts';
import { actionWorksite } from '../lib/action-authority.ts';
import { arrivalGuidance, guidanceFor } from '../lib/guidance.ts';
import { shiftObjective } from '../lib/experience.ts';
import {
  careerSuggestions,
  jobSelection,
  jobSetup,
  usefulStyles,
} from '../lib/job-choices.ts';
import {
  consumeProjectReport,
  previewProjectReport,
  projectReportStyle,
  projectVariantsFor,
  reportsAvailable,
} from '../lib/projects.ts';

function fixture(at = 0) {
  const f = normalizeFacility(newFacility(at), at);
  f.builds = { 'rack-a': 1, 'rack-b': 1 };
  f.seen.push('intro:welcome');
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 100]));
  return f;
}
function act(f, type, now, extra = {}) {
  return applyFacility(
    f,
    { type, requestId: crypto.randomUUID(), ...extra },
    f.compute,
    now,
  ).facility;
}
function accept(f, family, now) {
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === family,
  );
  return [act(f, 'contract-accept', now, { id: offer.id }), offer.id];
}
function finish(f, id, now) {
  let r = f.career.active.find((r) => r.id === id);
  if (contractTemplate(r.template).family === 'service') {
    now = r.nextStepAt;
    f = act(f, 'contract-service', now, { id, direction: 'Inspect' });
    now = f.career.active[0].nextStepAt;
    f = act(f, 'contract-service', now, {
      id,
      direction: serviceChallenge(r).answer,
    });
    now = f.career.active[0].nextStepAt;
    f = act(f, 'contract-service', now, { id, direction: 'Test' });
  } else now = r.readyAt;
  return [act(f, 'contract-claim', now, { id }), now];
}

test('canceling and reaccepting keeps the same offer, with no earned progress or free rerolls', () => {
  let f = fixture();
  const initial = structuredClone(f.career.offers);
  for (let i = 0; i < 30; i++) {
    const [accepted, id] = accept(f, 'supply', i);
    assert.throws(
      () => act(accepted, 'contract-accept', i, { id }),
      /already been taken/,
    );
    assert.ok(validCareer(accepted.career));
    f = act(accepted, 'contract-cancel', i, { id });
  }
  assert.deepEqual(f.career.offers, initial);
  assert.equal(f.career.reputation, 0);
  assert.deepEqual(f.career.completed, { service: 0, supply: 0, workload: 0 });
});

test('two job limit, escrow, delivery delay, and once-only payout survive retry-history eviction', () => {
  let [f, id] = accept(fixture(), 'supply', 0);
  [f] = accept(f, 'service', 0);
  assert.throws(() => accept(f, 'workload', 0), /before accepting/);
  const before = structuredClone(f);
  f = act(f, 'contract-start', 1000, { id });
  const run = f.career.active.find((r) => r.id === id);
  for (const [item, count] of Object.entries(run.cost))
    assert.equal(f.inventory[item], before.inventory[item] - count);
  assert.throws(
    () => act(f, 'contract-start', 1000, { id }),
    /already started/,
  );
  assert.throws(
    () => act(f, 'contract-cancel', 1000, { id }),
    /already started/,
  );
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt - 1, { id }),
    /Finish the work/,
  );
  f = act(f, 'contract-claim', run.readyAt, { id });
  assert.equal(f.compute, run.reward);
  assert.equal(f.career.completed.supply, 1);
  assert.ok(!f.career.offers.some((o) => o.id === id));
  // Expired request cache cannot make a consumed contract exist again.
  f.requests = Array.from({ length: 100 }, () => crypto.randomUUID());
  assert.throws(
    () => act(f, 'contract-claim', run.readyAt + 1, { id }),
    /no longer active/,
  );
  assert.ok(validCareer(f.career));
});

test('diagnosis requires observation, a correct repair and server-timed verification', () => {
  let [f, id] = accept(fixture(), 'service', 0);
  f = act(f, 'contract-start', 0, { id });
  const r = f.career.active[0],
    expected = serviceChallenge(r).answer;
  assert.throws(
    () => act(f, 'contract-service', 0, { id, direction: 'Inspect' }),
    /finish first/,
  );
  assert.throws(
    () => act(f, 'contract-service', 3000, { id, direction: expected }),
    /Inspect/,
  );
  f = act(f, 'contract-service', 3000, { id, direction: 'Inspect' });
  const wrong = SERVICE_REPAIRS.find((answer) => answer !== expected);
  const inventory = structuredClone(f.inventory);
  f = act(f, 'contract-service', 6000, { id, direction: wrong });
  assert.equal(f.career.active[0].steps, 1);
  assert.deepEqual(f.inventory, inventory);
  assert.throws(
    () => act(f, 'contract-service', 9999, { id, direction: expected }),
    /finish first/,
  );
  f = act(f, 'contract-service', 10000, { id, direction: expected });
  assert.throws(
    () => act(f, 'contract-claim', 10000, { id }),
    /Finish the work/,
  );
  assert.throws(
    () => act(f, 'contract-service', 10000, { id, direction: 'Test' }),
    /finish first/,
  );
  const end = f.career.active[0].nextStepAt;
  f = act(f, 'contract-service', end, { id, direction: 'Test' });
  f = act(f, 'contract-claim', end, { id });
  assert.equal(f.career.completed.service, 1);
  assert.ok(validCareer(f.career));
});

test('workload output is conserved across clock boundaries, repeated settlement, late claims and cap', () => {
  for (const start of [0, 1, 14999, 15000, 15001, 29999])
    for (const full of [false, true]) {
      let f = fixture();
      f.career.offers.find(
        (o) => contractTemplate(o.template).family === 'workload',
      ).template = 'tiny-model';
      if (full) f.storedCompute = computeTankCapacity(f);
      let id;
      [f, id] = accept(f, 'workload', start);
      f = act(f, 'contract-start', start, { id, rack: 'rack-a' });
      const r = f.career.active[0],
        before = f.storedCompute;
      assert.equal(r.reward, 32 + 4 * 6);
      assert.throws(
        () => act(f, 'compute-upgrade', start, {}),
        /running client workloads/,
      );
      assert.throws(() => act(f, 'build', start, { id: 'rack-a' }), /reserved/);
      const end = r.readyAt;
      // Repeated unrelated actions must not duplicate or erase reservation ticks.
      for (let at = start + 7000; at < end; at += 7000)
        f = act(f, 'contract-track', at, { id });
      assert.equal(
        storedComputeNow(f, end),
        Math.min(computeTankCapacity(f), before + 4 * 6),
      );
      f = act(f, 'contract-claim', end + 30000, { id });
      assert.equal(f.compute, r.reward);
      assert.equal(
        f.storedCompute,
        Math.min(computeTankCapacity(f), before + 4 * 6 + 2 * 12),
      );
      assert.ok(validCareer(f.career));
    }
});

test('module choices alter committed inputs/time; running jobs keep their configuration', () => {
  let f = fixture();
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.loadout = ['fast', 'efficient'];
  const template = contractTemplate('quiet-inference');
  const plain = contractQuote(f, template, 'standard', 'rack-a', 0);
  const efficient = contractQuote(f, template, 'efficient', 'rack-a', 0);
  const fast = contractQuote(f, template, 'fast', 'rack-a', 0);
  assert.ok(efficient.cost.silicon < plain.cost.silicon);
  assert.ok(efficient.duration > plain.duration);
  assert.ok(fast.cost.copper > plain.cost.copper);
  assert.ok(fast.duration < plain.duration);
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  offer.template = template.id;
  f = act(f, 'contract-accept', 0, { id: offer.id });
  assert.throws(
    () =>
      act(f, 'contract-start', 0, {
        id: offer.id,
        rack: 'rack-a',
        direction: 'stable',
      }),
    /Equip/,
  );
  f = act(f, 'contract-start', 0, {
    id: offer.id,
    rack: 'rack-a',
    direction: 'fast',
  });
  const snapshot = structuredClone(f.career.active[0]);
  f = act(f, 'module-equip', 1000, { id: 'stable' });
  assert.deepEqual(f.career.active[0], snapshot);
});

test('off-grid harvest from a full tank cannot change the production phase or overpay a workload', () => {
  for (const harvestAt of [1, 1000, 14000]) {
    let f = fixture();
    f.storedCompute = computeTankCapacity(f);
    const initialTank = f.storedCompute;
    f.career.offers.find(
      (o) => contractTemplate(o.template).family === 'workload',
    ).template = 'tiny-model';
    let id;
    [f, id] = accept(f, 'workload', 0);
    f = act(f, 'contract-start', 0, { id, rack: 'rack-a' });
    f = act(f, 'compute-harvest', harvestAt);
    f = act(f, 'contract-claim', 60000, { id });
    assert.equal(f.compute + f.storedCompute - initialTank, 4 * 12 + 32);
  }
});

test('a fully upgraded player still has renewable offers and cannot purchase qualification', () => {
  let f = fixture(),
    now = 0;
  f.builds = Object.fromEntries(
    'abcdefg'.split('').map((id) => ['rack-' + id, 3]),
  );
  f.computeBoost = 5;
  f.compute = 1000000;
  f.unlocked = [
    'commons',
    'salvage',
    'workshop',
    'thermal',
    'compute',
    'network',
    'core',
  ];
  f.stats.gathered = 50;
  f.stats.crafted = 20;
  const seen = new Set();
  assert.equal(operatorLicense(f.career), false);
  assert.throws(
    () => act(f, 'module-build', now, { id: 'fast' }),
    /Complete 2/,
  );
  for (let i = 0; i < 36; i++) {
    let id;
    [f, id] = accept(f, ['service', 'supply', 'workload'][i % 3], now);
    assert.ok(!seen.has(id));
    seen.add(id);
    f = act(f, 'contract-start', now, { id, rack: 'rack-a' });
    [f, now] = finish(f, id, now);
    assert.equal(f.career.offers.length, 3);
    assert.ok(validCareer(f.career));
    now += 1000;
  }
  f = act(f, 'module-build', now, { id: 'fast' });
  assert.equal(
    operatorLicense(f.career),
    false,
    'Commission a shared cluster to finish the license',
  );
  f.career.commissioned = 1;
  assert.ok(operatorLicense(f.career));
  assert.equal(shiftObjective(f, f.compute, now).panel, 'contracts');
  assert.equal(f.career.completed.service, 12);
  assert.equal(f.career.completed.supply, 12);
  assert.equal(f.career.completed.workload, 12);
});

test('legacy saves retain property and resources while gaining a fresh career', () => {
  const f = newFacility(1000);
  f.inventory = { kit: 4 };
  f.owned.push('mint');
  f.compute = 41000;
  f.builds = { 'rack-a': 3 };
  f.craft = { recipe: 'kit', readyAt: 10000 };
  const before = structuredClone(f),
    upgraded = normalizeFacility(f, 1000);
  for (const key of ['inventory', 'owned', 'compute', 'builds', 'craft'])
    assert.deepEqual(upgraded[key], before[key]);
  assert.ok(validCareer(upgraded.career));
  const invalid = structuredClone(upgraded.career);
  invalid.offers[1].template = invalid.offers[0].template;
  assert.equal(validCareer(invalid), false);
  for (const item of ['kit', 'board', 'battery', 'core'])
    assert.throws(
      () => act(upgraded, 'buy', 1000, { item, quantity: 1 }),
      /Craft equipment/,
    );
});

test('all guidance discards commands; following a direction cannot claim or buy anything', () => {
  for (const type of [
    'build',
    'craft',
    'gather',
    'contract-claim',
    'compute-harvest',
    'unlock',
  ]) {
    const next = {
      title: 'Useful work',
      detail: '',
      cta: 'Do it',
      target: 'rack-a',
      action: { type, id: 'rack-a' },
      repair: 'boot',
    };
    const before = structuredClone(next),
      guide = guidanceFor(next);
    assert.equal(guide.action, undefined);
    assert.equal(guide.repair, undefined);
    assert.equal(guide.target, 'rack-a');
    assert.deepEqual(next, before);
  }
});

test('storage and waiting directions carry presentation context without executable commands', () => {
  for (const direction of ['withdraw', 'deposit']) {
    const step = {
      title: 'Find parts',
      detail: 'Use storage',
      cta: 'Continue',
      target: 'bank',
      action: { type: 'bank', direction, item: 'copper', quantity: 3 },
    };
    const before = structuredClone(step);
    const guide = guidanceFor(step);
    assert.equal(guide.panel, 'inventory');
    assert.deepEqual(guide.view, {
      inventoryTab: direction === 'withdraw' ? 'bank' : 'bag',
      item: 'copper',
    });
    assert.equal(guide.action, undefined);
    assert.deepEqual(step, before);
  }
  const waiting = guidanceFor({
    title: 'Wait for spare parts',
    detail: 'Refilling',
    cta: 'Find parts',
    target: 'scrap-a',
    wait: true,
    action: { type: 'gather', id: 'scrap-a' },
  });
  assert.equal(waiting.target, 'scrap-a');
  assert.equal(waiting.wait, true);
  assert.equal(waiting.cta, 'Show me where');
  assert.equal(waiting.action, undefined);
  const refilling = arrivalGuidance(waiting, 'Spare parts', 12000, 5000);
  assert.match(refilling.detail, /refills in 7s/);
  const ready = arrivalGuidance(waiting, 'Spare parts', 12000, 12000);
  assert.match(ready.detail, /Click Spare parts or press E/);
  assert.equal(ready.action, undefined);
  assert.equal(ready.cta, 'Back to my goal');
});

test('job comparisons separate payment from lost idle output and expose real equipment tradeoffs', () => {
  const f = fixture();
  const template = contractTemplate('tiny-model');
  const standard = jobSetup(f, template, 'standard', 'rack-a', 1000);
  const fast = jobSetup(f, template, 'fast', 'rack-a', 1000);
  assert.equal(fast.fee, template.reward + 24);
  assert.equal(fast.fee + fast.reservedOutput, fast.reward);
  assert.equal(fast.reservedOutput, 0);
  assert.ok(fast.lostIdle > 0);
  assert.equal(fast.secondsSaved, standard.duration - fast.duration);
  assert.ok(fast.secondsSaved > 0);
  assert.deepEqual(fast.materials, [{ item: 'copper', change: 1 }]);
  assert.equal(fast.changesTerms, true);
  assert.equal(
    jobSetup(f, contractTemplate('loose-link'), 'efficient').changesTerms,
    false,
  );
  const before = structuredClone(f);
  // A whole pump cannot be reduced by a raw-material saving module.
  assert.ok(
    usefulStyles(f, contractTemplate('cooling-call', 1)).includes('efficient'),
  );
  assert.ok(
    !usefulStyles(f, contractTemplate('cooling-call')).includes('efficient'),
  );
  assert.ok(
    usefulStyles(f, contractTemplate('cooling-call')).includes('stable'),
  );
  assert.deepEqual(f, before);
});

test('unavailable draft equipment and machines cannot silently switch to another selection', () => {
  const f = fixture();
  f.career.modules = ['fast'];
  f.career.loadout = [];
  assert.deepEqual(jobSelection(f, 'fast', 'rack-g'), {
    style: 'fast',
    styleAvailable: false,
    rack: undefined,
  });
  assert.equal(jobSelection(f, 'standard', '').rack, undefined);
  f.career.loadout = ['fast'];
  assert.deepEqual(jobSelection(f, 'fast', 'rack-b'), {
    style: 'fast',
    styleAvailable: true,
    rack: 'rack-b',
  });
  const [accepted, id] = accept(f, 'workload', 0);
  const running = act(accepted, 'contract-start', 0, {
    id,
    rack: 'rack-b',
    direction: 'fast',
  });
  assert.equal(jobSelection(running, 'fast', 'rack-b').rack, undefined);
  assert.equal(jobSelection(running, 'fast', 'rack-a').rack, 'rack-a');
});

test('career directions adapt to unlocked equipment and report shortages without modifying saves', () => {
  const f = fixture();
  f.stats.gathered = 5;
  f.stats.crafted = 2;
  f.career.completed = { service: 2, supply: 0, workload: 0 };
  assert.equal(shiftObjective(f, f.compute, 0).view.jobsTab, 'equipment');
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.completed = { service: 8, supply: 8, workload: 8 };
  f.career.projectUsed = { service: 8, supply: 6, workload: 6 };
  assert.equal(careerSuggestions(f, f.compute, true)[0].view.family, 'service');
  f.career.projectUsed.service = 7;
  assert.equal(shiftObjective(f, f.compute, 0, true).panel, 'project');
  assert.ok(
    careerSuggestions(f, f.compute).every((goal) => goal.panel !== 'project'),
  );
  const before = structuredClone(f);
  for (const goal of careerSuggestions(f, f.compute)) {
    assert.equal(goal.action, undefined);
    assert.equal(goal.repair, undefined);
    if (goal.view?.style) {
      const offer = f.career.offers.find(
        (o) => contractTemplate(o.template).family === goal.view.family,
      );
      assert.ok(
        usefulStyles(f, contractTemplate(offer.template)).includes(
          goal.view.style,
        ),
      );
    }
  }
  assert.deepEqual(f, before);
  assert.ok(careerSuggestions(f, f.compute).length <= 3);
});

test('completed mastery retains all saved stamps and still offers renewable work', () => {
  const f = fixture();
  f.stats.gathered = f.stats.crafted = 50;
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.completed = { service: 20, supply: 20, workload: 20 };
  f.career.projectUsed = { service: 20, supply: 20, workload: 20 };
  f.career.mastery = Object.fromEntries(
    CONTRACT_TEMPLATES.map((t) => [t.id, { fast: 1, efficient: 1, stable: 1 }]),
  );
  const before = structuredClone(f);
  const suggestions = careerSuggestions(f, f.compute, true);
  assert.equal(suggestions.length, 3);
  assert.ok(
    suggestions.every((goal) => goal.panel === 'contracts' && !goal.view.style),
  );
  assert.notEqual(
    shiftObjective(f, f.compute, 0).title,
    'Choose your next job',
  );
  assert.equal(masteryStamps(f.career), 36);
  assert.deepEqual(f, before);
});

test('service diagnosis and verification resolve the physical job site for server authority', () => {
  const [f, id] = accept(fixture(), 'service', 0);
  const target = contractTemplate(f.career.active[0].template).target;
  for (const type of ['contract-start', 'contract-service'])
    assert.equal(actionWorksite(f, { type, id }).id, target);
  assert.equal(actionWorksite(f, { type: 'contract-claim', id }), undefined);
});

test('only a claimed job mints style proof, using its committed equipment rather than the current loadout', () => {
  let f = fixture();
  f.career.modules = ['fast', 'efficient', 'stable'];
  f.career.loadout = ['fast', 'efficient'];
  let id;
  [f, id] = accept(f, 'workload', 0);
  f = act(f, 'contract-start', 0, { id, rack: 'rack-a', direction: 'fast' });
  assert.equal(reportsAvailable(f.career, 'workload', 'fast'), 0);
  f = act(f, 'module-equip', 1000, { id: 'stable' });
  assert.ok(!f.career.loadout.includes('fast'));
  [f] = finish(f, id, 1000);
  assert.deepEqual(f.career.reportStyles, { workload: { fast: 1 } });
  assert.equal(reportsAvailable(f.career, 'workload'), 1);
  assert.equal(reportsAvailable(f.career, 'workload', 'efficient'), 0);
  assert.ok(validCareer(f.career));
  assert.throws(
    () => act(f, 'contract-claim', 100000, { id }),
    /no longer active/,
  );
  assert.equal(reportsAvailable(f.career, 'workload', 'fast'), 1);
});

test('old completed jobs remain generic reports without backfilling proof from mastery or owned equipment', () => {
  const f = fixture();
  f.career.completed.workload = 4;
  f.career.projectUsed = { service: 0, supply: 0, workload: 1 };
  f.career.modules = ['fast'];
  f.career.loadout = ['fast'];
  f.career.mastery = { 'tiny-model': { fast: 4 } };
  const migrated = normalizeFacility(f, 1000).career;
  assert.equal(reportsAvailable(migrated, 'workload'), 3);
  assert.equal(reportsAvailable(migrated, 'workload', 'fast'), 0);
  const before = structuredClone(migrated);
  assert.equal(consumeProjectReport(migrated, 'workload', 'fast'), false);
  assert.deepEqual(migrated, before);
  assert.equal(previewProjectReport(migrated, 'workload'), 'legacy');
  assert.equal(consumeProjectReport(migrated, 'workload'), true);
  assert.equal(reportsAvailable(migrated, 'workload'), 2);
  assert.equal(migrated.reportStyles, undefined);
  assert.equal(migrated.projectUsedStyles, undefined);
  assert.ok(validCareer(migrated));
});

test('generic and specialized contributions conserve one shared pool through mixed consumption and reloads', () => {
  let f = fixture();
  f.career.completed.workload = 8;
  f.career.projectUsed = { service: 0, supply: 0, workload: 2 };
  f.career.reportStyles = {
    workload: { standard: 1, efficient: 1, fast: 2, stable: 1 },
  };
  assert.ok(validCareer(f.career));
  const spend = (expected, required) => {
    const before = reportsAvailable(f.career, 'workload');
    assert.equal(
      previewProjectReport(f.career, 'workload', required),
      expected,
    );
    assert.equal(consumeProjectReport(f.career, 'workload', required), true);
    assert.equal(reportsAvailable(f.career, 'workload'), before - 1);
    assert.ok(validCareer(f.career));
    f = normalizeFacility(JSON.parse(JSON.stringify(f)), 1000);
    assert.ok(validCareer(f.career));
  };
  spend('legacy');
  assert.equal(reportsAvailable(f.career, 'workload', 'fast'), 2);
  spend('standard');
  spend('efficient');
  spend('fast', 'fast');
  spend('stable', 'stable');
  spend('fast');
  assert.equal(reportsAvailable(f.career, 'workload'), 0);
  for (const style of [undefined, 'standard', 'efficient', 'fast', 'stable']) {
    const before = structuredClone(f.career);
    assert.equal(previewProjectReport(f.career, 'workload', style), null);
    assert.equal(consumeProjectReport(f.career, 'workload', style), false);
    assert.deepEqual(f.career, before);
  }
  assert.equal(f.career.projectUsed.workload, 8);
  assert.deepEqual(f.career.projectUsedStyles.workload, {
    standard: 1,
    efficient: 1,
    fast: 2,
    stable: 1,
  });
});

test('GPU projects require three distinct equipment proofs while saved variants keep their original terms', () => {
  assert.deepEqual(
    projectVariantsFor('commons').map((v) => v.id),
    ['balanced'],
  );
  assert.deepEqual(
    projectVariantsFor('gpu').map((v) => v.id),
    ['balanced', 'gpu-launch', 'gpu-stability', 'gpu-efficiency'],
  );
  for (const [variant, family, style] of [
    ['gpu-launch', 'workload', 'fast'],
    ['gpu-stability', 'service', 'stable'],
    ['gpu-efficiency', 'supply', 'efficient'],
  ]) {
    assert.equal(projectReportStyle(variant, family), style);
    for (const other of ['service', 'supply', 'workload'].filter(
      (f) => f !== family,
    ))
      assert.equal(projectReportStyle(variant, other), undefined);
  }
  for (const old of ['balanced', 'rapid', 'quiet'])
    for (const family of ['service', 'supply', 'workload'])
      assert.equal(projectReportStyle(old, family), undefined);
  const career = fixture().career;
  career.projectDiscoveries = [
    'balanced',
    'rapid',
    'quiet',
    'gpu-launch',
    'gpu-stability',
    'gpu-efficiency',
  ];
  assert.ok(validCareer(career));
});

test('typed report save validation rejects invented, overspent or double-counted pools', () => {
  const career = fixture().career;
  career.completed = { service: 3, supply: 4, workload: 8 };
  career.projectUsed = { service: 1, supply: 0, workload: 2 };
  career.reportStyles = {
    service: { stable: 1 },
    workload: { fast: 2, efficient: 2 },
  };
  career.projectUsedStyles = { workload: { fast: 1 } };
  assert.ok(validCareer(career));
  for (const mutate of [
    (c) => {
      c.reportStyles.workload.fast = 9;
    },
    (c) => {
      c.projectUsedStyles.workload.fast = 3;
    },
    (c) => {
      c.projectUsed.workload = 0;
    },
    (c) => {
      c.projectUsed.workload = 8;
    },
    (c) => {
      c.reportStyles.unknown = { fast: 1 };
    },
    (c) => {
      c.reportStyles.workload.unknown = 1;
    },
    (c) => {
      c.projectUsedStyles.workload.efficient = -1;
    },
    (c) => {
      c.reportStyles.service.stable = 0.5;
    },
    (c) => {
      c.reportStyles = [];
    },
    (c) => {
      c.reportStyles = null;
    },
    (c) => {
      c.projectUsedStyles.workload = [];
    },
    (c) => {
      c.reportStyles.workload.fast = Number.MAX_SAFE_INTEGER + 1;
    },
  ]) {
    const invalid = structuredClone(career);
    mutate(invalid);
    assert.equal(validCareer(invalid), false);
  }
});

const ticketA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:0';
const ticketB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:1';
function dispatchFixture() {
  const f = fixture();
  f.career.completed = { service: 10, supply: 10, workload: 10 };
  f.unlocked = [
    'commons',
    'salvage',
    'workshop',
    'thermal',
    'compute',
    'network',
    'core',
  ];
  f.skills.engineering = 1000;
  f.career.dispatchChoices = { workload: [ticketA, ticketB] };
  f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  ).template = 'tiny-model';
  return f;
}

test('job choice acceptance keeps IDs and serial; cancel retains replacement and never refunds', () => {
  let f = dispatchFixture();
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  const other = structuredClone(
    f.career.offers.filter((o) => o.id !== offer.id),
  );
  const serial = f.career.serial;
  const action = {
    id: offer.id,
    template: 'render-rush',
    dispatchTicket: ticketA,
    requestId: crypto.randomUUID(),
  };
  f = act(f, 'contract-accept', 10, action);
  assert.equal(f.career.active[0].template, 'render-rush');
  assert.equal(
    f.career.active[0].duration,
    contractTemplate('render-rush').seconds,
  );
  assert.deepEqual(f.career.dispatchChoices.workload, [ticketB]);
  assert.equal(f.career.serial, serial);
  assert.deepEqual(
    f.career.offers.filter((o) => o.id !== offer.id),
    other,
  );
  f = act(f, 'contract-cancel', 11, { id: offer.id });
  assert.equal(
    f.career.offers.find((o) => o.id === offer.id).template,
    'render-rush',
  );
  assert.deepEqual(f.career.dispatchChoices.workload, [ticketB]);
  f = act(f, 'contract-accept', 12, {
    id: offer.id,
    template: 'tiny-model',
    dispatchTicket: ticketB,
  });
  f = act(f, 'contract-cancel', 13, { id: offer.id });
  f.requests = Array.from({ length: 100 }, () => crypto.randomUUID());
  const before = structuredClone(f);
  assert.throws(
    () => act(f, 'contract-accept', 14, action),
    /already been used/,
  );
  assert.deepEqual(f, before);
  assert.ok(validCareer(f.career));
});

test('invalid job replacements never spend a choice or change the facility', () => {
  const base = dispatchFixture();
  const offer = base.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  for (const extra of [
    { template: 'render-rush' },
    { dispatchTicket: ticketA },
    { template: null, dispatchTicket: ticketA },
    { template: 'render-rush', dispatchTicket: ticketA.slice(0, -1) + '1' },
    { template: offer.template, dispatchTicket: ticketA },
    { template: 'loose-link', dispatchTicket: ticketA },
    { template: 'not-a-job', dispatchTicket: ticketA },
  ]) {
    const f = structuredClone(base);
    assert.throws(() =>
      act(f, 'contract-accept', 10, { id: offer.id, ...extra }),
    );
    assert.deepEqual(f, base);
  }
  for (const change of [
    (f) => {
      f.builds = {};
    },
    (f) => {
      f.career.completed = { service: 0, supply: 0, workload: 0 };
    },
    (f) => {
      f.career.dispatchChoices = { service: [ticketA] };
    },
  ]) {
    const f = structuredClone(base);
    change(f);
    const before = structuredClone(f);
    assert.throws(() =>
      act(f, 'contract-accept', 10, {
        id: offer.id,
        template: 'wobbly-training',
        dispatchTicket: ticketA,
      }),
    );
    assert.deepEqual(f, before);
  }
  for (const [family, template, mutate] of [
    [
      'service',
      'cooling-call',
      (f) => {
        f.unlocked = ['commons'];
      },
    ],
    [
      'supply',
      'field-stock',
      (f) => {
        f.skills.engineering = 0;
      },
    ],
  ]) {
    const f = structuredClone(base);
    mutate(f);
    f.career.dispatchChoices = { [family]: [ticketA] };
    const id = f.career.offers.find(
      (o) => contractTemplate(o.template).family === family,
    ).id;
    const before = structuredClone(f);
    assert.throws(() =>
      act(f, 'contract-accept', 10, { id, template, dispatchTicket: ticketA }),
    );
    assert.deepEqual(f, before);
  }
  let f = base;
  [f] = accept(f, 'service', 1);
  [f] = accept(f, 'supply', 2);
  const full = structuredClone(f);
  assert.throws(
    () =>
      act(f, 'contract-accept', 10, {
        id: offer.id,
        template: 'render-rush',
        dispatchTicket: ticketA,
      }),
    /before accepting/,
  );
  assert.deepEqual(f, full);
});

test('job choice validation preserves missing old data and rejects malformed or duplicated tickets', () => {
  const c = fixture().career;
  assert.ok(validCareer(c));
  for (const choices of [
    null,
    [],
    { unknown: [] },
    { service: 'oops' },
    { workload: [ticketA, ticketB, ticketA] },
    { service: [ticketA], workload: [ticketA] },
    { workload: ['arbitrary'] },
    { workload: [42] },
  ])
    assert.equal(
      validCareer({ ...c, dispatchChoices: choices }),
      false,
      JSON.stringify(choices),
    );
  assert.ok(
    validCareer({
      ...c,
      dispatchChoices: { service: [ticketA], workload: [ticketB] },
    }),
  );
});
