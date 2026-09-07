import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const facility = (c, type, extras = {}, requestId = crypto.randomUUID()) =>
  c.request('facility', c.body({ action: { type, ...extras, requestId } }));
test('D1 campus progression, escrow, competing buyers, cancellation, and claim idempotency', async () => {
  const seller = new Client(),
    a = new Client(),
    b = new Client();
  for (const c of [seller, a, b]) {
    ok(await c.login());
    assert.deepEqual(
      ok(await c.request('profile')).profile.facility.inventory,
      {},
    );
    ok(await facility(c, 'gather', { id: 'scrap-a' }));
    ok(await facility(c, 'claim', { id: 'welcome' }));
  }
  assert.equal(
    (await facility(seller, 'gather', { id: 'scrap-a' })).status,
    400,
  );
  assert.equal(
    (await facility(seller, 'buy', { item: 'core', quantity: 50 })).status,
    400,
  );
  assert.equal(
    (await facility(seller, 'gather', { id: 'core-a' })).status,
    400,
  );
  assert.equal(
    (await seller.request('listing-buy', seller.body())).status,
    400,
  );
  for (const n of [0, -1, 51, 1.25])
    assert.equal(
      (
        await seller.request(
          'listing-create',
          seller.body({
            item: 'scrap',
            quantity: n,
            price: 10,
            requestId: crypto.randomUUID(),
          }),
        )
      ).status,
      400,
    );
  const id = crypto.randomUUID(),
    payload = seller.body({
      item: 'scrap',
      quantity: 2,
      price: 10,
      requestId: id,
    });
  const created = await Promise.all([
    seller.request('listing-create', payload),
    seller.request('listing-create', payload),
  ]);
  assert.ok(
    created.every((r) => [200, 409].includes(r.status)),
    JSON.stringify(created),
  );
  ok(await seller.request('listing-create', payload));
  assert.equal(
    ok(await seller.request('profile')).profile.facility.inventory.scrap,
    3,
  );
  assert.ok(
    ok(await seller.request('listings')).listings.some((l) => l.id === id),
  );
  assert.equal((await a.request('listing-cancel', a.body({ id }))).status, 409);
  const race = await Promise.all([
    a.request('listing-buy', a.body({ id })),
    b.request('listing-buy', b.body({ id })),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const sa = ok(await a.request('profile')).profile,
    sb = ok(await b.request('profile')).profile,
    sp = ok(await seller.request('profile')).profile;
  assert.equal(sa.credits + sb.credits, 40);
  assert.equal(sa.facility.inventory.scrap + sb.facility.inventory.scrap, 12);
  assert.equal(sp.credits, 35);
  assert.equal((await a.request('listing-buy', a.body({ id }))).status, 409);
  assert.equal(ok(await seller.request('profile')).profile.credits, 35);
  const cancelId = crypto.randomUUID();
  ok(
    await seller.request(
      'listing-create',
      seller.body({
        item: 'scrap',
        quantity: 1,
        price: 10,
        requestId: cancelId,
      }),
    ),
  );
  const cancelRace = await Promise.all([
    seller.request('listing-cancel', seller.body({ id: cancelId })),
    a.request('listing-buy', a.body({ id: cancelId })),
  ]);
  assert.equal(cancelRace.filter((r) => r.status === 200).length, 1);
  const sellerAfter = ok(await seller.request('profile')).profile;
  if (cancelRace[0].status === 200) {
    assert.equal(sellerAfter.facility.bank.scrap, 1);
    assert.equal(sellerAfter.credits, 35);
  } else assert.equal(sellerAfter.credits, 45);
  ok(await facility(seller, 'gather', { id: 'scrap-c' }));
  ok(await facility(seller, 'gather', { id: 'copper-a' }));
  const craftId = crypto.randomUUID();
  const craft = await Promise.all([
    facility(seller, 'craft', { id: 'kit' }, craftId),
    facility(seller, 'craft', { id: 'kit' }, craftId),
  ]);
  assert.ok(craft.every((r) => [200, 409].includes(r.status)));
  ok(await facility(seller, 'craft', { id: 'kit' }, craftId));
  assert.equal((await facility(seller, 'collect')).status, 400);
  await delay(5100);
  ok(await facility(seller, 'collect'));
  const claimId = crypto.randomUUID(),
    claims = await Promise.all([
      facility(seller, 'claim', { id: 'maker' }, claimId),
      facility(seller, 'claim', { id: 'maker' }, claimId),
    ]);
  assert.ok(claims.every((r) => [200, 409].includes(r.status)));
  ok(await facility(seller, 'claim', { id: 'maker' }, claimId));
  const saved = ok(await seller.request('profile')).profile;
  assert.equal(saved.credits, sellerAfter.credits + 35);
  assert.equal(saved.facility.inventory.kit, 1);
  assert.equal(saved.facility.stats.crafted, 1);
  assert.equal(saved.facility.claims.filter((c) => c === 'maker').length, 1);
  const bankId = crypto.randomUUID();
  ok(
    await facility(
      seller,
      'bank',
      { item: 'kit', quantity: 1, direction: 'deposit' },
      bankId,
    ),
  );
  ok(
    await facility(
      seller,
      'bank',
      { item: 'kit', quantity: 1, direction: 'deposit' },
      bankId,
    ),
  );
  const banked = ok(await seller.request('profile')).profile.facility;
  assert.equal(banked.bank.kit, 1);
  assert.equal(banked.inventory.kit, 0);
  const reload = new Client(seller.account);
  reload.cookies = new Map(seller.cookies);
  assert.deepEqual(
    ok(await reload.request('profile')).profile.facility,
    banked,
  );
  ok(await seller.request('presence', seller.body({ x: 1.5, z: 17 })));
  assert.ok(
    ok(await a.request('campus')).people.some(
      (p) =>
        p.id === seller.account.address.toLowerCase().slice(2, 18) &&
        p.x === 1.5,
    ),
  );
  assert.equal(
    (await seller.request('presence', seller.body({ x: 9999, z: 0 }))).status,
    400,
  );
  assert.equal(
    (await seller.request('message', seller.body({ message: 'x'.repeat(181) })))
      .status,
    400,
  );
});
