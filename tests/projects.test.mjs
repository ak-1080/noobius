import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { applyFacility, ITEMS, newFacility } from '../lib/facility.ts';
import {
  careerFor,
  contractTemplate,
  operatorLicense,
  serviceChallenge,
  validCareer,
} from '../lib/contracts.ts';
import {
  joinNeighborhood,
  syncNeighborhood,
  leaveNeighborhood,
} from '../lib/neighborhoods-server.ts';
import {
  startProject,
  contributeProject,
  claimProject,
  projectSnapshot,
} from '../lib/projects-server.ts';
async function fixture(count = 1) {
  const db = database(),
    crew = [];
  for (let i = 0; i < count; i++) {
    const wallet = '0x' + String(i + 1).padStart(40, '0'),
      clientId = crypto.randomUUID(),
      f = newFacility(0);
    f.inventory = { kit: 20, board: 20, copper: 100, silicon: 100 };
    f.career = careerFor(f);
    f.career.completed = { service: 10, supply: 10, workload: 10 };
    f.career.modules = ['fast'];
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state) VALUES (?,?,?,?)',
      )
      .run(wallet, `Tech ${i + 1}`, 0, JSON.stringify(f));
    const m = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      {},
      1000,
    );
    const controller = { clientId, generation: m.generation };
    await syncNeighborhood(db, wallet, controller, 1, { x: -2, z: 11 }, 3000);
    crew.push({ wallet, controller });
  }
  return { db, crew };
}
const contribution = (db, p, id, family, request = crypto.randomUUID()) =>
  contributeProject(db, p.wallet, p.controller, id, family, request, 4000);
const facility = (db, p) =>
  JSON.parse(
    db.sqlite
      .prepare('SELECT facility_state FROM players WHERE wallet=?')
      .get(p.wallet).facility_state,
  );

function saveFacility(db, p, f) {
  db.sqlite
    .prepare(
      'UPDATE players SET facility_state=?,facility_version=?,credits=? WHERE wallet=?',
    )
    .run(JSON.stringify(f), f.version, f.compute, p.wallet);
}

// Mint typed proof through actual job actions, including timing and the repair
// choices. Starting with enough parts/modules isolates project integration.
function finishJob(
  f,
  family,
  style,
  changeEquippedStyle = false,
  startAt = 5000,
) {
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 100]));
  f.builds = { 'rack-a': 1, 'rack-b': 1 };
  f.career.modules = ['fast', 'stable', 'efficient'];
  f.career.loadout = style === 'standard' ? [] : [style];
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === family,
  );
  assert.ok(offer, `fixture has a ${family} job`);
  const id = offer.id;
  const act = (type, now, extra = {}) => {
    f = applyFacility(
      f,
      { type, id, requestId: crypto.randomUUID(), ...extra },
      f.compute,
      now,
    ).facility;
  };
  act('contract-accept', startAt);
  act('contract-start', startAt + 100, { direction: style, rack: 'rack-a' });
  if (changeEquippedStyle) {
    act('module-equip', startAt + 200, { id: style });
    act('module-equip', startAt + 300, {
      id: style === 'fast' ? 'stable' : 'fast',
    });
    assert.ok(!f.career.loadout.includes(style));
    assert.equal(f.career.active.find((r) => r.id === id).style, style);
  }
  let run = f.career.active.find((r) => r.id === id);
  if (family === 'service') {
    act('contract-service', run.nextStepAt, { direction: 'Inspect' });
    run = f.career.active.find((r) => r.id === id);
    act('contract-service', run.nextStepAt, {
      direction: serviceChallenge(run).answer,
    });
    run = f.career.active.find((r) => r.id === id);
    act('contract-service', run.nextStepAt, { direction: 'Test' });
    act('contract-claim', run.nextStepAt);
  } else act('contract-claim', run.readyAt);
  assert.ok(validCareer(f.career));
  return f;
}

const gpuNow = 1000000;
const gpuPermit = { policy: 'project-sql-test-policy', localTest: false };
async function enterGpu(db, p) {
  const clock = Date.now();
  db.sqlite
    .prepare(`INSERT OR REPLACE INTO realm_entitlements
    (wallet,policy,amount,block,status,checked_at,next_check_at,grace_until)
    VALUES (?,?,?,'0x100','eligible',?,?,?)`)
    .run(
      p.wallet,
      gpuPermit.policy,
      '888',
      clock,
      clock + 60000,
      clock + 120000,
    );
  const membership = await joinNeighborhood(
    db,
    p.wallet,
    'gpu',
    0,
    p.controller.clientId,
    { permit: gpuPermit },
    gpuNow,
  );
  p.controller = {
    clientId: p.controller.clientId,
    generation: membership.generation,
  };
  await syncNeighborhood(
    db,
    p.wallet,
    p.controller,
    1,
    { x: -2, z: 11 },
    gpuNow + 2000,
    gpuPermit,
  );
  return membership;
}

const gpuContribution = (db, p, id, family, request = crypto.randomUUID()) =>
  contributeProject(
    db,
    p.wallet,
    p.controller,
    id,
    family,
    request,
    gpuNow + 3000,
    gpuPermit,
  );

test('a solo cluster consumes earned work and parts; completed rewards survive leaving and pay once', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const started = await startProject(
      db,
      p.wallet,
      p.controller,
      'balanced',
      3100,
    ),
    id = started.project.id;
  assert.deepEqual(started.project.required, {
    service: 1,
    supply: 1,
    workload: 1,
  });
  const first = crypto.randomUUID();
  await contribution(db, p, id, 'service', first);
  await contribution(db, p, id, 'service', first);
  assert.equal(facility(db, p).inventory.kit, 19);
  await contribution(db, p, id, 'supply');
  await contribution(db, p, id, 'workload');
  assert.equal(
    (await projectSnapshot(db, p.wallet, 4100)).project.state,
    'completed',
  );
  await leaveNeighborhood(db, p.wallet, p.controller);
  const claimed = await claimProject(db, p.wallet, id, 4200);
  assert.deepEqual(claimed, { compute: 300, reputation: 60 });
  await assert.rejects(
    claimProject(db, p.wallet, id, 4300),
    /already collected/,
  );
  const f = facility(db, p);
  assert.equal(f.career.commissioned, 1);
  assert.equal(operatorLicense(f.career), true);
  assert.equal(validCareer(f.career), true);
  assert.equal(
    db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get(p.wallet).credits,
    300,
  );
});

test('five-person work is fixed; a racing last contribution cannot consume two players parts', async () => {
  const { db, crew } = await fixture(5),
    p = crew[0];
  const id = (await startProject(db, p.wallet, p.controller, 'balanced', 3100))
    .project.id;
  assert.equal((await projectSnapshot(db, p.wallet, 3200)).project.scale, 3);
  for (const family of ['service', 'supply', 'workload'])
    for (let i = 0; i < (family === 'workload' ? 2 : 3); i++)
      await contribution(db, crew[i], id, family);
  const before = crew.slice(3).map((p) => facility(db, p));
  const race = await Promise.allSettled(
    crew.slice(3).map((p) => contribution(db, p, id, 'workload')),
  );
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  const after = crew.slice(3).map((p) => facility(db, p));
  assert.equal(
    before.reduce((n, f) => n + f.inventory.copper, 0) -
      after.reduce((n, f) => n + f.inventory.copper, 0),
    3,
  );
  const claimed = await Promise.allSettled([
    claimProject(db, p.wallet, id, 5000),
    claimProject(db, p.wallet, id, 5000),
  ]);
  assert.equal(claimed.filter((r) => r.status === 'fulfilled').length, 1);
});

test('missing work, missing components, distance and noncontributors cannot obtain project credit', async () => {
  const {
    db,
    crew: [p, other],
  } = await fixture(2);
  const id = (await startProject(db, p.wallet, p.controller, 'balanced', 3100))
    .project.id;
  const f = facility(db, p);
  f.career.completed.service = 0;
  db.sqlite
    .prepare('UPDATE players SET facility_state=? WHERE wallet=?')
    .run(JSON.stringify(f), p.wallet);
  await assert.rejects(contribution(db, p, id, 'service'), /Finish a service/);
  f.career.completed.service = 10;
  f.inventory.kit = 0;
  db.sqlite
    .prepare('UPDATE players SET facility_state=? WHERE wallet=?')
    .run(JSON.stringify(f), p.wallet);
  await assert.rejects(
    contribution(db, p, id, 'service'),
    /missing components/,
  );
  for (const family of ['service', 'supply', 'workload'])
    await contribution(db, other, id, family);
  await assert.rejects(claimProject(db, p.wallet, id, 5000), /Contribute/);
  const next = await startProject(
    db,
    other.wallet,
    other.controller,
    'balanced',
    5100,
  );
  assert.notEqual(next.project.id, id);
  assert.equal(
    (await projectSnapshot(db, other.wallet, 5200)).history[0].claimed,
    false,
  );
  await claimProject(db, other.wallet, id, 5300);
  await assert.rejects(
    startProject(db, p.wallet, p.controller, 'rapid', 5400),
    /available in this realm/,
  );
});

test('newer projects cannot hide an older unclaimed completion; rewards count toward daily work', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const project = (
    await startProject(db, p.wallet, p.controller, 'balanced', 3100)
  ).project;
  for (const family of ['service', 'supply', 'workload'])
    await contribution(db, p, project.id, family);
  for (let i = 0; i < 35; i++) {
    const id = crypto.randomUUID();
    db.sqlite
      .prepare(
        "INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,version,created_at,completed_at) VALUES (?,?,'balanced','completed',1,?,?,1,?,?)",
      )
      .run(
        id,
        project.neighborhoodId,
        JSON.stringify(project.required),
        JSON.stringify(project.required),
        6000 + i,
        6000 + i,
      );
    db.sqlite
      .prepare(
        "INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (?,?,?,'service',1,?)",
      )
      .run(crypto.randomUUID(), id, p.wallet, 6000 + i);
    db.sqlite
      .prepare(
        'INSERT INTO cluster_claims(id,project_id,wallet,compute,reputation,created_at) VALUES (?,?,?,100,20,?)',
      )
      .run(crypto.randomUUID(), id, p.wallet, 7000 + i);
  }
  const history = (await projectSnapshot(db, p.wallet, 8000)).history;
  assert.equal(history[0].id, project.id);
  assert.equal(history[0].claimed, false);
  await claimProject(db, p.wallet, project.id, 8100);
  assert.equal(facility(db, p).daily.computeEarned, 300);
});

for (const [variant, family, style] of [
  ['gpu-launch', 'workload', 'fast'],
  ['gpu-stability', 'service', 'stable'],
  ['gpu-efficiency', 'supply', 'efficient'],
]) {
  test(`${variant} needs a completed ${style} ${family} job, not a module or generic work`, async () => {
    const {
      db,
      crew: [p],
    } = await fixture();
    await assert.rejects(
      startProject(db, p.wallet, p.controller, variant, 3100),
      /available in this realm/,
    );
    await enterGpu(db, p);
    const project = (
      await startProject(
        db,
        p.wallet,
        p.controller,
        variant,
        gpuNow + 2100,
        gpuPermit,
      )
    ).project;
    assert.equal(project.required[family], 2);
    let f = facility(db, p);
    f.career.modules = ['fast', 'stable', 'efficient'];
    f.career.loadout = [style];
    saveFacility(db, p, f);
    const expected = new RegExp(
      `Finish a ${style[0].toUpperCase() + style.slice(1)} ${family}`,
    );
    await assert.rejects(gpuContribution(db, p, project.id, family), expected);
    assert.deepEqual(facility(db, p), f);
    f = finishJob(f, family, 'standard');
    saveFacility(db, p, f);
    await assert.rejects(gpuContribution(db, p, project.id, family), expected);
    assert.deepEqual(facility(db, p), f);
    f = finishJob(f, family, style, true, 200000);
    saveFacility(db, p, f);
    const request = crypto.randomUUID();
    await gpuContribution(db, p, project.id, family, request);
    const saved = facility(db, p);
    assert.equal(saved.career.projectUsed[family], 1);
    assert.equal(saved.career.projectUsedStyles[family][style], 1);
    assert.ok(!saved.career.loadout.includes(style));
    assert.ok(validCareer(saved.career));
    await gpuContribution(db, p, project.id, family, request);
    assert.deepEqual(facility(db, p), saved);
    await assert.rejects(gpuContribution(db, p, project.id, family), expected);
    assert.deepEqual(facility(db, p), saved);
    assert.equal(
      (await projectSnapshot(db, p.wallet, gpuNow + 3100)).project.progress[
        family
      ],
      1,
    );
  });
}

test('legacy GPU project IDs and frozen requirements remain finishable with legacy reports', async () => {
  for (const variant of ['rapid', 'quiet']) {
    const {
      db,
      crew: [p],
    } = await fixture();
    const membership = await enterGpu(db, p);
    await assert.rejects(
      startProject(
        db,
        p.wallet,
        p.controller,
        variant,
        gpuNow + 2100,
        gpuPermit,
      ),
      /available in this realm/,
    );
    const id = crypto.randomUUID();
    const required = { service: 2, supply: 1, workload: 1 };
    const requiredJson = JSON.stringify(required);
    db.sqlite
      .prepare(`INSERT INTO cluster_projects
      (id,neighborhood_id,variant,state,scale,required_json,progress_json,created_at)
      VALUES (?,?,?,'open',3,?,?,?)`)
      .run(
        id,
        membership.neighborhoodId,
        variant,
        requiredJson,
        JSON.stringify({ service: 0, supply: 0, workload: 0 }),
        gpuNow + 2000,
      );
    const current = (
      await startProject(
        db,
        p.wallet,
        p.controller,
        'gpu-efficiency',
        gpuNow + 2200,
        gpuPermit,
      )
    ).project;
    assert.equal(current.id, id);
    assert.equal(current.variant, variant);
    assert.equal(current.scale, 3);
    assert.deepEqual(current.required, required);
    for (const [family, units] of Object.entries(required))
      for (let i = 0; i < units; i++) await gpuContribution(db, p, id, family);
    assert.equal(
      db.sqlite
        .prepare('SELECT required_json FROM cluster_projects WHERE id=?')
        .get(id).required_json,
      requiredJson,
    );
    assert.deepEqual(await claimProject(db, p.wallet, id, gpuNow + 4000), {
      compute: 400,
      reputation: 80,
    });
    assert.ok(validCareer(facility(db, p).career));
  }
});

test('a typed report spent on a Commons project cannot be reused in GPU District', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  let f = facility(db, p);
  f.career.completed.workload = 0;
  f = finishJob(f, 'workload', 'fast');
  saveFacility(db, p, f);
  const project = (
    await startProject(db, p.wallet, p.controller, 'balanced', 3100)
  ).project;
  for (const family of ['service', 'supply', 'workload'])
    await contribution(db, p, project.id, family);
  const used = facility(db, p);
  assert.equal(used.career.completed.workload, 1);
  assert.equal(used.career.projectUsed.workload, 1);
  assert.equal(used.career.projectUsedStyles.workload.fast, 1);
  await enterGpu(db, p);
  const gpu = (
    await startProject(
      db,
      p.wallet,
      p.controller,
      'gpu-launch',
      gpuNow + 2100,
      gpuPermit,
    )
  ).project;
  const before = facility(db, p);
  await assert.rejects(
    gpuContribution(db, p, gpu.id, 'workload'),
    /Finish a Fast workload/,
  );
  assert.deepEqual(facility(db, p), before);
});

test('the last GPU contribution races atomically across reports, components and project progress', async () => {
  const { db, crew } = await fixture(2);
  for (const p of crew) {
    let f = finishJob(facility(db, p), 'workload', 'fast');
    f = finishJob(f, 'workload', 'fast', false, 200000);
    saveFacility(db, p, f);
    await enterGpu(db, p);
  }
  const project = (
    await startProject(
      db,
      crew[0].wallet,
      crew[0].controller,
      'gpu-launch',
      gpuNow + 2100,
      gpuPermit,
    )
  ).project;
  await gpuContribution(db, crew[0], project.id, 'workload');
  const before = crew.map((p) => facility(db, p));
  const race = await Promise.allSettled(
    crew.map((p) => gpuContribution(db, p, project.id, 'workload')),
  );
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  const after = crew.map((p) => facility(db, p));
  const totalUsed = (values) =>
    values.reduce(
      (n, f) => n + (f.career.projectUsedStyles?.workload?.fast ?? 0),
      0,
    );
  assert.equal(totalUsed(after) - totalUsed(before), 1);
  assert.equal(
    before.reduce((n, f) => n + f.inventory.copper, 0) -
      after.reduce((n, f) => n + f.inventory.copper, 0),
    3,
  );
  for (let i = 0; i < race.length; i++)
    if (race[i].status === 'rejected') assert.deepEqual(after[i], before[i]);
  assert.equal(
    (await projectSnapshot(db, crew[0].wallet, gpuNow + 3100)).project.progress
      .workload,
    2,
  );
});

test('GPU holder revocation and account-version races preserve typed proof and parts at commit', async () => {
  for (const race of ['holder', 'account']) {
    const {
      db,
      crew: [p],
    } = await fixture();
    saveFacility(db, p, finishJob(facility(db, p), 'workload', 'fast'));
    await enterGpu(db, p);
    const project = (
      await startProject(
        db,
        p.wallet,
        p.controller,
        'gpu-launch',
        gpuNow + 2100,
        gpuPermit,
      )
    ).project;
    const before = facility(db, p);
    const originalBatch = db.batch.bind(db);
    db.batch = async (statements) => {
      if (race === 'holder')
        db.sqlite
          .prepare(
            "UPDATE realm_entitlements SET status='ineligible',grace_until=0 WHERE wallet=?",
          )
          .run(p.wallet);
      else
        db.sqlite
          .prepare(
            'UPDATE players SET facility_version=facility_version+1 WHERE wallet=?',
          )
          .run(p.wallet);
      return originalBatch(statements);
    };
    await assert.rejects(
      gpuContribution(db, p, project.id, 'workload'),
      /Refresh/,
    );
    assert.deepEqual(facility(db, p), before);
    assert.equal(
      db.sqlite
        .prepare(
          'SELECT count(*) AS n FROM cluster_contributions WHERE project_id=?',
        )
        .get(project.id).n,
      0,
    );
    assert.equal(
      (await projectSnapshot(db, p.wallet, gpuNow + 3100)).project.progress
        .workload,
      0,
    );
  }
});
