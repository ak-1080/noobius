import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openCapacityCohort,
  mergeCapacityCohorts,
} from '../scripts/capacity-cohort.mjs';
import { issueReturningSession } from '../lib/returning-login.ts';
import { database } from './sqlite-d1.mjs';
import {
  assertFreshCapacityAccounts,
  assertReturningCapacityServer,
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
        NOOBIUS_CAPACITY_COHORT_FILE: '',
        NOOBIUS_CAPACITY_COHORT_MODE: '',
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

const stageOrigin = 'https://noobius-game-staging.rinkydooonso.workers.dev';
const secretFingerprint = (contents) =>
  createHash('sha256').update(contents).digest('hex');
void test('returning cohorts require the Worker capability before attempting a signed login', () => {
  assert.doesNotThrow(() =>
    assertReturningCapacityServer({
      status: 'ok',
      service: 'noobius-game',
      returningLoginVersion: 1,
    }),
  );
  for (const value of [
    null,
    {},
    { status: 'ok', service: 'noobius-game' },
    { status: 'ok', service: 'noobius-game', returningLoginVersion: '1' },
    { status: 'ok', service: 'wrong', returningLoginVersion: 1 },
  ])
    assert.throws(
      () => assertReturningCapacityServer(value),
      /no authentication was attempted/,
    );
});
function fixture(t) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'noobius-cohort-unit-')));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const root = join(cwd, '.wrangler/capacity-cohorts');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const path = join(root, 'unit-generated.json');
  const open = (extra = {}) =>
    openCapacityCohort({
      path,
      origin: stageOrigin,
      count: 2,
      mode: 'returning',
      cwd,
      ...extra,
    });
  return { cwd, root, path, open };
}
async function registered(t, name = 'unit-generated.json') {
  const f = fixture(t);
  f.path = join(f.root, name);
  f.open = (extra) =>
    openCapacityCohort({
      path: f.path,
      origin: stageOrigin,
      count: 2,
      mode: 'returning',
      cwd: f.cwd,
      ...extra,
    });
  const writer = await f.open({ mode: 'create' });
  for (let i = 0; i < 2; i++) writer.register(i, (i + 1).toString().repeat(32));
  writer.close();
  return f;
}

void test('returning capacity authentication preserves the exact saved ID on every fresh challenge retry', async () => {
  const bodies = [];
  let n = 0;
  await run(
    async (action, body) => {
      if (action === 'nonce')
        return { status: 200, data: { message: `new-${++n}` } };
      bodies.push(body);
      return n === 1 ? minute : success;
    },
    { returningProfileId: 'a'.repeat(32) },
  );
  assert.deepEqual(
    bodies.map((b) => b.returningProfileId),
    ['a'.repeat(32), 'a'.repeat(32)],
  );
  assert.notEqual(bodies[0].signature, bodies[1].signature);
  let calls = 0;
  await assert.rejects(
    run(
      async (action) => {
        calls++;
        return action === 'nonce'
          ? { status: 200, data: { message: 'challenge' } }
          : { status: 409, data: { error: 'Registered save is missing' } };
      },
      { returningProfileId: 'a'.repeat(32) },
    ),
    /Registered save is missing/,
  );
  assert.equal(
    calls,
    2,
    'No retry or fallback to a signup when a saved identity is absent',
  );
});

void test('generated cohorts persist with private permissions and exact address/key ownership, without displaying secrets', async (t) => {
  const f = await registered(t);
  assert.equal(lstatSync(f.path).mode & 0o777, 0o600);
  assert.equal(lstatSync(f.root).mode & 0o777, 0o700);
  const session = await f.open();
  assert.equal(session.actors.length, 2);
  assert.equal(session.registeredCount, 2);
  assert.equal(session.actors[0].keys.privateKey.extractable, false);
  const keyRecord = JSON.parse(readFileSync(f.path, 'utf8')).actors[0];
  const { createPrivateKey, createPublicKey } = await import('node:crypto');
  const nodeKey = createPrivateKey({
    key: Buffer.from(keyRecord.privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const raw = Buffer.from(
    createPublicKey(nodeKey).export({ format: 'jwk' }).x,
    'base64url',
  );
  const publicKey = await crypto.subtle.importKey(
    'raw',
    raw,
    'Ed25519',
    false,
    ['verify'],
  );
  const message = new TextEncoder().encode('generated sign-in fixture only');
  const signature = await crypto.subtle.sign(
    'Ed25519',
    session.actors[0].keys.privateKey,
    message,
  );
  assert.equal(
    await crypto.subtle.verify('Ed25519', publicKey, signature, message),
    true,
  );
  session.close();
  assert.equal(existsSync(f.path + '.lock'), false);
});

void test('cohort use is exclusive and create mode cannot overwrite or adopt an existing identity file', async (t) => {
  const f = await registered(t),
    original = readFileSync(f.path, 'utf8');
  const a = await f.open();
  await assert.rejects(f.open(), /already in use/);
  a.close();
  a.close();
  await assert.rejects(f.open({ mode: 'create' }), /refuses an existing file/);
  assert.equal(
    secretFingerprint(readFileSync(f.path)),
    secretFingerprint(original),
  );
  assert.equal(existsSync(f.path + '.lock'), false);
});

void test('returning cohorts reject incomplete, mismatched, duplicate or cross-network records before any network request', async (t) => {
  const f = await registered(t),
    source = JSON.parse(readFileSync(f.path, 'utf8'));
  const mutations = [
    (d) => {
      d.network = 'mainnet';
    },
    (d) => {
      d.origin = 'https://play.noobius.io';
    },
    (d) => {
      d.generator = 'imported-user-wallet';
    },
    (d) => {
      d.extra = true;
    },
    (d) => {
      d.createdAt = '2026';
    },
    (d) => {
      d.cohortId = '-'.repeat(36);
    },
    (d) => {
      d.actors[0].registeredProfileId = null;
    },
    (d) => {
      d.actors[0].registeredProfileId = 'broken';
    },
    (d) => {
      d.actors[1] = { ...d.actors[0] };
    },
    (d) => {
      d.actors[0].address = d.actors[1].address;
    },
    (d) => {
      d.actors[0].privateKeyPkcs8 = 'secret-sentinel';
    },
  ];
  for (const mutation of mutations) {
    const next = structuredClone(source);
    mutation(next);
    writeFileSync(f.path, JSON.stringify(next), { mode: 0o600 });
    await assert.rejects(
      f.open(),
      (error) => !error.message.includes('secret-sentinel'),
    );
    assert.equal(existsSync(f.path + '.lock'), false);
  }
  writeFileSync(f.path, JSON.stringify(source), { mode: 0o600 });
  await assert.rejects(f.open({ count: 3 }), /not enough/);
  await assert.rejects(
    f.open({ origin: 'https://play.noobius.io' }),
    /devnet staging only/,
  );
  const preload = `globalThis.fetch=()=>{throw Error('UNEXPECTED_NETWORK')};crypto.randomUUID=()=>{throw Error('UNEXPECTED_ALLOCATION')};crypto.subtle.generateKey=()=>{throw Error('UNEXPECTED_KEY')};`;
  // Explicit malformed/missing files stop before health, new IDs or keys.
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
      cwd: f.cwd,
      env: {
        ...process.env,
        NOOBIUS_TEST_ORIGIN: stageOrigin,
        NOOBIUS_LOAD_ROOMS: '9',
        NOOBIUS_LOAD_SECONDS: '30',
        NOOBIUS_CAPACITY_COHORT_FILE: '.wrangler/capacity-cohorts/missing.json',
        NOOBIUS_CAPACITY_COHORT_MODE: 'returning',
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(result.status, 1);
  assert.doesNotMatch(
    result.stderr,
    /UNEXPECTED_NETWORK|UNEXPECTED_ALLOCATION|UNEXPECTED_KEY/,
  );
});

void test('private cohort storage rejects symlinks, hard links, unsafe permissions and outside paths', async (t) => {
  const f = await registered(t);
  chmodSync(f.path, 0o644);
  await assert.rejects(f.open(), /owner-only 0600/);
  chmodSync(f.path, 0o600);
  const linked = join(f.root, 'linked.json');
  linkSync(f.path, linked);
  await assert.rejects(f.open(), /single owner-only/);
  unlinkSync(linked);
  symlinkSync(f.path, linked);
  await assert.rejects(f.open({ path: linked }), /ELOOP|symbolic/);
  unlinkSync(linked);
  await assert.rejects(
    f.open({ path: join(f.cwd, 'user-wallet.json') }),
    /directly inside/,
  );
  chmodSync(f.root, 0o755);
  await assert.rejects(f.open(), /0700/);
  chmodSync(f.root, 0o700);
  const old = join(f.cwd, '.wrangler/original-cohorts');
  const { renameSync } = await import('node:fs');
  renameSync(f.root, old);
  symlinkSync(old, f.root);
  await assert.rejects(f.open(), /without symlinks/);
});

void test('partial signup preserves generated keys but cannot be used as a returning cohort or merged', async (t) => {
  const f = fixture(t),
    writer = await f.open({ mode: 'create' });
  writer.register(0, 'a'.repeat(32));
  const before = readFileSync(f.path, 'utf8');
  writer.close();
  await assert.rejects(f.open(), /registered saved profile IDs/);
  assert.equal(
    secretFingerprint(readFileSync(f.path)),
    secretFingerprint(before),
  );
  await assert.rejects(
    mergeCapacityCohorts({
      cwd: f.cwd,
      output: join(f.root, 'merge.json'),
      inputs: [f.path, f.path],
    }),
    /registered saved profile IDs/,
  );
  assert.equal(existsSync(join(f.root, 'merge.json')), false);
  assert.equal(existsSync(f.path + '.lock'), false);
});

void test('offline merge accepts only distinct complete generated devnet cohorts and preserves its inputs', async (t) => {
  const f = await registered(t),
    second = join(f.root, 'second.json');
  const writer = await f.open({ path: second, mode: 'create' });
  writer.register(0, 'c'.repeat(32));
  writer.register(1, 'd'.repeat(32));
  writer.close();
  const output = join(f.root, 'combined.json'),
    before = readFileSync(f.path, 'utf8');
  assert.deepEqual(
    await mergeCapacityCohorts({
      cwd: f.cwd,
      output,
      inputs: [f.path, second],
    }),
    { actors: 4, origin: stageOrigin, network: 'devnet' },
  );
  const returning = await f.open({ path: output, count: 4 });
  assert.equal(new Set(returning.actors.map((a) => a.address)).size, 4);
  returning.close();
  assert.equal(
    secretFingerprint(readFileSync(f.path)),
    secretFingerprint(before),
  );
  await assert.rejects(
    mergeCapacityCohorts({
      cwd: f.cwd,
      output: join(f.root, 'duplicate.json'),
      inputs: [f.path, f.path],
    }),
    /already in use|duplicate/,
  );
  assert.equal(existsSync(join(f.root, 'duplicate.json')), false);
  await assert.rejects(
    mergeCapacityCohorts({ cwd: f.cwd, output, inputs: [f.path, second] }),
    /EEXIST/,
  );
});

void test('returning session insertion refuses deleted, replaced, wrong-wallet or unenrolled saves without creating an account', async (t) => {
  const db = database();
  t.after(() => db.sqlite.close());
  const wallet = 'solana:generated-only-unit',
    expected = 'a'.repeat(32);
  const insert = (id, enrollment = true) => {
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,created_at,public_id) VALUES(?,?,?,?)',
      )
      .run(wallet, 'QA', Date.now(), id);
    if (enrollment)
      db.sqlite
        .prepare(
          'INSERT INTO earning_accounts(wallet,browser_key,created_at) VALUES(?,?,?)',
        )
        .run(wallet, 'qa-first-browser', Date.now());
  };
  assert.equal(
    await issueReturningSession(
      db,
      wallet,
      expected,
      'missing',
      Date.now() + 1000,
    ),
    false,
  );
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM players').get().n, 0);
  insert('b'.repeat(32));
  assert.equal(
    await issueReturningSession(
      db,
      wallet,
      expected,
      'changed',
      Date.now() + 1000,
    ),
    false,
  );
  assert.equal(
    await issueReturningSession(
      db,
      wallet + '-other',
      'b'.repeat(32),
      'other',
      Date.now() + 1000,
    ),
    false,
  );
  db.sqlite.prepare('DELETE FROM earning_accounts WHERE wallet=?').run(wallet);
  assert.equal(
    await issueReturningSession(
      db,
      wallet,
      'b'.repeat(32),
      'unenrolled',
      Date.now() + 1000,
    ),
    false,
  );
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) n FROM earning_accounts').get().n,
    0,
  );
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM players').get().n, 1);
  db.sqlite.prepare('DELETE FROM players WHERE wallet=?').run(wallet);
  insert(expected);
  assert.equal(
    await issueReturningSession(
      db,
      wallet,
      expected,
      'exact',
      Date.now() + 1000,
    ),
    true,
  );
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) n FROM earning_accounts').get().n,
    1,
  );
});
