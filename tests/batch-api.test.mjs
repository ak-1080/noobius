import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { OBJECTS } from '../lib/facility.ts';
import { contractTemplate } from '../lib/contracts.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):3003$/.test(origin))
  throw new Error(
    'Batch migration fixtures require isolated port3003 and .wrangler/qa-dispatch.',
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

test('wallet migration races preserve overflow; batch starts commit supplies and frozen terms once', async () => {
  const c = new Client();
  const original = ok(await c.login()).profile;
  const wallet = c.account.address.toLowerCase();
  const f = original.facility;
  delete f.productionVersion;
  f.builds = { 'rack-a': 3, 'rack-g': 3 };
  f.computeBoost = 5;
  f.storedCompute = 408240;
  f.computeAt = Date.now() - 60000;
  f.career.completed = { service: 20, supply: 20, workload: 20 };
  f.career.modules = ['fast', 'stable'];
  f.career.loadout = ['fast', 'stable'];
  f.inventory = { board: 30, silicon: 90, copper: 30 };
  f.bank = { kit: 4 };
  const offer = f.career.offers.find(
    (o) => contractTemplate(o.template).family === 'workload',
  );
  offer.template = 'wobbly-training';
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(f))},credits=1000 WHERE wallet=${quote(wallet)}`,
  );
  const profiles = await Promise.all(
    Array.from({ length: 3 }, () => c.request('profile')),
  );
  for (const response of profiles) {
    const p = ok(response).profile;
    assert.equal(p.credits, 1000);
    assert.equal(p.facility.productionVersion, 2);
    assert.equal(p.facility.storedCompute, 408240);
    assert.deepEqual(p.facility.inventory, f.inventory);
    assert.deepEqual(p.facility.bank, f.bank);
  }
  const world = { clientId: crypto.randomUUID(), generation: 0 };
  world.generation = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...world, realm: 'commons' }),
    ),
  ).membership.generation;
  world.generation = ok(
    await c.request(
      'neighborhood-scene',
      c.body({ ...world, scene: 'home-' + original.id }),
    ),
  ).membership.generation;
  const action = (type, fields = {}, requestId = crypto.randomUUID()) =>
    c.request(
      'facility',
      c.body({ ...world, action: { type, ...fields, requestId } }),
    );
  const harvest = await Promise.all([
    action('compute-harvest'),
    action('compute-harvest'),
  ]);
  assert.equal(harvest.filter((r) => r.status === 200).length, 1);
  assert.ok(
    harvest.every((r) => [200, 400, 409].includes(r.status)),
    JSON.stringify(harvest),
  );
  let p = ok(await c.request('profile')).profile;
  assert.equal(p.credits, 409240);
  assert.equal(p.facility.storedCompute, 0);
  ok(await action('contract-accept', { id: offer.id }));
  assert.equal(
    (
      await action('contract-start', {
        id: offer.id,
        rack: 'rack-a',
        quantity: 30,
        direction: 'fast',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await action('contract-start', {
        id: offer.id,
        rack: 'rack-g',
        quantity: null,
        direction: 'fast',
      })
    ).status,
    400,
  );
  const starts = await Promise.all([
    action('contract-start', {
      id: offer.id,
      rack: 'rack-g',
      quantity: 30,
      direction: 'fast',
    }),
    action('contract-start', {
      id: offer.id,
      rack: 'rack-g',
      quantity: 30,
      direction: 'fast',
    }),
  ]);
  assert.equal(starts.filter((r) => r.status === 200).length, 1);
  assert.ok(
    starts.every((r) => [200, 400, 409].includes(r.status)),
    JSON.stringify(starts),
  );
  p = ok(await c.request('profile')).profile;
  assert.deepEqual(p.facility.inventory, { board: 0, silicon: 0, copper: 0 });
  const run = p.facility.career.active[0];
  assert.equal(run.quantity, 30);
  assert.equal(run.quoteVersion, 2);
  assert.equal(run.reward, 6696);
  assert.equal(p.credits, 409240);
  assert.equal((await action('contract-claim', { id: offer.id })).status, 400);
  // Advance only this isolated fixture's frozen clock to test real claim CAS.
  const ready = Date.now() - 1000;
  run.readyAt = ready;
  run.startedAt = ready - run.duration * 1000;
  run.acceptedAt = run.startedAt;
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet)}`,
  );
  const claims = await Promise.all([
    action('contract-claim', { id: offer.id }),
    action('contract-claim', { id: offer.id }),
  ]);
  assert.equal(claims.filter((r) => r.status === 200).length, 1);
  assert.ok(claims.every((r) => [200, 400, 409].includes(r.status)));
  p = ok(await c.request('profile')).profile;
  assert.equal(p.credits, 415936);
  assert.equal(p.facility.career.completed.workload, 21);
  assert.equal(p.facility.career.reportStyles.workload.fast, 1);
  assert.deepEqual(p.facility.bank, { kit: 4 });
  // Position and stock this generated QA account at the bench. Crafting and
  // collection still traverse authenticated home/proximity/transaction checks.
  const bench = OBJECTS.find((o) => o.id === 'workbench');
  p.facility.inventory = { scrap: 12, copper: 6 };
  p.facility.storage = 0;
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet)}; UPDATE crew_presence SET x=${bench.x},z=${bench.z},updated_at=${Date.now()} WHERE wallet=${quote(wallet)}`,
  );
  p = ok(await action('craft', { id: 'kit', quantity: 2 })).profile;
  const batchId = p.facility.craft.id;
  assert.equal(p.facility.craft.quantity, 2);
  assert.deepEqual(p.facility.inventory, { scrap: 0, copper: 0 });
  assert.equal((await action('collect', { id: batchId })).status, 400);
  p.facility.craft.readyAt = Date.now() - 1;
  p.facility.inventory = { scrap: 120 };
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet)}`,
  );
  assert.equal((await action('collect', { id: batchId })).status, 400);
  p.facility.inventory.scrap = 118;
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet)}; UPDATE crew_presence SET updated_at=${Date.now()} WHERE wallet=${quote(wallet)}`,
  );
  const pickups = await Promise.all([
    action('collect', { id: batchId }),
    action('collect', { id: batchId }),
  ]);
  assert.equal(pickups.filter((r) => r.status === 200).length, 1);
  assert.ok(
    pickups.every((r) => [200, 400, 409].includes(r.status)),
    JSON.stringify(pickups),
  );
  p = ok(await c.request('profile')).profile;
  assert.equal(p.facility.craft, null);
  assert.deepEqual(p.facility.inventory, { scrap: 118, kit: 2 });
  assert.equal(p.facility.stats.crafted, 2);
  assert.equal(p.credits, 415936);
});
