// Fixture writes are restricted to local Wrangler state; never a hosted D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { contractFor } from '../lib/contracts.ts';
import { commissionOffers } from '../lib/commissions.ts';
import { CLIENT_DEMAND, clientDemandStatus } from '../lib/client-demand.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):3003$/.test(origin))
  throw Error(
    'Client-demand fixtures require isolated port 3003 and .wrangler/qa-dispatch.',
  );
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = (command) =>
  execFileSync(
    './node_modules/.bin/wrangler',
    [
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

test('D1 commits only one last booking under concurrent client starts and persists quota across login and other writes', async () => {
  const c = new Client();
  const original = ok(await c.login()).profile;
  const wallet = c.account.address.toLowerCase();
  const f = original.facility;
  assert.equal(f.productionVersion, 3);
  f.builds = { 'rack-a': 3, 'rack-b': 3 };
  f.inventory = { copper: 30, silicon: 30, scrap: 10 };
  const offer = f.career.offers.find(
    (o) => contractFor(o).family === 'workload',
  );
  offer.template = 'tiny-model';
  const at = Date.now();
  f.clientDemand = {
    version: 1,
    bookings: Array.from({ length: 11 }, (_, i) => ({
      kind: 'job',
      id: `prior-${String(i).padStart(3, '0')}`,
      at,
      reward: 100,
    })),
  };
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(f))},credits=9000 WHERE wallet=${quote(wallet)}`,
  );
  const profile = () => c.request('profile').then((r) => ok(r).profile);
  let p = await profile();
  assert.equal(
    p.credits,
    9000,
    'Server must use the isolated fixture database',
  );
  assert.equal(p.facility.clientDemand.bookings.length, 11);
  const world = { clientId: crypto.randomUUID(), generation: 0 };
  const command = (type, body) =>
    c.request(type, c.body({ ...world, ...body }));
  world.generation = ok(
    await command('neighborhood-join', { realm: 'commons' }),
  ).membership.generation;
  world.generation = ok(
    await command('neighborhood-scene', { scene: 'home-' + original.id }),
  ).membership.generation;
  const action = (a) => command('facility', { action: a });
  const request = (type, fields = {}) => ({
    type,
    requestId: crypto.randomUUID(),
    ...fields,
  });
  ok(await action(request('contract-accept', { id: offer.id })));
  const starts = [
    request('contract-start', { id: offer.id, rack: 'rack-a' }),
    request('commission-start', {
      id: commissionOffers(p.facility)[0].id,
      rack: 'rack-b',
    }),
  ];
  const race = await Promise.all(starts.map(action));
  assert.equal(
    race.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(race),
  );
  assert.ok(
    race.every((r) => [200, 400, 409].includes(r.status)),
    JSON.stringify(race),
  );
  const winner = race.findIndex((r) => r.status === 200);
  p = await profile();
  const ledger = structuredClone(p.facility.clientDemand);
  assert.equal(ledger.bookings.length, 12);
  assert.ok(
    ledger.bookings.some((entry) => entry.reward === (winner === 0 ? 56 : 140)),
  );
  const spent =
    winner === 0
      ? { copper: 30, silicon: 29, scrap: 10 }
      : { copper: 28, silicon: 29, scrap: 10 };
  // Tiny-model uses one chip; the competing commission also uses two copper.
  assert.deepEqual(p.facility.inventory, spent);
  assert.equal(p.credits, 9000 - (winner === 0 ? 0 : 6));
  ok(await action(starts[winner]));
  const denied = await action({
    ...starts[1 - winner],
    requestId: crypto.randomUUID(),
    clientDemand: { version: 1, bookings: [] },
    now: Date.now() + CLIENT_DEMAND.windowMs,
  });
  assert.equal(
    denied.status,
    400,
    'Client-supplied ledger or clock cannot reset server demand',
  );
  assert.deepEqual((await profile()).facility.clientDemand, ledger);
  // A separate inventory write, logout and signed login must carry the ledger.
  ok(
    await action(
      request('bank', { item: 'scrap', quantity: 1, direction: 'deposit' }),
    ),
  );
  ok(await c.request('logout', c.body()));
  p = ok(await c.login()).profile;
  assert.deepEqual(p.facility.clientDemand, ledger);
  assert.equal(clientDemandStatus(p.facility, Date.now()).remainingBookings, 0);
  // Move only the fixture's ledger back beyond the rolling window. Idle days
  // restore the same fixed allowance, not seven accumulated allowances.
  p.facility.clientDemand.bookings.forEach(
    (entry) => (entry.at = Date.now() - 7 * CLIENT_DEMAND.windowMs),
  );
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet)}`,
  );
  const restored = clientDemandStatus((await profile()).facility, Date.now());
  assert.equal(restored.remainingBookings, 12);
  assert.equal(restored.remainingCompute, 4000);
  ok(await c.request('logout', c.body()));
});
