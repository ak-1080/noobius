import test from 'node:test';
import { realmAnswer } from './realm-answer.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
      '.wrangler/state',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );
test('HTTP fieldwork: trusted levels, exact realm/worksite, malformed input, frozen recovery and concurrent claims', async () => {
  const origin = new URL(
    process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
  );
  if (!['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('Local fixtures only');
  const c = new Client(),
    login = ok(await c.login()),
    wallet = c.account.address.toLowerCase();
  const control = { clientId: crypto.randomUUID(), generation: 0 };
  const command = (name, extra = {}) =>
    c.request(name, c.body({ ...control, ...extra }));
  const join = async (realm) => {
    const d = ok(await command('neighborhood-join', { realm }));
    control.generation = d.membership.generation;
    return d;
  };
  const field = (type, extra = {}, requestId = crypto.randomUUID()) =>
    command('facility', { action: { type, requestId, ...extra } });
  await join('commons');
  assert.equal((await command('facility', { action: {} })).status, 400);
  assert.equal(
    (await command('facility', { action: { type: 3 } })).status,
    400,
  );
  assert.equal(
    (
      await command('neighborhood-join', {
        realm: 'thermal',
        xp: 999999,
        level: 100,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await field('field-start', {
        realm: 'commons',
        id: 'field-commons-0',
        direction: 'standard',
      })
    ).status,
    400,
    'must physically reach field station',
  );
  sql(`UPDATE players SET xp=200 WHERE wallet='${wallet}'`);
  await join('thermal');
  assert.equal(
    (await command('neighborhood-join', { realm: 'gpu', xp: 999999 })).status,
    403,
  );
  await join('commons');
  sql(
    `UPDATE crew_presence SET x=-21,z=-10.35,updated_at=${Date.now()} WHERE wallet='${wallet}'`,
  );
  assert.equal(
    (await field('field-start', { realm: 'core', direction: 'standard' }))
      .status,
    400,
    'client realm cannot override membership',
  );
  const startId = crypto.randomUUID();
  const starts = await Promise.all([
    field(
      'field-start',
      { realm: 'commons', id: 'field-commons-0', direction: 'standard' },
      startId,
    ),
    field(
      'field-start',
      { realm: 'commons', id: 'field-commons-0', direction: 'standard' },
      startId,
    ),
  ]);
  assert.ok(
    starts.every((r) => [200, 409].includes(r.status)),
    JSON.stringify(starts),
  );
  let p = ok(await c.request('profile')).profile,
    run = p.facility.fieldWork.active;
  assert.ok(run);
  assert.notEqual(run.id, startId);
  assert.equal(p.xp, 200);
  assert.equal((await field('field-claim', { id: run.id })).status, 400);
  const scene = ok(
    await command('neighborhood-scene', { scene: 'home-' + login.profile.id }),
  );
  control.generation = scene.membership.generation;
  await wait(Math.max(0, run.checkAt - Date.now() + 100));
  ok(await field('field-answer', { id: run.id, answer: realmAnswer(run) }));
  p = ok(await c.request('profile')).profile;
  run = p.facility.fieldWork.active;
  assert.equal(run.state, 'processing');
  assert.equal(p.xp, 200);
  ok(await command('neighborhood-leave'));
  await wait(Math.max(0, run.readyAt - Date.now() + 150));
  const claimId = crypto.randomUUID();
  const claims = await Promise.all([
    field('field-claim', { id: run.id }, claimId),
    field('field-claim', { id: run.id }, claimId),
  ]);
  assert.ok(
    claims.every((r) => [200, 409].includes(r.status)),
    JSON.stringify(claims),
  );
  ok(await field('field-claim', { id: run.id }, claimId));
  const final = ok(await c.request('profile')).profile;
  assert.equal(final.xp, 212);
  assert.equal(final.facility.bank.scrap, 4);
  assert.equal(final.facility.bank.copper, 2);
  assert.equal(final.facility.fieldWork.active, null);
  assert.equal(final.facility.fieldWork.completed.commons, 1);
  assert.equal((await field('field-claim', { id: run.id })).status, 400);
});
