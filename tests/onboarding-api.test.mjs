import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';
test('wallet onboarding persists name and combined appearance across a new login', async () => {
  const a = new Client();
  const ok = (r) => {
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  ok(await a.login());
  ok(await a.request('name', a.body({ name: 'Onboarding QA' })));
  for (const [type, id] of [
    ['outfit', 'starter-blue'],
    ['accessory', 'cap'],
    ['intro', 'arrival'],
    ['intro', 'identity'],
  ])
    ok(
      await a.request(
        'facility',
        a.body({ action: { type, id, requestId: crypto.randomUUID() } }),
      ),
    );
  const b = new Client(a.account);
  ok(await b.login());
  const { profile } = ok(await b.request('profile'));
  assert.equal(profile.name, 'Onboarding QA');
  assert.equal(profile.facility.outfit, 'starter-blue');
  assert.equal(profile.facility.accessory, 'cap');
  assert.ok(profile.facility.seen.includes('intro:identity'));
});
