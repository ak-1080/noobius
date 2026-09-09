import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('five authenticated players keep private centers, share a neighborhood, and retain earned bonuses after leaving', async () => {
  const origin = new URL(
    process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
  );
  if (!['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('Local fixtures only.');
  const crew = Array.from({ length: 6 }, () => new Client());
  for (const c of crew) {
    c.publicId = ok(await c.login()).profile.id;
    c.controller = { clientId: crypto.randomUUID(), generation: 0 };
    c.command = (action, args = {}) =>
      c.request(action, c.body({ ...c.controller, ...args }));
    c.join = async (target) => {
      const d = ok(
        await c.command('neighborhood-join', { realm: 'commons', target }),
      );
      c.controller.generation = d.membership.generation;
      c.membership = d.membership;
      return d;
    };
    c.scene = async (scene) => {
      const d = ok(await c.command('neighborhood-scene', { scene }));
      c.controller.generation = d.membership.generation;
      c.membership = d.membership;
      return d;
    };
    c.sync = async (position) => {
      const d = ok(
        await c.command('neighborhood-sync', {
          sequence: c.membership.sequence + 1,
          position,
        }),
      );
      c.membership = d.membership;
      return d;
    };
  }
  const [a, b, c, d, e, outside] = crew;
  const isolated = crypto.randomUUID().replaceAll('-', '');
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
      `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES ('${isolated}','commons',0,${Date.now()})`,
    ],
    { stdio: 'pipe' },
  );
  let first = await a.join(isolated);
  const room = first.membership.neighborhoodId;
  for (const player of [b, c, d, e]) await player.join(room);
  await outside.join();
  assert.equal(
    (
      await outside.command('neighborhood-join', {
        realm: 'commons',
        target: room,
      })
    ).status,
    409,
  );
  const snapshot = await a.sync({ x: 0, z: 17 });
  assert.equal(snapshot.neighbors.length, 5);
  assert.ok(snapshot.neighbors.every((n) => /^[a-f0-9]{32}$/.test(n.id)));
  assert.equal(
    JSON.stringify(snapshot).includes(a.account.address.toLowerCase()),
    false,
  );
  await b.scene('home-' + a.publicId);
  const visiting = ok(await b.request('visit?owner=' + a.publicId));
  assert.equal(visiting.facility.visiting, true);
  assert.equal(visiting.facility.compute, 0);
  assert.deepEqual(visiting.facility.inventory, {});
  assert.equal(
    (
      await outside.command('neighborhood-scene', {
        scene: 'home-' + a.publicId,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await b.command('facility', {
        action: { type: 'compute-harvest', requestId: crypto.randomUUID() },
      })
    ).status,
    403,
  );
  await b.scene('commons');
  assert.equal(
    (await a.command('presence', { room: 'campus-1', x: 0, z: 0 })).status,
    410,
  );
  const invalid = await a.sync({ x: 1000, z: 1000 });
  assert.equal(invalid.corrected, true);
  await wait(1600);
  assert.equal((await a.sync({ x: -2, z: 17 })).corrected, false);
  assert.equal((await b.sync({ x: 2, z: 17 })).corrected, false);
  first = await a.sync({ x: -2, z: 17 });
  const event = first.world.event;
  assert.ok(
    first.world.endsAt - Date.now() > 18000,
    'Rerun away from event boundary.',
  );
  const work = (p, station, finish = false) =>
    p.command('crew-work', { station, event, finish });
  ok(await work(a, 'power'));
  ok(await work(b, 'cooling'));
  assert.equal((await work(a, 'power', true)).status, 409);
  await wait(6100);
  const race = await Promise.all([
    work(a, 'power', true),
    work(a, 'power', true),
  ]);
  assert.equal(race.filter((r) => r.status === 200).length, 1);
  ok(await work(b, 'cooling', true));
  // Walk through the clear center aisle with elapsed server time.
  assert.equal((await c.sync({ x: 0, z: 12 })).corrected, false);
  ok(await work(c, 'network'));
  await wait(6100);
  ok(await work(c, 'network', true));
  ok(await d.command('message', { ping: 'wave' }));
  const wave = ok(await e.request('messages')).messages.find(
    (m) => m.author === d.publicId,
  );
  assert.ok(wave.message.includes('Hey, crew'));
  ok(
    await e.command('social-preference', {
      target: d.publicId,
      kind: 'mute',
      enabled: true,
    }),
  );
  ok(await d.command('name', { name: 'New shift name' }));
  assert.ok(
    !ok(await e.request('messages')).messages.some(
      (m) => m.author === d.publicId,
    ),
  );
  ok(
    await e.command('social-preference', {
      target: d.publicId,
      kind: 'mute',
      enabled: false,
    }),
  );
  ok(await e.command('report', { messageId: wave.id, reason: 'Spam' }));
  ok(
    await e.command('social-preference', {
      target: d.publicId,
      kind: 'block',
      enabled: true,
    }),
  );
  assert.notEqual(
    (await e.command('neighborhood-scene', { scene: 'home-' + d.publicId }))
      .status,
    200,
  );
  ok(
    await e.command('social-preference', {
      target: d.publicId,
      kind: 'block',
      enabled: false,
    }),
  );
  ok(await a.command('neighborhood-leave'));
  const claims = await Promise.all([
    a.command('crew-claim', { room, event }),
    a.command('crew-claim', { room, event }),
  ]);
  assert.equal(claims.filter((r) => r.status === 200).length, 1);
  assert.equal(ok(await a.request('profile')).profile.credits, 50);
  assert.equal(
    (await outside.command('crew-claim', { room, event })).status,
    409,
  );
  // Wrong client cannot control a player's active character.
  const stale = { ...b.controller };
  const replacement = crypto.randomUUID();
  const moved = ok(
    await b.request(
      'neighborhood-join',
      b.body({ realm: 'commons', clientId: replacement, takeover: true }),
    ),
  );
  assert.notEqual(moved.membership.generation, stale.generation);
  assert.equal(
    (await b.command('crew-work', { event, station: 'cooling' })).status,
    409,
  );
  b.controller = {
    clientId: replacement,
    generation: moved.membership.generation,
  };
  for (const player of [b, c, d, e, outside])
    ok(await player.command('neighborhood-leave'));
});
