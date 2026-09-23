import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEmptyPaymentDrain } from '../scripts/check-payment-drain.mjs';

test('paused deployment accepts an authoritative zero unsettled-payment count', () => {
  assert.doesNotThrow(() =>
    assertEmptyPaymentDrain('[{"results":[{"count":0}],"success":true}]', 'Staging'),
  );
});

test('paused deployment refuses unsettled payments and malformed Cloudflare replies', () => {
  assert.throws(
    () => assertEmptyPaymentDrain('[{"results":[{"count":2}],"success":true}]', 'Staging'),
    /2 unsettled payment/,
  );
  for (const reply of ['', '{}', '[{"results":[{}]}]', '[{"results":[{"count":"0"}]}]', '[{"results":[{"count":0}],"success":false}]'])
    assert.throws(() => assertEmptyPaymentDrain(reply, 'Staging'), /refusing to deploy/);
});
