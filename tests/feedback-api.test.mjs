import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from './api-client.mjs';

test('D1 returns action-specific receipts after commit and suppresses them on a retry', async () => {
  const client = new Client();
  await client.login();
  const requestId = crypto.randomUUID();
  const body = client.body({
    action: { type: 'build', id: 'rack-a', requestId },
  });
  const first = await client.request('facility', body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.actionApplied, true);
  assert.equal(first.data.receipt.requestId, requestId);
  assert.match(
    first.data.receipt.detail,
    /Free starter built · 0 → 24 Compute \/ min/,
  );
  const retry = await client.request('facility', body);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.actionApplied, false);
  assert.equal(retry.data.receipt, null);
  assert.equal(retry.data.profile.facility.builds['rack-a'], 1);

  await new Promise((resolve) => setTimeout(resolve, 15500));
  const collected = await client.request(
    'facility',
    client.body({
      action: { type: 'compute-harvest', requestId: crypto.randomUUID() },
    }),
  );
  assert.equal(collected.status, 200, JSON.stringify(collected.data));
  assert.equal(collected.data.actionApplied, true);
  assert.ok(collected.data.profile.credits >= 6);
  assert.match(
    collected.data.receipt.detail,
    new RegExp('^\\+' + collected.data.profile.credits + ' Compute'),
  );
});
