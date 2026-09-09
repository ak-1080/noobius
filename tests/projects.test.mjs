import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import { newFacility } from '../lib/facility.ts';
import { careerFor, operatorLicense, validCareer } from '../lib/contracts.ts';
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
