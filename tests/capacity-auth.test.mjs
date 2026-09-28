import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertFreshCapacityAccounts,
  authenticateCapacityActor,
} from '../scripts/capacity-auth.mjs';

const minute = {
  status: 429,
  data: { error: 'A little too fast. Please try again in a minute.' },
};
const success = { status: 200, data: { profile: { id: 'test-center' } } };
const run = (request, extras = {}) =>
  authenticateCapacityActor({
    address: 'generated-test-address',
    request,
    sign: async (message) => `signed:${message}`,
    sleep: async () => {},
    now: () => 59900,
    ...extras,
  });

void test('capacity authentication ordinary success signs the current nonce', async () => {
  const calls = [];
  const profile = await run(async (action, body) => {
    calls.push([action, body]);
    return action === 'nonce'
      ? { status: 200, data: { message: 'nonce-one' } }
      : success;
  });
  assert.deepEqual(profile, success.data.profile);
  assert.deepEqual(
    calls.map(([action]) => action),
    ['nonce', 'verify'],
  );
  assert.equal(calls[1][1].signature, 'signed:nonce-one');
});

void test('verification throttle obtains a fresh nonce even when the prior nonce was consumed', async () => {
  const calls = [],
    consumed = new Set(),
    sleeps = [];
  let nonce = 0;
  const profile = await run(
    async (action, body) => {
      calls.push([action, body]);
      if (action === 'nonce')
        return { status: 200, data: { message: `nonce-${++nonce}` } };
      if (consumed.has(body.signature))
        return { status: 401, data: { error: 'Already consumed' } };
      consumed.add(body.signature);
      return consumed.size === 1 ? minute : success;
    },
    { sleep: async (ms) => sleeps.push(ms) },
  );
  assert.deepEqual(profile, success.data.profile);
  assert.deepEqual(
    calls.map(([action]) => action),
    ['nonce', 'verify', 'nonce', 'verify'],
  );
  assert.deepEqual([...consumed], ['signed:nonce-1', 'signed:nonce-2']);
  assert.deepEqual(sleeps, [300]);
});

void test('nonce minute throttle retries before signing', async () => {
  let requests = 0,
    signs = 0;
  await run(
    async (action) => {
      requests++;
      if (requests === 1) return minute;
      return action === 'nonce'
        ? { status: 200, data: { message: 'fresh' } }
        : success;
    },
    {
      sign: async () => {
        signs++;
        return 'signature';
      },
    },
  );
  assert.equal(requests, 3);
  assert.equal(signs, 1);
});

void test('daily signup limits, unknown429 and consumed401 are terminal without delay or retry', async () => {
  const errors = [
    [
      429,
      'This browser has opened its three new centers for the last 24 hours. Existing centers can still sign in.',
    ],
    [
      429,
      'Too many new centers have been opened on this network in the last 24 hours. Existing centers can still sign in.',
    ],
    [429, 'Unknown throttle'],
    [401, 'This login message was already used. Connect again.'],
    [503, minute.data.error],
  ];
  for (const [status, error] of errors) {
    let requests = 0,
      sleeps = 0;
    await assert.rejects(
      run(
        async (action) => {
          requests++;
          return action === 'nonce'
            ? { status: 200, data: { message: 'one' } }
            : { status, data: { error } };
        },
        {
          sleep: async () => {
            sleeps++;
          },
        },
      ),
      (failure) => failure.message.includes(error),
    );
    assert.equal(requests, 2);
    assert.equal(sleeps, 0);
  }
  let calls = 0;
  await assert.rejects(
    run(async () => {
      calls++;
      return { status: 429, data: { error: 'Unknown nonce throttle' } };
    }),
    /Unknown nonce throttle/,
  );
  assert.equal(calls, 1);
});

void test('minute throttle exhaustion is bounded and does not wait after the last attempt', async () => {
  let requests = 0,
    sleeps = 0;
  await assert.rejects(
    run(
      async () => {
        requests++;
        return minute;
      },
      {
        sleep: async () => {
          sleeps++;
        },
      },
    ),
    /three attempts/,
  );
  assert.equal(requests, 3);
  assert.equal(sleeps, 2);
});

void test('oversized fresh capacity plan refuses before any request or key allocation', () => {
  assert.doesNotThrow(() => assertFreshCapacityAccounts(20));
  assert.throws(() => assertFreshCapacityAccounts(21), /20 new centers/);
  const preload = `globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK')}; crypto.randomUUID=()=>{throw Error('UNEXPECTED_ALLOCATION')}; crypto.subtle.generateKey=()=>{throw Error('UNEXPECTED_KEY')};`;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,' + encodeURIComponent(preload),
      fileURLToPath(
        new URL('../scripts/smoke-cloudflare-capacity.mjs', import.meta.url),
      ),
    ],
    {
      env: {
        ...process.env,
        NOOBIUS_TEST_ORIGIN:
          'https://noobius-game-staging.rinkydooonso.workers.dev',
        NOOBIUS_LOAD_ROOMS: '9',
        NOOBIUS_LOAD_SECONDS: '30',
        NOOBIUS_LOAD_WALK: 'full-speed',
        NOOBIUS_DIAGNOSE_SOCKET: '0',
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /45 accounts, exceeding the 20/);
  assert.doesNotMatch(
    result.stderr,
    /UNEXPECTED_NETWORK|UNEXPECTED_ALLOCATION|UNEXPECTED_KEY/,
  );
});
