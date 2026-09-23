import assert from 'node:assert/strict';
import test from 'node:test';
import { rateCountWithRetry } from '../lib/rate-limit-db.ts';

test('rate counter passes through a successful write once', async () => {
  let calls = 0;
  assert.equal(await rateCountWithRetry(async () => ++calls), 1);
  assert.equal(calls, 1);
});

test('one ambiguous provider failure retries without bypassing the counter', async () => {
  let calls = 0;
  const waits = [];
  assert.equal(
    await rateCountWithRetry(
      async () => {
        calls++;
        if (calls === 1) throw Error('D1 temporarily unavailable');
        return calls;
      },
      async (ms) => waits.push(ms),
    ),
    2,
  );
  assert.equal(calls, 2);
  assert.deepEqual(waits, [40]);
});

test('a repeated failure stays closed and a quota failure is not retried', async () => {
  let calls = 0;
  const unavailable = Error('D1 unavailable');
  await assert.rejects(
    rateCountWithRetry(
      async () => {
        calls++;
        throw unavailable;
      },
      async () => {},
    ),
    unavailable,
  );
  assert.equal(calls, 2);

  calls = 0;
  const quota = Error("D1_ERROR: exceeded D1's free tier daily row read limit");
  await assert.rejects(
    rateCountWithRetry(async () => {
      calls++;
      throw quota;
    }),
    quota,
  );
  assert.equal(calls, 1);
});
