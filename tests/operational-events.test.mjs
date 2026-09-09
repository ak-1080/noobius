import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationalRecord,
  emitOperationalEvent,
} from '../lib/operational-events.ts';
const event = 'room-outbox-retry';
const recoveryId = '12345678-1234-4abc-8def-123456789abc';
const secret = 'SYNTHETIC_SECRET_SENTINEL';
test('operational fields are preserved without mutating the input', () => {
  const input = Object.freeze({
    event,
    recoveryId,
    phase: 'checkpoint',
    reason: 'http',
    checkpoint: 'confirmed',
    release: 'terminal',
    outcome: 'unavailable',
    status: 503,
    attempt: 2,
    delayMs: 2000,
    durationMs: 7,
    ageMs: 8000,
    pendingAtLeast: 3,
    limit: 64,
  });
  assert.deepEqual(operationalRecord(input), input);
});
test('operational records drop secrets without traversing unrelated values or serializers', () => {
  const input = {
    event,
    wallet: secret,
    grant: secret,
    ticket: secret,
    token: secret,
    authorization: secret,
    cookie: secret,
    rpcUrl: secret,
    request: { body: secret },
    authority: { secret },
    error: new Error(secret),
    stack: secret,
    toJSON() {
      throw new Error(secret);
    },
    get unrelated() {
      throw new Error(secret);
    },
  };
  assert.deepEqual(operationalRecord(input), { event });
  assert.equal(
    JSON.stringify(operationalRecord(input)).includes(secret),
    false,
  );
});
test('operational measurements clamp finite values and omit invalid values', () => {
  for (const [key, max] of Object.entries({
    attempt: 1000,
    delayMs: 30000,
    durationMs: 600000,
    ageMs: 86400000,
    pendingAtLeast: 64,
    limit: 64,
  })) {
    for (const [value, expected] of [
      [-1, 0],
      [0, 0],
      [1.9, 1],
      [max, max],
      [max + 1, max],
      [Number.MAX_VALUE, max],
    ])
      assert.deepEqual(
        operationalRecord({ event, [key]: value }),
        { event, [key]: expected },
        key,
      );
    for (const value of [
      undefined,
      null,
      true,
      '7',
      [],
      {},
      7n,
      Symbol('number'),
      NaN,
      Infinity,
      -Infinity,
      {
        valueOf() {
          throw new Error(secret);
        },
      },
    ])
      assert.deepEqual(
        operationalRecord({ event, [key]: value }),
        { event },
        key,
      );
  }
});
test('operational labels allow only known events and enum values', () => {
  for (const value of ['', secret, '__proto__', undefined, null, 1, {}, []])
    assert.equal(operationalRecord({ event: value }), null);
  for (const key of ['phase', 'reason', 'checkpoint', 'release', 'outcome'])
    for (const value of [secret, '__proto__', '', null, true, 1, {}, []])
      assert.deepEqual(
        operationalRecord({ event, [key]: value }),
        { event },
        key,
      );
});
test('correlations require exact UUIDv4 and HTTP statuses must be integers', () => {
  assert.deepEqual(operationalRecord({ event, recoveryId }), {
    event,
    recoveryId,
  });
  for (const value of [
    secret,
    recoveryId.toUpperCase(),
    ' ' + recoveryId,
    recoveryId + '\n',
    recoveryId.slice(1),
    recoveryId.replace('-4abc-', '-1abc-'),
    recoveryId.replace('-8def-', '-7def-'),
    null,
    1,
    {},
  ])
    assert.deepEqual(operationalRecord({ event, recoveryId: value }), {
      event,
    });
  for (const status of [100, 200, 599])
    assert.deepEqual(operationalRecord({ event, status }), { event, status });
  for (const status of [
    99,
    600,
    -1,
    200.5,
    NaN,
    Infinity,
    -Infinity,
    '200',
    null,
    undefined,
    true,
    {},
    200n,
  ])
    assert.deepEqual(operationalRecord({ event, status }), { event });
});
test('logging emits sanitized JSON and remains best effort', (t) => {
  const info = t.mock.method(console, 'info', () => {});
  emitOperationalEvent({ event, grant: secret });
  assert.equal(info.mock.callCount(), 1);
  assert.deepEqual(info.mock.calls[0].arguments, [JSON.stringify({ event })]);
  emitOperationalEvent({ event: secret });
  assert.equal(info.mock.callCount(), 1);
  info.mock.mockImplementation(() => {
    throw new Error(secret);
  });
  assert.doesNotThrow(() => emitOperationalEvent({ event }));
  assert.doesNotThrow(() => emitOperationalEvent(null));
  assert.doesNotThrow(() =>
    emitOperationalEvent({
      get event() {
        throw new Error(secret);
      },
    }),
  );
});
test('every operational value emitted is the value that passed validation', () => {
  for (const [key, value] of Object.entries({
    event,
    recoveryId,
    phase: 'checkpoint',
    reason: 'http',
    checkpoint: 'confirmed',
    release: 'terminal',
    outcome: 'grace',
    status: 503,
    attempt: 2,
  })) {
    let reads = 0;
    const input = { event };
    Object.defineProperty(input, key, {
      get: () => (++reads === 1 ? value : secret),
    });
    assert.deepEqual(operationalRecord(input), { event, [key]: value }, key);
    assert.equal(reads, 1, key);
  }
});
