import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseQuotaResponse } from '../lib/service-unavailable.ts';

test('known D1 read/write quotas return a retryable outage without provider details', async () => {
  for (const kind of ['read', 'write']) {
    const error = new Error('request failed', {
      cause: new Error(
        `D1_ERROR: Your account has exceeded D1's free tier daily row ${kind} limit. private-provider-detail`,
      ),
    });
    const response = databaseQuotaResponse(error);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '60');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.equal(body.code, 'SERVICE_UNAVAILABLE');
    assert.match(body.error, /last confirmed save/);
    assert.doesNotMatch(
      JSON.stringify(body),
      /D1|private-provider-detail|paid plan/,
    );
  }
});

test('unknown errors and cyclic causes remain bounded and are not misclassified', () => {
  const cycle = new Error('unrelated');
  cycle.cause = cycle;
  for (const error of [
    cycle,
    null,
    'quota',
    new Error('D1_ERROR: SQL syntax error'),
    new Error("exceeded D1's free tier daily row read limit"),
  ])
    assert.equal(databaseQuotaResponse(error), null);
});
