import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Client } from './api-client.mjs';
import { COMMISSIONING_CHECKS } from '../lib/commissioning.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):3003$/.test(origin))
  throw new Error(
    'Commissioning QA requires isolated port3003 and .wrangler/qa-dispatch.',
  );
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = (command) =>
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      '.openai/wrangler.local.json',
      '--persist-to',
      '.wrangler/qa-dispatch',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const waitUntil = async (time) => {
  const left = time - Date.now();
  if (left > 0) await new Promise((r) => setTimeout(r, left + 30));
};
test('real Worker and D1 commission a cluster with guarded service, finite loan and one reward', async () => {
  const c = new Client(),
    original = ok(await c.login()).profile,
    wallet = c.account.address.toLowerCase(),
    room = crypto.randomUUID().replaceAll('-', '');
  const f = original.facility;
  f.builds = { 'rack-a': 1, 'rack-g': 3 };
  f.computeBoost = 5;
  // Seed only a generated account in the isolated QA database; no live player changes.
  f.inventory = { kit: 1, board: 1, copper: 20, silicon: 20 };
  f.career.completed = { service: 1, supply: 1, workload: 1 };
  sql(
    `UPDATE players SET facility_state=${q(JSON.stringify(f))},credits=1000 WHERE wallet=${q(wallet)}; INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${q(room)},'commons',0,${Date.now()})`,
  );
  const world = { clientId: crypto.randomUUID(), generation: 0 };
  world.generation = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...world, realm: 'commons', target: room }),
    ),
  ).membership.generation;
  const touch = () =>
    sql(
      `UPDATE crew_presence SET x=-4,z=9,room='commons',updated_at=${Date.now()},lease_until=${Date.now() + 60000} WHERE wallet=${q(wallet)}`,
    );
  const act = (name, fields = {}) =>
    c.request(name, c.body({ ...world, ...fields }));
  touch();
  ok(await act('project-start', { variant: 'balanced' }));
  let snap = ok(await c.request('projects')),
    id = snap.project.id;
  assert.equal(snap.project.workVersion, 1);
  const early = await act('project-contribute', {
    projectId: id,
    family: 'service',
    requestId: crypto.randomUUID(),
  });
  assert.equal(early.status, 400);
  const request = crypto.randomUUID();
  ok(
    await act('project-contribute', {
      projectId: id,
      family: 'workload',
      rack: 'rack-g',
      requestId: request,
    }),
  );
  let p = ok(await c.request('profile')).profile,
    loan = p.facility.projectReservations[0];
  assert.equal(loan.readyAt - loan.startedAt, 15000);
  assert.equal(p.facility.career.projectUsed.workload, 1);
  touch();
  ok(
    await act('project-contribute', {
      projectId: id,
      family: 'workload',
      rack: 'rack-g',
      requestId: request,
    }),
  );
  assert.equal(
    ok(await c.request('profile')).profile.facility.career.projectUsed.workload,
    1,
  );
  touch();
  ok(
    await act('project-inspect', {
      projectId: id,
      requestId: crypto.randomUUID(),
    }),
  );
  snap = ok(await c.request('projects'));
  let session = snap.service;
  const frames = [
    {
      label: 'Reading',
      profile: ok(await c.request('profile')).profile,
      data: snap,
    },
  ];
  const step = (step, extra = {}) =>
    act('project-service', {
      projectId: id,
      sessionId: session.id,
      version: session.version,
      step,
      ...extra,
    });
  const tooSoon = await step('inspect');
  assert.equal(tooSoon.status, 409);
  assert.match(tooSoon.data.error, /updating/);
  await waitUntil(session.nextAt);
  touch();
  ok(await step('inspect'));
  snap = ok(await c.request('projects'));
  session = snap.service;
  frames.push({
    label: 'Choose repair',
    profile: ok(await c.request('profile')).profile,
    data: snap,
  });
  await waitUntil(session.nextAt);
  touch();
  ok(
    await step('repair', {
      choice: COMMISSIONING_CHECKS[session.fault].answer,
    }),
  );
  snap = ok(await c.request('projects'));
  session = snap.service;
  frames.push({
    label: 'Test',
    profile: ok(await c.request('profile')).profile,
    data: snap,
  });
  await waitUntil(session.nextAt);
  touch();
  ok(await step('test'));
  ok(await step('test'));
  p = ok(await c.request('profile')).profile;
  assert.equal(p.facility.inventory.kit, 0);
  assert.equal(p.facility.career.projectUsed.service, 1);
  touch();
  ok(
    await act('project-contribute', {
      projectId: id,
      family: 'supply',
      requestId: crypto.randomUUID(),
    }),
  );
  // Never re-open Projects after all inputs are accepted: ordinary world polling must finish it.
  await waitUntil(loan.readyAt);
  touch();
  const worldAfter = ok(
    await act('neighborhood-sync', { sequence: 1, position: { x: -4, z: 9 } }),
  );
  assert.equal(worldAfter.cluster.online, true);
  assert.equal(worldAfter.cluster.progress, worldAfter.cluster.total);
  const claims = await Promise.all([
    act('project-claim', { projectId: id }),
    act('project-claim', { projectId: id }),
  ]);
  assert.equal(claims.filter((r) => r.status === 200).length, 1);
  p = ok(await c.request('profile')).profile;
  assert.equal(p.credits, 1300);
  assert.equal(p.facility.career.completed.workload, 1);
  frames.push({
    label: 'Complete',
    profile: p,
    data: ok(await c.request('projects')),
  });
  writeFileSync('/tmp/noobius-commission-ui.json', JSON.stringify(frames));
});
