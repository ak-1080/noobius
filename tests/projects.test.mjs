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
  startProject as createProject,
  contributeProject,
  claimProject,
  projectSnapshot,
} from '../lib/projects-server.ts';
// These cases preserve pre-commissioning projects and their report/dispatch terms.
// New project activity, capacity and concurrency are covered in commissioning.test.mjs.
async function startProject(...args) {
  const result = await createProject(...args);
  args[0].sqlite
    .prepare('UPDATE cluster_projects SET work_version=0 WHERE id=?')
    .run(result.project.id);
  result.project.workVersion = 0;
  return result;
}
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

void test('a solo cluster consumes earned work and parts; completed rewards survive leaving and pay once', async () => {
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

void test('five-person work is fixed; a racing last contribution cannot consume two players parts', async () => {
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

void test('missing work, missing components, distance and noncontributors cannot obtain project credit', async () => {
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

void test('newer projects cannot hide an older unclaimed completion; rewards count toward daily work', async () => {
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

function seedHistoryBuild(
  db,
  p,
  {
    id = crypto.randomUUID(),
    neighborhoodId,
    state = 'completed',
    claimed = false,
    time = 6000,
    workVersion = 0,
  },
) {
  db.sqlite
    .prepare(
      "INSERT OR IGNORE INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (?,'commons',0,?)",
    )
    .run(neighborhoodId, time);
  const required = { service: 1, supply: 1, workload: 1 };
  const progress =
    state === 'completed' ? required : { service: 0, supply: 1, workload: 0 };
  db.sqlite
    .prepare(
      "INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,work_version,version,created_at,completed_at) VALUES (?,?,'balanced',?,1,?,?,?,1,?,?)",
    )
    .run(
      id,
      neighborhoodId,
      state,
      JSON.stringify(required),
      JSON.stringify(progress),
      workVersion,
      time,
      state === 'completed' ? time : null,
    );
  db.sqlite
    .prepare(
      "INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (?,?,?,'supply',1,?)",
    )
    .run(crypto.randomUUID(), id, p.wallet, time);
  if (claimed)
    db.sqlite
      .prepare(
        'INSERT INTO cluster_claims(id,project_id,wallet,compute,reputation,created_at) VALUES (?,?,?,100,20,?)',
      )
      .run(crypto.randomUUID(), id, p.wallet, time);
  return { id, neighborhoodId, state, claimed, time };
}

function seedPendingHistoryWork(db, p, projectId, readyAt) {
  const id = crypto.randomUUID();
  const work = {
    id,
    projectId,
    version: 1,
    rack: 'rack-a',
    capacity: 1,
    startedAt: 0,
    readyAt,
    duration: readyAt / 1000,
    pausedOutput: 6,
  };
  db.sqlite
    .prepare('UPDATE cluster_projects SET progress_json=? WHERE id=?')
    .run(JSON.stringify({ service: 1, supply: 1, workload: 0 }), projectId);
  db.sqlite
    .prepare(
      "INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at,state,ready_at,work_json) VALUES (?,?,?,'workload',1,0,'pending',?,?)",
    )
    .run(id, projectId, p.wallet, readyAt, JSON.stringify(work));
  return id;
}

void test('large unfinished histories skip per-project reads until work is due, including older pages', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const prepare = db.prepare.bind(db);
  let reads = 0;
  db.prepare = (sql) => {
    reads++;
    return prepare(sql);
  };
  await projectSnapshot(db, p.wallet, 20000);
  const baseline = reads;
  for (let i = 1; i <= 90; i++) {
    const project = seedHistoryBuild(db, p, {
      neighborhoodId: i.toString(16).padStart(32, '0'),
      state: 'open',
      workVersion: i <= 30 ? 0 : 1,
      time: 4000 + i,
    });
    if (i <= 30) seedPendingHistoryWork(db, p, project.id, 1000);
    if (i > 60) seedPendingHistoryWork(db, p, project.id, 100000);
  }
  const older = seedHistoryBuild(db, p, {
    neighborhoodId: 'e'.repeat(32),
    state: 'open',
    workVersion: 1,
    time: 1000,
  });
  const dueId = seedPendingHistoryWork(db, p, older.id, 25000);
  reads = 0;
  const waiting = await projectSnapshot(db, p.wallet, 20000);
  assert.equal(
    reads,
    baseline,
    'Legacy, empty and future projects need no additional finalization reads',
  );
  assert.equal(waiting.history.length, 30);
  assert.ok(!waiting.history.some((p) => p.id === older.id));
  reads = 0;
  const finished = await projectSnapshot(db, p.wallet, 26000);
  assert.ok(
    reads < baseline + 10,
    'Only the due project should add finalization work',
  );
  assert.equal(finished.history[0].id, older.id);
  assert.equal(finished.history[0].state, 'completed');
  assert.equal(
    db.sqlite
      .prepare('SELECT state FROM cluster_contributions WHERE id=?')
      .get(dueId).state,
    'complete',
  );
  assert.equal(
    db.sqlite
      .prepare("SELECT count(*) AS n FROM cluster_projects WHERE state='open'")
      .get().n,
    90,
  );
});

void test('due work is visible through the current neighborhood or an own contribution, not unrelated builds', async () => {
  const {
    db,
    crew: [viewer, contributor],
  } = await fixture(2);
  const neighborhoodId = db.sqlite
    .prepare('SELECT neighborhood_id FROM crew_presence WHERE wallet=?')
    .get(viewer.wallet).neighborhood_id;
  const nearby = seedHistoryBuild(db, contributor, {
    neighborhoodId,
    state: 'open',
    workVersion: 1,
  });
  seedPendingHistoryWork(db, contributor, nearby.id, 7000);
  const unrelated = seedHistoryBuild(db, contributor, {
    neighborhoodId: 'd'.repeat(32),
    state: 'open',
    workVersion: 1,
  });
  seedPendingHistoryWork(db, contributor, unrelated.id, 7000);
  const view = await projectSnapshot(db, viewer.wallet, 8000);
  assert.equal(view.project.id, nearby.id);
  assert.equal(view.project.state, 'completed');
  assert.equal(view.history.length, 0);
  assert.equal(
    db.sqlite
      .prepare('SELECT state FROM cluster_projects WHERE id=?')
      .get(unrelated.id).state,
    'open',
  );
});

void test('thirty claimed builds cannot hide a newer open project or its resume destination', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const neighborhoodId = 'f'.repeat(32);
  const claimed = [];
  for (let i = 0; i < 35; i++)
    claimed.push(
      seedHistoryBuild(db, p, {
        neighborhoodId,
        claimed: true,
        time: 4000 + i,
      }),
    );
  const reward = seedHistoryBuild(db, p, { neighborhoodId, time: 5000 });
  const open = seedHistoryBuild(db, p, {
    neighborhoodId,
    state: 'open',
    time: 6000,
  });
  const view = await projectSnapshot(db, p.wallet, 8000);
  assert.equal(view.history.length, 30);
  assert.ok(view.historyNextCursor);
  assert.deepEqual(
    view.history.slice(0, 3).map((row) => row.id),
    [reward.id, open.id, claimed.at(-1).id],
  );
  assert.equal(view.history[1].neighborhoodId, open.neighborhoodId);
  assert.equal(view.history[1].claimed, false);
  const resumed = await joinNeighborhood(
    db,
    p.wallet,
    'commons',
    0,
    p.controller.clientId,
    { target: view.history[1].neighborhoodId },
    8100,
  );
  assert.equal(resumed.neighborhoodId, open.neighborhoodId);
  assert.equal((await projectSnapshot(db, p.wallet, 8200)).project.id, open.id);
});

void test('bounded history pages expose every outstanding build with deterministic timestamp ties', async () => {
  const {
    db,
    crew: [p, other],
  } = await fixture(2);
  const entries = [];
  for (let i = 1; i <= 85; i++)
    entries.push(
      seedHistoryBuild(db, p, {
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        neighborhoodId: i.toString(16).padStart(32, '0'),
        state: i > 40 && i <= 80 ? 'open' : 'completed',
        claimed: i > 80,
      }),
    );
  const expected = [...entries].sort((a, b) => {
    const rank = (p) => (p.claimed ? 2 : p.state === 'completed' ? 0 : 1);
    return rank(a) - rank(b) || b.time - a.time || b.id.localeCompare(a.id);
  });
  const found = [],
    cursors = [];
  let cursor = null;
  do {
    const view = await projectSnapshot(db, p.wallet, 8000, cursor);
    assert.ok(view.history.length <= 30);
    found.push(...view.history);
    cursor = view.historyNextCursor;
    if (cursor) {
      assert.ok(!cursors.includes(cursor), 'Pagination must make progress');
      cursors.push(cursor);
    }
  } while (cursor);
  assert.deepEqual(
    found.map((p) => p.id),
    expected.map((p) => p.id),
  );
  assert.equal(new Set(found.map((p) => p.id)).size, 85);
  assert.equal(found.filter((p) => p.state === 'open').length, 40);
  assert.equal(
    found.filter((p) => p.state === 'completed' && !p.claimed).length,
    40,
  );
  assert.equal(
    (await projectSnapshot(db, other.wallet, 8000, cursors[0])).history.length,
    0,
  );

  const lateReward = found[35];
  assert.equal(lateReward.state, 'completed');
  assert.equal(
    (await claimProject(db, p.wallet, lateReward.id, 8100)).compute,
    100,
  );
  await assert.rejects(
    claimProject(db, p.wallet, lateReward.id, 8101),
    /already collected/,
  );
  const latest = await projectSnapshot(db, p.wallet, 8200);
  assert.ok(latest.history.every((p) => p.state === 'completed' && !p.claimed));
  assert.ok(!latest.history.some((p) => p.id === lateReward.id));
  const lateOpen = found[70];
  const resumed = await joinNeighborhood(
    db,
    p.wallet,
    lateOpen.realm,
    0,
    p.controller.clientId,
    { target: lateOpen.neighborhoodId },
    8300,
  );
  assert.equal(resumed.neighborhoodId, lateOpen.neighborhoodId);
  assert.equal(
    (await projectSnapshot(db, p.wallet, 8400)).project.id,
    lateOpen.id,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM cluster_contributions WHERE wallet=?')
      .get(p.wallet).n,
    85,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM cluster_claims WHERE wallet=?')
      .get(p.wallet).n,
    6,
  );
});

void test('project history rejects malformed or unbounded cursors without changing saved work', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const id = '00000000-0000-4000-8000-000000000001';
  for (const cursor of [
    '',
    '3:6000:' + id,
    '0:-1:' + id,
    '0:1.5:' + id,
    '0:9007199254740992:' + id,
    '0:6000:not-an-id',
    '0:6000:' + id + "' OR 1=1",
    'x'.repeat(10000),
    1,
    {},
  ])
    await assert.rejects(
      projectSnapshot(db, p.wallet, 8000, cursor),
      (e) => e.status === 400,
    );
  assert.equal(
    db.sqlite.prepare('SELECT count(*) AS n FROM cluster_contributions').get()
      .n,
    0,
  );
  assert.equal(
    db.sqlite.prepare('SELECT count(*) AS n FROM cluster_claims').get().n,
    0,
  );
});

for (const [variant, family, style] of [
  ['gpu-launch', 'workload', 'fast'],
  ['gpu-stability', 'service', 'stable'],
  ['gpu-efficiency', 'supply', 'efficient'],
]) {
  void test(`${variant} needs a completed ${style} ${family} job, not a module or generic work`, async () => {
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

void test('legacy GPU project IDs and frozen requirements remain finishable with legacy reports', async () => {
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

void test('a typed report spent on a Commons project cannot be reused in GPU District', async () => {
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

void test('the last GPU contribution races atomically across reports, components and project progress', async () => {
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

void test('GPU holder revocation and account-version races preserve typed proof and parts at commit', async () => {
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

// These seeded completed rows isolate claim authority and concurrency. Earlier
// tests exercise earning reports and contributing through actual job actions.
function completedDispatchProject(
  db,
  p,
  family = 'workload',
  units = 1,
  policy,
  other = null,
) {
  const id = crypto.randomUUID();
  const variant = {
    workload: 'gpu-launch',
    service: 'gpu-stability',
    supply: 'gpu-efficiency',
  }[family];
  const room = db.sqlite
    .prepare('SELECT neighborhood_id AS id FROM crew_presence WHERE wallet=?')
    .get(p.wallet).id;
  const benefit =
    policy === undefined
      ? { version: 1, kind: 'dispatch', family, storedLimit: 2 }
      : policy;
  db.sqlite
    .prepare(
      "INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,benefit_json,version,created_at) VALUES (?,?,?,'completed',1,'{}','{}',?,0,1000)",
    )
    .run(id, room, variant, benefit === null ? null : JSON.stringify(benefit));
  const add = (person, kind, n) =>
    db.sqlite
      .prepare(
        'INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (?,?,?,?,?,1000)',
      )
      .run(crypto.randomUUID(), id, person.wallet, kind, n);
  add(p, family, units);
  if (other) add(other, family, 2);
  return { id, add };
}
const tickets = (f, family = 'workload') =>
  f.career.dispatchChoices?.[family] ?? [];
const spendChoice = (f, ticket = tickets(f)[0], now = 5000) => {
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  const template =
    offer.template === 'tiny-model' ? 'render-rush' : 'tiny-model';
  f.builds['rack-a'] = 1;
  f = applyFacility(
    f,
    {
      type: 'contract-accept',
      id: offer.id,
      template,
      dispatchTicket: ticket,
      requestId: crypto.randomUUID(),
    },
    f.compute,
    now,
  ).facility;
  return applyFacility(
    f,
    { type: 'contract-cancel', id: offer.id, requestId: crypto.randomUUID() },
    f.compute,
    now + 1,
  ).facility;
};

void test('each specialist grants only matching personal work; partial and full storage previews match claims', async () => {
  for (const family of ['service', 'supply', 'workload']) {
    const {
      db,
      crew: [p, other],
    } = await fixture(2);
    const { id, add } = completedDispatchProject(
      db,
      p,
      family,
      1,
      undefined,
      other,
    );
    const generic = family === 'service' ? 'supply' : 'service';
    add(p, generic, 2);
    const history = (await projectSnapshot(db, p.wallet, 4100)).history.find(
      (h) => h.id === id,
    );
    assert.equal(history.dispatchUnits, 1);
    assert.equal(history.units, 3);
    const reward = await claimProject(db, p.wallet, id, 4100);
    assert.deepEqual(reward.dispatch, { family, granted: 1, stored: 1 });
    assert.equal(reward.compute, 300);
    assert.deepEqual(tickets(facility(db, p), family), [`${id}:0`]);
    const before = facility(db, p);
    await assert.rejects(
      claimProject(db, p.wallet, id, 4200),
      (e) => e.status === 409 && /already collected/.test(e.message),
    );
    assert.deepEqual(facility(db, p), before);
    const second = completedDispatchProject(db, p, family, 2);
    assert.equal(
      (await claimProject(db, p.wallet, second.id, 4300)).dispatch.granted,
      1,
    );
    assert.equal(tickets(facility(db, p), family).length, 2);
    const third = completedDispatchProject(db, p, family, 2);
    assert.equal(
      (await claimProject(db, p.wallet, third.id, 4400)).dispatch.granted,
      0,
    );
    const saved = facility(db, p);
    saved.career.dispatchChoices[family] = [];
    saveFacility(db, p, saved);
    await assert.rejects(
      claimProject(db, p.wallet, third.id, 4500),
      /already collected/,
    );
    assert.equal(tickets(facility(db, p), family).length, 0);
  }
});

void test('generic helpers and legacy null-policy projects do not gain choices from today’s variant definition', async () => {
  const {
    db,
    crew: [p, other],
  } = await fixture(2);
  const { id, add } = completedDispatchProject(db, other, 'workload', 2);
  add(p, 'service', 1);
  assert.equal(
    (await projectSnapshot(db, p.wallet, 4100)).history.find((h) => h.id === id)
      .dispatchUnits,
    0,
  );
  assert.equal(
    (await claimProject(db, p.wallet, id, 4100)).dispatch.granted,
    0,
  );
  assert.deepEqual(facility(db, p).career.dispatchChoices, undefined);
  const old = completedDispatchProject(db, p, 'workload', 2, null);
  assert.equal(
    (await projectSnapshot(db, p.wallet, 4100)).history.find(
      (h) => h.id === old.id,
    ).benefit,
    null,
  );
  assert.deepEqual(await claimProject(db, p.wallet, old.id, 4200), {
    compute: 200,
    reputation: 40,
  });
  assert.deepEqual(facility(db, p).career.dispatchChoices, undefined);
});

void test('duplicate claims after spending either ticket return a conflict and never restore it', async () => {
  for (const ordinal of [0, 1]) {
    const {
      db,
      crew: [p],
    } = await fixture();
    const { id } = completedDispatchProject(db, p, 'workload', 2);
    await claimProject(db, p.wallet, id, 4100);
    const f = spendChoice(facility(db, p), `${id}:${ordinal}`);
    saveFacility(db, p, f);
    await assert.rejects(
      claimProject(db, p.wallet, id, 6000),
      (e) => e.status === 409 && /already collected/.test(e.message),
    );
    assert.deepEqual(facility(db, p), f);
    assert.deepEqual(tickets(f), [`${id}:${1 - ordinal}`]);
  }
});

void test('two project claims competing for one slot cannot overfill or overwrite the winner', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const initial = completedDispatchProject(db, p);
  await claimProject(db, p.wallet, initial.id, 4000);
  const projects = [
    completedDispatchProject(db, p),
    completedDispatchProject(db, p),
  ];
  const results = await Promise.allSettled(
    projects.map((x) => claimProject(db, p.wallet, x.id, 4100)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(tickets(facility(db, p)).length, 2);
  const lost = projects[results.findIndex((r) => r.status === 'rejected')];
  assert.equal(
    (await claimProject(db, p.wallet, lost.id, 4200)).dispatch.granted,
    0,
  );
  assert.equal(tickets(facility(db, p)).length, 2);
  assert.equal(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM cluster_claims WHERE wallet=?')
      .get(p.wallet).n,
    3,
  );
});

void test('a spend racing a project claim forces a fresh capacity read and preserves running work', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  let activeFacility = facility(db, p);
  activeFacility.inventory.scrap = 100;
  const service = activeFacility.career.offers.find(
    (o) => contractTemplate(o.template).family === 'service',
  );
  for (const type of ['contract-accept', 'contract-start'])
    activeFacility = applyFacility(
      activeFacility,
      { type, id: service.id, requestId: crypto.randomUUID() },
      activeFacility.compute,
      3900,
    ).facility;
  const committedRun = structuredClone(activeFacility.career.active[0]);
  saveFacility(db, p, activeFacility);
  const first = completedDispatchProject(db, p, 'workload', 2);
  await claimProject(db, p.wallet, first.id, 4000);
  const next = completedDispatchProject(db, p);
  const batch = db.batch.bind(db);
  let concurrent;
  db.batch = async (statements) => {
    db.batch = batch;
    concurrent = spendChoice(facility(db, p));
    saveFacility(db, p, concurrent);
    return batch(statements);
  };
  await assert.rejects(
    claimProject(db, p.wallet, next.id, 4100),
    /center changed/,
  );
  assert.deepEqual(facility(db, p), concurrent);
  assert.equal(
    (await claimProject(db, p.wallet, next.id, 6000)).dispatch.granted,
    1,
  );
  assert.equal(tickets(facility(db, p)).length, 2);
  assert.deepEqual(
    facility(db, p).career.active.find((r) => r.id === service.id),
    committedRun,
  );
  assert.ok(validCareer(facility(db, p).career));
});

async function measuredWorkloadPlan(variant, first, serial, steps) {
  const {
    db,
    crew: [p],
  } = await fixture();
  let f = facility(db, p);
  f.compute = 1_000_000;
  f.builds = Object.fromEntries(
    'abcdefg'.split('').map((x) => [`rack-${x}`, 3]),
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
  f.skills.engineering = 1000;
  Object.assign(f.career, {
    projectUsed: { service: 9, supply: 9, workload: 8 },
    reportStyles: { workload: { fast: 2 } },
    modules: ['fast', 'efficient', 'stable'],
    loadout: ['fast', 'efficient'],
    commissioned: 3,
    serial,
    offers: [
      { id: 'contract-1', template: 'loose-link' },
      { id: 'contract-2', template: 'kit-order' },
      { id: `contract-${serial - 1}`, template: first },
    ],
    active: [],
    selected: null,
  });
  saveFacility(db, p, f);
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
  for (const [family, n] of Object.entries(project.required))
    for (let i = 0; i < n; i++)
      await gpuContribution(db, p, project.id, family);
  await claimProject(db, p.wallet, project.id, gpuNow + 4000);
  f = facility(db, p);
  let now = gpuNow + 5000;
  const started = now;
  const action = (type, extra) => {
    f = applyFacility(
      f,
      { type, requestId: crypto.randomUUID(), ...extra },
      f.compute,
      now,
    ).facility;
  };
  for (const [offered, replacement, seconds] of steps) {
    const o = f.career.offers.find(
      (o) => contractTemplate(o.template).family === 'workload',
    );
    assert.equal(o.template, offered);
    const serialBefore = f.career.serial;
    action('contract-accept', {
      id: o.id,
      ...(replacement
        ? { template: replacement, dispatchTicket: tickets(f)[0] }
        : {}),
    });
    assert.equal(f.career.serial, serialBefore);
    action('contract-start', { id: o.id, direction: 'fast', rack: 'rack-g' });
    const run = f.career.active.find((r) => r.id === o.id);
    assert.equal(run.duration, seconds);
    assert.equal(run.readyAt, now + seconds * 1000);
    now = run.readyAt;
    action('contract-claim', { id: o.id });
    assert.ok(validCareer(f.career));
  }
  assert.equal(f.career.completed.workload - f.career.projectUsed.workload, 3);
  assert.equal(f.career.commissioned, 4);
  assert.equal(tickets(f).length, 0);
  return (now - started) / 1000;
}

void test('maxed operators have conditional project choices: specialists win on a slow board, First light on a short board', async () => {
  // Same final report stock, including the specialist's extra consumed report.
  // Exact job clocks; no claims in other families to advance the shared serial.
  assert.equal(
    await measuredWorkloadPlan('balanced', 'quiet-inference', 7, [
      ['quiet-inference', null, 126],
      ['wobbly-training', null, 168],
    ]),
    294,
  );
  assert.equal(
    await measuredWorkloadPlan('gpu-launch', 'quiet-inference', 7, [
      ['quiet-inference', 'tiny-model', 42],
      ['wobbly-training', 'tiny-model', 42],
      ['tiny-model', null, 42],
    ]),
    126,
  );
  assert.equal(
    await measuredWorkloadPlan('balanced', 'tiny-model', 5, [
      ['tiny-model', null, 42],
      ['render-rush', null, 63],
    ]),
    105,
  );
  assert.equal(
    await measuredWorkloadPlan('gpu-launch', 'tiny-model', 5, [
      ['tiny-model', null, 42],
      ['render-rush', 'tiny-model', 42],
      ['quiet-inference', 'tiny-model', 42],
    ]),
    126,
  );
});

void test('twelve claimed projects conserve named choices through full storage, spending, reloads, and old-claim replay', async () => {
  const {
    db,
    crew: [p],
  } = await fixture();
  const granted = new Set(),
    spent = new Set(),
    ids = [];
  for (let cycle = 0; cycle < 12; cycle++) {
    let f = facility(db, p);
    for (let i = 0; i < cycle % 3; i++) {
      const ticket = tickets(f)[0];
      assert.ok(ticket);
      assert.ok(!spent.has(ticket));
      f = spendChoice(f, ticket, 5000 + cycle * 100 + i * 2);
      spent.add(ticket);
    }
    saveFacility(db, p, f);
    const before = [...tickets(f)];
    const { id } = completedDispatchProject(db, p, 'workload', 2);
    ids.push(id);
    await claimProject(db, p.wallet, id, 5000 + cycle * 100 + 10);
    f = facility(db, p);
    assert.equal(tickets(f).length, 2);
    for (const ticket of before) assert.ok(tickets(f).includes(ticket));
    for (const ticket of tickets(f).filter((t) => !before.includes(t))) {
      assert.ok(!granted.has(ticket));
      assert.ok(!spent.has(ticket));
      granted.add(ticket);
    }
    assert.equal(granted.size, spent.size + tickets(f).length);
    assert.ok(validCareer(f.career));
    await assert.rejects(
      claimProject(db, p.wallet, id, 5000 + cycle * 100 + 20),
      /already collected/,
    );
    assert.deepEqual(facility(db, p), f);
  }
  assert.equal(granted.size, 14);
  assert.equal(spent.size, 12);
  let f = facility(db, p);
  while (tickets(f).length) f = spendChoice(f, tickets(f)[0], 10000);
  saveFacility(db, p, f);
  await assert.rejects(
    claimProject(db, p.wallet, ids[0], 11000),
    /already collected/,
  );
  assert.deepEqual(facility(db, p), f);
  assert.equal(
    db.sqlite
      .prepare('SELECT count(*) AS n FROM cluster_claims WHERE wallet=?')
      .get(p.wallet).n,
    12,
  );
});
