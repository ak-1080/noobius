import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import {
  newFacility,
  normalizeFacility,
  applyFacility,
  storedComputeNow,
  settleFacilityProduction,
} from '../lib/facility.ts';
import { availableRacks, contractTemplate } from '../lib/contracts.ts';
import {
  joinNeighborhood,
  leaveNeighborhood,
} from '../lib/neighborhoods-server.ts';
import {
  startProject,
  contributeProject,
  startProjectService,
  advanceProjectService,
  projectSnapshot,
  claimProject,
} from '../lib/projects-server.ts';
import {
  COMMISSIONING_CHECKS,
  finalizeProjectWork,
  projectLoanQuote,
  validProjectReservations,
} from '../lib/commissioning.ts';
const now = 1000000;
const uuid = () => crypto.randomUUID();
async function fixture(count = 1) {
  const db = database(),
    crew = [];
  for (let i = 0; i < count; i++) {
    const wallet = '0x' + String(i + 1).padStart(40, '0'),
      clientId = uuid();
    const f = normalizeFacility(newFacility(now), now);
    f.builds = { 'rack-a': 1, 'rack-f': 3, 'rack-g': 3 };
    f.computeBoost = 5;
    f.inventory = { kit: 20, board: 20, copper: 100, silicon: 100 };
    f.career.completed = { service: 20, supply: 20, workload: 20 };
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,facility_state,credits) VALUES (?,?,?,?,?)',
      )
      .run(wallet, `Tech ${i + 1}`, now, JSON.stringify(f), 1000);
    const joined = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      {},
      now,
    );
    const p = {
      wallet,
      controller: { clientId, generation: joined.generation },
    };
    crew.push(p);
    touch(db, p, now);
  }
  const project = (
    await startProject(db, crew[0].wallet, crew[0].controller, 'balanced', now)
  ).project;
  return { db, crew, project };
}
const touch = (db, p, t) =>
  db.sqlite
    .prepare(
      "UPDATE crew_presence SET x=-4,z=9,room='commons',updated_at=?,lease_until=? WHERE wallet=?",
    )
    .run(t, t + 60000, p.wallet);
const fget = (db, p) => {
  const r = db.sqlite
    .prepare('SELECT facility_state,credits FROM players WHERE wallet=?')
    .get(p.wallet);
  return { ...JSON.parse(r.facility_state), compute: r.credits };
};
const save = (db, p, f) =>
  db.sqlite
    .prepare(
      'UPDATE players SET facility_state=?,facility_version=?,credits=? WHERE wallet=?',
    )
    .run(JSON.stringify(f), f.version, f.compute, p.wallet);
const session = (db, p, id) =>
  db.sqlite
    .prepare(
      "SELECT id,stage,fault,version,next_at AS nextAt FROM cluster_service_sessions WHERE wallet=? AND project_id=? AND stage!='complete'",
    )
    .get(p.wallet, id);
const give = (db, p, id, family, t = now, work, request = uuid()) =>
  contributeProject(
    db,
    p.wallet,
    p.controller,
    id,
    family,
    request,
    t,
    undefined,
    work,
  );
async function service(db, p, id, t = now, finish = true) {
  touch(db, p, t);
  await startProjectService(db, p.wallet, p.controller, id, uuid(), t);
  let s = session(db, p, id);
  t = s.nextAt;
  touch(db, p, t);
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    id,
    s.id,
    s.version,
    'inspect',
    undefined,
    t,
  );
  s = session(db, p, id);
  t = s.nextAt;
  touch(db, p, t);
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    id,
    s.id,
    s.version,
    'repair',
    COMMISSIONING_CHECKS[s.fault].answer,
    t,
  );
  s = session(db, p, id);
  t = s.nextAt;
  touch(db, p, t);
  if (finish)
    await advanceProjectService(
      db,
      p.wallet,
      p.controller,
      id,
      s.id,
      s.version,
      'test',
      undefined,
      t,
    );
  return { t, s };
}
test('stockpiles cannot commission a new cluster at one timestamp; legacy projects keep original terms', async () => {
  const {
    db,
    crew: [p],
    project,
  } = await fixture();
  assert.equal(project.workVersion, 1);
  await assert.rejects(give(db, p, project.id, 'service'), /Inspect/);
  await assert.rejects(
    give(db, p, project.id, 'workload'),
    /available machine/,
  );
  await give(db, p, project.id, 'supply');
  assert.equal(
    (await projectSnapshot(db, p.wallet, now)).project.state,
    'open',
  );
  db.sqlite
    .prepare('UPDATE cluster_projects SET work_version=0 WHERE id=?')
    .run(project.id);
  await give(db, p, project.id, 'service');
  await give(db, p, project.id, 'workload');
  assert.equal(
    (await projectSnapshot(db, p.wallet, now)).project.state,
    'completed',
  );
});
test('service requires observations, matching repair, server deadlines and one final debit', async () => {
  const {
    db,
    crew: [p],
    project,
  } = await fixture();
  const before = fget(db, p),
    request = uuid();
  await startProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    request,
    now,
  );
  await startProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    request,
    now,
  );
  let s = session(db, p, project.id);
  await assert.rejects(
    advanceProjectService(
      db,
      p.wallet,
      p.controller,
      project.id,
      s.id,
      s.version,
      'inspect',
      undefined,
      now,
    ),
    /updating/,
  );
  await assert.rejects(
    advanceProjectService(
      db,
      p.wallet,
      p.controller,
      project.id,
      s.id,
      s.version,
      'test',
      undefined,
      s.nextAt,
    ),
    /Inspect/,
  );
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    s.id,
    s.version,
    'inspect',
    undefined,
    s.nextAt,
  );
  s = session(db, p, project.id);
  touch(db, p, s.nextAt);
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    s.id,
    s.version,
    'repair',
    'Wrong repair',
    s.nextAt,
  );
  assert.deepEqual(fget(db, p), before);
  s = session(db, p, project.id);
  assert.equal(s.stage, 'repair');
  touch(db, p, s.nextAt);
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    s.id,
    s.version,
    'repair',
    COMMISSIONING_CHECKS[s.fault].answer,
    s.nextAt,
  );
  s = session(db, p, project.id);
  touch(db, p, s.nextAt);
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    s.id,
    s.version,
    'test',
    undefined,
    s.nextAt,
  );
  await advanceProjectService(
    db,
    p.wallet,
    p.controller,
    project.id,
    s.id,
    s.version,
    'test',
    undefined,
    s.nextAt,
  );
  const after = fget(db, p);
  assert.equal(after.inventory.kit, before.inventory.kit - 1);
  assert.equal(after.career.projectUsed.service, 1);
  assert.equal(after.career.completed.service, before.career.completed.service);
  assert.equal(after.compute, before.compute);
  assert.equal(
    db.sqlite.prepare('SELECT count(*) AS n FROM cluster_contributions').get()
      .n,
    1,
  );
});
test('workload loan freezes terms, occupies one rack, survives leaving and completes without a pickup', async () => {
  const {
    db,
    crew: [p],
    project,
  } = await fixture();
  const request = uuid();
  await give(db, p, project.id, 'workload', now, { rack: 'rack-f' }, request);
  const started = fget(db, p),
    loan = started.projectReservations[0];
  assert.equal(loan.readyAt - now, 30000);
  assert.ok(!availableRacks(started, now).includes('rack-f'));
  assert.ok(availableRacks(started, now).includes('rack-g'));
  await give(
    db,
    p,
    project.id,
    'workload',
    now + 1,
    { rack: 'rack-f' },
    request,
  );
  assert.deepEqual(fget(db, p), started);
  await assert.rejects(
    give(db, p, project.id, 'workload', now + 1, { rack: 'rack-g' }, request),
    /new contribution/,
  );
  let snap = await projectSnapshot(db, p.wallet, now + 1);
  assert.equal(snap.project.progress.workload, 0);
  assert.equal(snap.project.pendingWorkload, 1);
  await service(db, p, project.id, now);
  touch(db, p, now + 12000);
  await give(db, p, project.id, 'supply', now + 12000);
  await assert.rejects(
    claimProject(db, p.wallet, project.id, loan.readyAt - 1),
  );
  await leaveNeighborhood(db, p.wallet, p.controller);
  const reward = await claimProject(db, p.wallet, project.id, loan.readyAt);
  assert.deepEqual(reward, { compute: 300, reputation: 60 });
  assert.ok(availableRacks(fget(db, p), loan.readyAt).includes('rack-f'));
  await assert.rejects(
    claimProject(db, p.wallet, project.id, loan.readyAt + 1),
    /already collected/,
  );
  assert.equal(fget(db, p).career.completed.workload, 20);
});
test('production is conserved through loan settlement, late harvest and off-tick deadlines', async () => {
  for (const offset of [0, 2000, 14999]) {
    const {
      db,
      crew: [p],
      project,
    } = await fixture();
    touch(db, p, now + offset);
    const before = fget(db, p);
    await give(db, p, project.id, 'workload', now + offset, { rack: 'rack-f' });
    const f = fget(db, p),
      end = now + offset + 90000;
    assert.equal(
      storedComputeNow(before, end) - storedComputeNow(f, end),
      projectLoanQuote(before, 'rack-f').pausedOutput,
    );
    const early = structuredClone(f);
    settleFacilityProduction(early, now + offset + 10000);
    settleFacilityProduction(early, end);
    const late = structuredClone(f);
    settleFacilityProduction(late, end);
    assert.equal(early.storedCompute, late.storedCompute);
    assert.deepEqual(late.projectReservations, []);
    assert.equal(
      storedComputeNow(late, end + 15000),
      late.storedCompute + 3 * 17 - 4,
    ); // A level1 =13, F/G =17 each.
  }
});
test('a rack cannot run a project and client batch together; running loans also block upgrades', async () => {
  const {
    db,
    crew: [p],
    project,
  } = await fixture();
  await give(db, p, project.id, 'workload', now, { rack: 'rack-a' });
  let f = fget(db, p);
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  f = applyFacility(
    f,
    { type: 'contract-accept', id: offer.id, requestId: uuid() },
    f.compute,
    now,
  ).facility;
  assert.throws(
    () =>
      applyFacility(
        f,
        {
          type: 'contract-start',
          id: offer.id,
          rack: 'rack-a',
          requestId: uuid(),
        },
        f.compute,
        now,
      ),
    /available machine/,
  );
  for (const action of [
    { type: 'build', id: 'rack-a' },
    { type: 'compute-upgrade' },
  ])
    assert.throws(
      () => applyFacility(f, { ...action, requestId: uuid() }, f.compute, now),
      /commission/,
    );
  f = applyFacility(
    f,
    { type: 'contract-start', id: offer.id, rack: 'rack-g', requestId: uuid() },
    f.compute,
    now,
  ).facility;
  assert.ok(f.career.active[0].rack === 'rack-g');
});
test('competing last workload starts consume only the winner’s parts and reserve only its rack', async () => {
  const { db, crew, project } = await fixture(2);
  const before = crew.map((p) => fget(db, p));
  const result = await Promise.allSettled(
    crew.map((p) =>
      give(db, p, project.id, 'workload', now, { rack: 'rack-f' }),
    ),
  );
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    crew.reduce(
      (n, p) => n + (fget(db, p).projectReservations?.length ?? 0),
      0,
    ),
    1,
  );
  const loser = result.findIndex((r) => r.status === 'rejected');
  assert.deepEqual(fget(db, crew[loser]), before[loser]);
});
test('abandoned service cannot hold the last slot; concurrent tests credit one participant', async () => {
  const { db, crew, project } = await fixture(2);
  const attempts = [];
  for (const p of crew)
    attempts.push(await service(db, p, project.id, now, false));
  const before = crew.map((p) => fget(db, p));
  const result = await Promise.allSettled(
    crew.map((p, i) =>
      advanceProjectService(
        db,
        p.wallet,
        p.controller,
        project.id,
        attempts[i].s.id,
        attempts[i].s.version,
        'test',
        undefined,
        attempts[i].t,
      ),
    ),
  );
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = result.findIndex((r) => r.status === 'rejected');
  assert.deepEqual(fget(db, crew[loser]), before[loser]);
});
test('five-person requirements remain solo-finishable after everyone else leaves', async () => {
  const { db, crew, project } = await fixture(5);
  const p = crew[0];
  assert.equal(project.scale, 3);
  for (const other of crew.slice(1))
    await leaveNeighborhood(db, other.wallet, other.controller);
  let t = now;
  for (let i = 0; i < 3; i++) {
    await service(db, p, project.id, t);
    t += 12000;
    touch(db, p, t);
    await give(db, p, project.id, 'supply', t);
    await give(db, p, project.id, 'workload', t, { rack: 'rack-g' });
    t += 15000;
    touch(db, p, t);
    await finalizeProjectWork(db, project.id, t);
  }
  assert.equal(
    (await projectSnapshot(db, p.wallet, t)).project.state,
    'completed',
  );
  assert.equal((await claimProject(db, p.wallet, project.id, t)).compute, 900);
});
test('controller and account races cannot create an unpaired loan', async () => {
  for (const kind of ['controller', 'account']) {
    const {
      db,
      crew: [p],
      project,
    } = await fixture();
    const before = fget(db, p);
    const batch = db.batch.bind(db);
    db.batch = async (statements) => {
      db.batch = batch;
      if (kind === 'controller')
        db.sqlite
          .prepare(
            'UPDATE crew_presence SET generation=generation+1 WHERE wallet=?',
          )
          .run(p.wallet);
      else
        db.sqlite
          .prepare(
            'UPDATE players SET facility_version=facility_version+1 WHERE wallet=?',
          )
          .run(p.wallet);
      return batch(statements);
    };
    await assert.rejects(
      give(db, p, project.id, 'workload', now, { rack: 'rack-f' }),
    );
    assert.deepEqual(fget(db, p), before);
    assert.equal(
      db.sqlite.prepare('SELECT count(*) n FROM cluster_contributions').get().n,
      0,
    );
  }
});
test('reservation validation rejects invented machines, bad deadlines and duplicate identities', () => {
  const valid = {
    id: uuid(),
    projectId: uuid(),
    rack: 'rack-a',
    startedAt: now,
    readyAt: now + 300000,
  };
  assert.ok(validProjectReservations([valid]));
  for (const value of [
    [valid, valid],
    [{ ...valid, rack: 'not-a-rack' }],
    [{ ...valid, readyAt: now + 300001 }],
    [{ ...valid, startedAt: NaN }],
  ])
    assert.equal(validProjectReservations(value), false);
});

test('retry after a loan finishes keeps the original debit even with another slot available', async () => {
  const {
      db,
      crew: [p],
      project,
    } = await fixture(3),
    request = uuid();
  assert.equal(project.required.workload, 2);
  await give(db, p, project.id, 'workload', now, { rack: 'rack-g' }, request);
  const started = fget(db, p),
    ready = started.projectReservations[0].readyAt;
  await finalizeProjectWork(db, project.id, ready);
  touch(db, p, ready + 1);
  await give(
    db,
    p,
    project.id,
    'workload',
    ready + 1,
    { rack: 'rack-g' },
    request,
  );
  assert.deepEqual(fget(db, p), started);
  const snap = await projectSnapshot(db, p.wallet, ready + 1);
  assert.equal(snap.project.progress.workload, 1);
  assert.equal(snap.project.pendingWorkload, 0);
  assert.equal(
    db.sqlite
      .prepare(
        'SELECT count(*) n FROM cluster_contributions WHERE project_id=?',
      )
      .get(project.id).n,
    1,
  );
  await leaveNeighborhood(db, p.wallet, p.controller);
  await give(
    db,
    p,
    project.id,
    'workload',
    ready + 2,
    { rack: 'rack-g' },
    request,
  );
  assert.deepEqual(fget(db, p), started);
});

test('0008 migration preserves populated old terms, contributions and paid rewards', async (t) => {
  const { DatabaseSync } = await import('node:sqlite'),
    { readFileSync } = await import('node:fs');
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec('PRAGMA foreign_keys=ON');
  const journal = JSON.parse(
    readFileSync(
      new URL('../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  ).entries;
  const migration = (e) =>
    readFileSync(
      new URL('../drizzle/' + e.tag + '.sql', import.meta.url),
      'utf8',
    );
  const entry = journal.find((e) => e.tag === '0008_foamy_sersi');
  assert.ok(entry);
  for (const e of journal.filter((e) => e.idx < entry.idx))
    sql.exec(migration(e));
  const wallet = '0x' + '1'.repeat(40),
    room = uuid(),
    open = uuid(),
    paid = uuid();
  sql
    .prepare(
      'INSERT INTO players(wallet,name,credits,created_at,facility_state) VALUES (?,?,?,?,?)',
    )
    .run(
      wallet,
      'Returning operator',
      1400,
      now,
      JSON.stringify(normalizeFacility(newFacility(now), now)),
    );
  sql
    .prepare(
      'INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (?,?,?,?)',
    )
    .run(room, 'gpu', 0, now);
  const required = JSON.stringify({ service: 1, supply: 1, workload: 2 }),
    benefit = JSON.stringify({
      version: 1,
      kind: 'dispatch',
      family: 'workload',
      storedLimit: 2,
    });
  const insert = sql.prepare(
    'INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,version,created_at,completed_at,benefit_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  insert.run(
    open,
    room,
    'gpu-launch',
    'open',
    1,
    required,
    JSON.stringify({ service: 1, supply: 0, workload: 1 }),
    4,
    now,
    null,
    benefit,
  );
  insert.run(
    paid,
    room,
    'gpu-launch',
    'completed',
    1,
    required,
    required,
    8,
    now - 1000,
    now - 1,
    benefit,
  );
  const contribution = sql.prepare(
    'INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (?,?,?,?,?,?)',
  );
  for (const [id, family, units] of [
    [open, 'service', 1],
    [open, 'workload', 1],
    [paid, 'service', 1],
    [paid, 'supply', 1],
    [paid, 'workload', 2],
  ])
    contribution.run(uuid(), id, wallet, family, units, now - 1);
  sql
    .prepare(
      'INSERT INTO cluster_claims(id,project_id,wallet,compute,reputation,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(uuid(), paid, wallet, 400, 80, now);
  const before = [
    'players',
    'cluster_projects',
    'cluster_contributions',
    'cluster_claims',
  ].map((table) => ({
    table,
    columns: sql
      .prepare('PRAGMA table_info(' + table + ')')
      .all()
      .map((c) => c.name),
    rows: sql.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all(),
  }));
  sql.exec(migration(entry));
  for (const saved of before)
    assert.deepEqual(
      sql
        .prepare(
          'SELECT ' +
            saved.columns.join(',') +
            ' FROM ' +
            saved.table +
            ' ORDER BY 1',
        )
        .all(),
      saved.rows,
    );
  assert.deepEqual(
    sql
      .prepare('SELECT work_version FROM cluster_projects')
      .all()
      .map((r) => r.work_version),
    [0, 0],
  );
  for (const row of sql
    .prepare('SELECT state,ready_at,work_json FROM cluster_contributions')
    .all())
    assert.deepEqual(
      { ...row },
      { state: 'complete', ready_at: null, work_json: null },
    );
  assert.equal(
    sql.prepare('SELECT count(*) n FROM cluster_service_sessions').get().n,
    0,
  );
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});

test('earnings forecast matches actual next storage tick through assignment and release', async () => {
  const { computeForecast } = await import('../lib/facility.ts');
  const f = normalizeFacility(newFacility(now), now);
  f.builds = { 'rack-a': 1 };
  f.projectReservations = [
    {
      id: uuid(),
      projectId: uuid(),
      rack: 'rack-a',
      startedAt: now,
      readyAt: now + 300000,
    },
  ];
  assert.equal(computeForecast(f, now).perMinute, 0);
  assert.equal(computeForecast(f, now).nextAmount, 0);
  assert.equal(computeForecast(f, now + 300000).perMinute, 24);
  assert.equal(computeForecast(f, now + 300000).nextAmount, 6);
  for (const t of [now, now + 14000, now + 299999, now + 300000]) {
    const q = computeForecast(f, t);
    assert.equal(
      q.nextAmount,
      storedComputeNow(f, q.nextAt) - storedComputeNow(f, t),
    );
  }
});
