import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { newFacility, ITEMS } from '../lib/facility.ts';
import { commissionOffers } from '../lib/commissions.ts';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
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
      '.wrangler/state',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );
test('HTTP commissions: ownership, invalid batches, competing starts, frozen jobs and concurrent claims', async () => {
  const origin = new URL(
    process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
  );
  if (!['localhost', '127.0.0.1'].includes(origin.hostname))
    throw Error('Local fixtures only');
  const client = new Client(),
    login = ok(await client.login()),
    wallet = client.account.address.toLowerCase(),
    control = { clientId: crypto.randomUUID(), generation: 0 };
  const command = (name, extra = {}) =>
    client.request(name, client.body({ ...control, ...extra }));
  let membership = ok(
    await command('neighborhood-join', { realm: 'commons' }),
  ).membership;
  control.generation = membership.generation;
  const field = (type, rest = {}, requestId = crypto.randomUUID()) =>
    command('facility', { action: { type, requestId, ...rest } });
  const f = newFacility();
  f.builds = { 'rack-a': 3, 'rack-b': 3 };
  f.compute = 2000;
  f.inventory = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 50]));
  sql(
    `UPDATE players SET facility_state=${q(JSON.stringify(f))},facility_version=${f.version},credits=2000 WHERE wallet=${q(wallet)}`,
  );
  const offer = commissionOffers(f)[0];
  assert.equal(
    (
      await field('commission-start', {
        id: offer.id,
        rack: 'rack-a',
        quantity: 2,
      })
    ).status,
    403,
  );
  membership = ok(
    await command('neighborhood-scene', { scene: 'home-' + login.profile.id }),
  ).membership;
  control.generation = membership.generation;
  assert.equal(
    (
      await field('commission-start', {
        id: offer.id,
        rack: 'rack-a',
        quantity: 1.5,
      })
    ).status,
    400,
  );
  const competing = await Promise.all([
    field('commission-start', { id: offer.id, rack: 'rack-a', quantity: 2 }),
    field('commission-start', { id: offer.id, rack: 'rack-b', quantity: 2 }),
  ]);
  assert.equal(
    competing.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(competing),
  );
  assert.ok(competing.every((r) => [200, 400, 409].includes(r.status)));
  let p = ok(await client.request('profile')).profile;
  assert.equal(p.facility.commissions.active.length, 1);
  const run = p.facility.commissions.active[0];
  assert.equal(p.credits, 2000 - run.fee);
  assert.equal(p.facility.inventory.silicon, 50 - run.cost.silicon);
  assert.equal((await field('commission-claim', { id: run.id })).status, 400);
  // Test-owned fixture advances only the new booking clock, never another player's state.
  run.startedAt = Date.now() - 100000;
  run.readyAt = Date.now() - 1000;
  sql(
    `UPDATE players SET facility_state=${q(JSON.stringify(p.facility))} WHERE wallet=${q(wallet)}`,
  );
  const before = p.credits;
  await command('neighborhood-leave');
  const claims = await Promise.all([
    field('commission-claim', { id: run.id }),
    field('commission-claim', { id: run.id }),
  ]);
  assert.equal(
    claims.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(claims),
  );
  assert.ok(claims.every((r) => [200, 400, 409].includes(r.status)));
  p = ok(await client.request('profile')).profile;
  assert.equal(p.credits, before + run.reward);
  assert.equal(p.facility.commissions.completed.fast, 1);
  assert.equal(p.facility.commissions.active.length, 0);
  assert.equal(p.facility.daily.computeEarned, run.reward);
  assert.equal((await field('commission-claim', { id: run.id })).status, 400);
});
