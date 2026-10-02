import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeControls, maintenanceResponse } from '../lib/operations.ts';
import worker from '../services/payment-recovery/worker.ts';
test('maintenance is explicit and signals a retryable uncached outage', async () => {
  for (const value of [undefined, false, true, 'false', '1', 'TRUE'])
    assert.equal(
      runtimeControls({ NOOBIUS_MAINTENANCE: value }).maintenance,
      false,
    );
  assert.equal(
    runtimeControls({ NOOBIUS_MAINTENANCE: 'true' }).maintenance,
    true,
  );
  const response = maintenanceResponse();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).code, 'MAINTENANCE');
});
test('recovery worker does not query, settle or broadcast while its database is in maintenance', async (t) => {
  const original = console.log,
    events = [];
  console.log = (text) => events.push(JSON.parse(text));
  t.after(() => {
    console.log = original;
  });
  await worker.scheduled(
    {},
    {
      NOOBIUS_MAINTENANCE: 'true',
      DB: {
        prepare: () => {
          throw Error('Database must stay untouched');
        },
      },
    },
  );
  assert.deepEqual(events, [
    { event: 'compute-payment-recovery-paused', reason: 'maintenance' },
  ]);
});
