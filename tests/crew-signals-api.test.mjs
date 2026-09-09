import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
import { qaSql, sqlQuote } from './room-qa-db.mjs';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
test('real authenticated room metadata carries scene-bound, moderated crew signals', async () => {
  const a = new Client(),
    b = new Client(),
    c = new Client();
  const clients = [a, b, c];
  const room = crypto.randomUUID().replaceAll('-', '');
  qaSql(
    `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${sqlQuote(room)},'commons',0,${Date.now()})`,
  );
  for (const client of clients) {
    client.id = ok(await client.login()).profile.id;
    client.controller = { clientId: crypto.randomUUID(), generation: 0 };
    client.command = (action, args = {}) =>
      client.request(action, client.body({ ...client.controller, ...args }));
  }
  try {
    for (const client of [a, b]) {
      const joined = ok(
        await client.command('neighborhood-join', {
          realm: 'commons',
          target: room,
        }),
      );
      client.controller.generation = joined.membership.generation;
    }
    const other = ok(
      await c.command('neighborhood-join', { realm: 'commons' }),
    );
    c.controller.generation = other.membership.generation;
    // Force the third generated player into another compatible neighborhood if admission picked our room.
    if (other.membership.neighborhoodId === room) {
      const separate = crypto.randomUUID().replaceAll('-', '');
      qaSql(
        `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES (${sqlQuote(separate)},'commons',0,${Date.now()})`,
      );
      const moved = ok(
        await c.command('neighborhood-join', {
          realm: 'commons',
          target: separate,
        }),
      );
      c.controller.generation = moved.membership.generation;
    }
    const baseline = ok(await b.command('neighborhood-state'));
    assert.equal(baseline.signals.items.length, 0);
    assert.equal((await a.command('message', { ping: 'bad' })).status, 400);
    assert.equal(
      (await a.command('message', { ping: 'wave', generation: 9999 })).status,
      409,
    );
    assert.equal(
      (
        await a.command('message', {
          ping: 'wave',
          expectedWallet: b.account.address.toLowerCase(),
        })
      ).status,
      401,
    );
    ok(await a.command('message', { ping: 'wave', scene: 'forged' }));
    assert.equal((await a.command('message', { ping: 'thanks' })).status, 429);
    const packet = ok(await b.command('neighborhood-state')).signals;
    assert.equal(packet.items.length, 1);
    assert.equal(packet.items[0].author, a.id);
    assert.equal(packet.items[0].scene, 'commons');
    assert.equal(
      ok(await c.command('neighborhood-state')).signals.items.length,
      0,
    );
    const moved = ok(
      await a.command('neighborhood-scene', { scene: 'home-' + a.id }),
    );
    a.controller.generation = moved.membership.generation;
    const after = ok(await b.command('neighborhood-state'));
    assert.equal(after.signals.items[0].scene, 'commons');
    assert.equal(
      after.people.some((p) => p.id === a.id),
      false,
    );
    assert.equal(after.neighbors.length, 2);
    ok(
      await b.command('social-preference', {
        target: a.id,
        kind: 'mute',
        enabled: true,
      }),
    );
    assert.equal(
      ok(await b.command('neighborhood-state')).signals.items.length,
      0,
    );
    ok(
      await b.command('social-preference', {
        target: a.id,
        kind: 'mute',
        enabled: false,
      }),
    );
    assert.equal(
      ok(await b.command('neighborhood-state')).signals.items.length,
      1,
    );
    ok(
      await a.command('social-preference', {
        target: b.id,
        kind: 'block',
        enabled: true,
      }),
    );
    assert.equal(
      ok(await b.command('neighborhood-state')).signals.items.length,
      0,
    );
  } finally {
    for (const client of clients)
      await client.command('neighborhood-leave').catch(() => {});
  }
});
