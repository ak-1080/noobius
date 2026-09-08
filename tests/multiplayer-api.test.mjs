import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
import { execFileSync } from 'node:child_process';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
test('two players share a room, visit safely, repair together and cannot duplicate rewards', async () => {
  if (
    process.env.NOOBIUS_TEST_ORIGIN &&
    !process.env.NOOBIUS_TEST_ORIGIN.startsWith('http://localhost:')
  )
    throw new Error('This fixture is local only.');
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
      "DELETE FROM campus_work WHERE room='campus-3'",
    ],
    { stdio: 'pipe' },
  );
  const a = new Client(),
    b = new Client(),
    outsider = new Client();
  for (const c of [a, b, outsider]) ok(await c.login());
  const room = 'campus-3';
  const move = (c, x, z, r = room) =>
    c.request('presence', c.body({ x, z, room: r }));
  ok(await move(a, -4, 15));
  ok(await move(b, 4, 15));
  ok(await move(outsider, 0, 17, 'campus-2'));
  const snapshot = ok(await a.request('campus?room=' + room));
  assert.equal(snapshot.people.length, 2);
  assert.ok(
    !snapshot.people.some(
      (p) => p.id === outsider.account.address.toLowerCase().slice(2, 18),
    ),
  );
  let event = snapshot.world.event;
  if (snapshot.world.endsAt - Date.now() < 15000) {
    await wait(snapshot.world.endsAt - Date.now() + 100);
    event = ok(await a.request('campus?room=' + room)).world.event;
    ok(await move(a, -4, 15));
    ok(await move(b, 4, 15));
  }
  const work = (c, station, finish = false) =>
    c.request('crew-work', c.body({ room, event, station, finish }));
  assert.equal((await work(outsider, 'power')).status, 400);
  assert.equal((await work(a, 'network')).status, 400);
  const race = await Promise.all([work(a, 'power'), work(a, 'power')]);
  assert.equal(race.filter((r) => r.status === 200).length, 1);
  ok(await work(b, 'cooling'));
  assert.equal((await work(a, 'power', true)).status, 409);
  await wait(6100);
  const finished = await Promise.all([
    work(a, 'power', true),
    work(a, 'power', true),
  ]);
  assert.equal(finished.filter((r) => r.status === 200).length, 1);
  ok(await work(b, 'cooling', true));
  assert.equal(ok(await a.request('profile')).profile.credits, 20);
  assert.equal(
    (await a.request('crew-claim', a.body({ room, event }))).status,
    409,
  );
  ok(await move(a, 0, 7));
  ok(await work(a, 'network'));
  await wait(6100);
  ok(await move(a, 0, 7));
  ok(await work(a, 'network', true));
  const claims = await Promise.all([
    a.request('crew-claim', a.body({ room, event })),
    a.request('crew-claim', a.body({ room, event })),
  ]);
  assert.equal(claims.filter((r) => r.status === 200).length, 1);
  assert.equal(ok(await a.request('profile')).profile.credits, 70);
  ok(await move(b, 4, 15));
  ok(await b.request('crew-claim', b.body({ room, event })));
  assert.equal(ok(await b.request('profile')).profile.credits, 50);
  const owner = a.account.address.toLowerCase().slice(2, 18);
  const visit = ok(await b.request('visit?owner=' + owner));
  assert.equal(visit.facility.visiting, true);
  assert.equal(visit.facility.compute, 0);
  assert.deepEqual(visit.facility.inventory, {});
  const before = ok(await a.request('profile')).profile;
  ok(
    await b.request(
      'facility',
      b.body({
        owner,
        action: {
          type: 'accessory',
          id: 'cap',
          requestId: crypto.randomUUID(),
        },
      }),
    ),
  );
  assert.equal(
    ok(await a.request('profile')).profile.facility.accessory,
    before.facility.accessory,
  );
  assert.equal(
    (
      await b.request('facility', {
        expectedWallet: a.account.address.toLowerCase(),
        action: {
          type: 'accessory',
          id: 'cap',
          requestId: crypto.randomUUID(),
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await a.request(
        'crew-work',
        a.body({ room, event: event - 1, station: 'network', finish: true }),
      )
    ).status,
    409,
  );
});
