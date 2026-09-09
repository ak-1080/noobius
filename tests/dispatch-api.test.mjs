import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { contractTemplate } from '../lib/contracts.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):3003$/.test(origin))
  throw new Error(
    'Dispatch fixtures require the isolated loopback preview on port 3003 with .wrangler/qa-dispatch.',
  );
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
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

test('wallet HTTP claims and job choices enforce identity, home authority, capacity and replay', async () => {
  const c = new Client(),
    other = new Client(),
    anon = new Client();
  let profile = ok(await c.login()).profile;
  ok(await other.login());
  const world = { clientId: crypto.randomUUID(), generation: 0 };
  const joined = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...world, realm: 'commons' }),
    ),
  );
  world.generation = joined.membership.generation;
  const room = joined.membership.neighborhoodId;
  // Seed a completed project in the isolated QA database. Grant and spending
  // still go through real authenticated Worker endpoints; no fixture keys ship.
  const id = crypto.randomUUID(),
    benefit = {
      version: 1,
      kind: 'dispatch',
      family: 'workload',
      storedLimit: 2,
    };
  const f = profile.facility;
  f.builds = { 'rack-a': 1 };
  f.career.completed = { service: 10, supply: 10, workload: 10 };
  const wallet = c.account.address.toLowerCase();
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(f))} WHERE wallet=${quote(wallet)}; INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,benefit_json,version,created_at) VALUES (${quote(id)},${quote(room)},'gpu-launch','completed',1,'{}','{}',${quote(JSON.stringify(benefit))},0,${Date.now()}); INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) VALUES (${quote(crypto.randomUUID())},${quote(id)},${quote(wallet)},'workload',1,${Date.now()});`,
  );
  assert.equal(
    (await anon.request('project-claim', { projectId: id })).status,
    401,
  );
  assert.equal(
    (
      await c.request('project-claim', {
        projectId: id,
        expectedWallet: other.account.address.toLowerCase(),
      })
    ).status,
    401,
  );
  assert.equal(
    (await other.request('project-claim', other.body({ projectId: id })))
      .status,
    409,
  );
  const claims = await Promise.all([
    c.request('project-claim', c.body({ projectId: id })),
    c.request('project-claim', c.body({ projectId: id })),
  ]);
  assert.deepEqual(
    claims.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  profile = ok(await c.request('profile')).profile;
  const ticket = profile.facility.career.dispatchChoices.workload[0];
  assert.equal(ticket, `${id}:0`);
  assert.equal(
    (await c.request('project-claim', c.body({ projectId: id }))).status,
    409,
  );
  const offer = profile.facility.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  const template =
    offer.template === 'tiny-model' ? 'render-rush' : 'tiny-model';
  const action = {
    type: 'contract-accept',
    id: offer.id,
    template,
    dispatchTicket: ticket,
    requestId: crypto.randomUUID(),
  };
  // Accepting a job from the shared commons must not bypass home authority.
  assert.equal(
    (await c.request('facility', c.body({ ...world, action }))).status,
    403,
  );
  const home = ok(
    await c.request(
      'neighborhood-scene',
      c.body({ ...world, scene: 'home-' + profile.id }),
    ),
  );
  world.generation = home.membership.generation;
  assert.equal(
    (
      await c.request(
        'facility',
        c.body({
          ...world,
          action: { ...action, dispatchTicket: crypto.randomUUID() + ':0' },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    ok(await c.request('profile')).profile.facility.career.dispatchChoices
      .workload.length,
    1,
  );
  const saved = ok(await c.request('facility', c.body({ ...world, action })))
    .profile.facility;
  assert.equal(
    saved.career.active.find((r) => r.id === offer.id).template,
    template,
  );
  assert.equal(saved.career.dispatchChoices.workload.length, 0);
  ok(
    await c.request(
      'facility',
      c.body({
        ...world,
        action: {
          type: 'contract-cancel',
          id: offer.id,
          requestId: crypto.randomUUID(),
        },
      }),
    ),
  );
  const after = ok(await c.request('profile')).profile.facility;
  assert.equal(
    after.career.offers.find((o) => o.id === offer.id).template,
    template,
  );
  assert.equal(after.career.dispatchChoices.workload.length, 0);
  assert.equal(
    (
      await c.request(
        'facility',
        c.body({
          ...world,
          action: {
            ...action,
            template: offer.template,
            requestId: crypto.randomUUID(),
          },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await c.request('project-claim', c.body({ projectId: id }))).status,
    409,
  );
  assert.equal(
    ok(await c.request('profile')).profile.facility.career.dispatchChoices
      .workload.length,
    0,
  );
});
