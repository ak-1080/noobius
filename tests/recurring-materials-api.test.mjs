import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { OBJECTS } from '../lib/facility.ts';
import { contractFor } from '../lib/contracts.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):3003$/.test(origin))
  throw new Error(
    'Material QA requires isolated port3003 and .wrangler/qa-dispatch.',
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
test('authenticated Worker resolves recipe inputs and saved offer terms, with once-only collection', async () => {
  const c = new Client();
  let p = ok(await c.login()).profile;
  const wallet = c.account.address.toLowerCase();
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
      c.body({ ...world, scene: 'home-' + p.id }),
    ),
  ).membership.generation;
  const bench = OBJECTS.find((o) => o.id === 'workbench');
  const seed = (f) =>
    sql(
      `UPDATE players SET facility_state=${q(JSON.stringify(f))} WHERE wallet=${q(wallet)}`,
    );
  const touch = () =>
    sql(
      `UPDATE crew_presence SET x=${bench.x},z=${bench.z},updated_at=${Date.now()},lease_until=${Date.now() + 60000} WHERE wallet=${q(wallet)}`,
    );
  const act = (action) =>
    c.request(
      'facility',
      c.body({
        ...world,
        action: { requestId: crypto.randomUUID(), ...action },
      }),
    );
  p = ok(await c.request('profile')).profile;
  const f = p.facility;
  f.inventory = { scrap: 4, fiber: 2, core: 1, kit: 1, board: 1, battery: 1 };
  f.skills.engineering = 20;
  f.unlocked = [
    'commons',
    'salvage',
    'workshop',
    'thermal',
    'compute',
    'network',
  ];
  seed(f);
  touch();
  assert.equal(
    (await act({ type: 'craft', id: 'board', variant: 'recovered' })).status,
    400,
  );
  f.unlocked.push('core');
  seed(f);
  touch();
  assert.equal(
    (await act({ type: 'craft', id: 'pump', variant: 'recovered' })).status,
    400,
  );
  const started = ok(
    await act({
      type: 'craft',
      id: 'board',
      variant: 'recovered',
      cost: {},
      seconds: 0,
    }),
  ).profile.facility;
  assert.equal(started.craft.readyAt - started.craft.startedAt, 8000);
  assert.equal(started.inventory.scrap, 0);
  assert.equal(started.inventory.fiber, 0);
  assert.equal(started.inventory.core, 0);
  assert.equal(
    (await act({ type: 'collect', id: started.craft.id })).status,
    400,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, started.craft.readyAt - Date.now()) + 30),
  );
  touch();
  const collected = ok(await act({ type: 'collect', id: started.craft.id }))
    .profile.facility;
  assert.equal(collected.inventory.board, 2);
  assert.equal(
    (await act({ type: 'collect', id: started.craft.id })).status,
    400,
  );
  const offer = collected.career.offers.find(
    (o) => contractFor(o).family === 'supply',
  );
  offer.template = 'field-stock';
  delete offer.termsVersion;
  seed(collected);
  touch();
  const accepted = ok(await act({ type: 'contract-accept', id: offer.id }))
    .profile.facility;
  assert.equal(accepted.career.active[0].termsVersion, undefined);
  assert.equal(accepted.career.active[0].quoteVersion, 2);
  const dispatched = ok(await act({ type: 'contract-start', id: offer.id }))
    .profile.facility;
  assert.deepEqual(dispatched.career.active[0].cost, {
    kit: 1,
    board: 1,
    battery: 1,
  });
  assert.equal(dispatched.career.active[0].reward, 340);
});
