import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import {
  localRealmTest,
  holdingGuard,
  walletHoldingGuard,
} from '../lib/realm-authority.ts';
import {
  joinNeighborhood,
  changeScene,
  syncNeighborhood,
} from '../lib/neighborhoods-server.ts';
import { startProject, contributeProject } from '../lib/projects-server.ts';
import { newFacility } from '../lib/facility.ts';
import { careerFor } from '../lib/contracts.ts';
import {
  tokenPolicy,
  readTokenHolding,
  realmAccess,
} from '../lib/realm-access.ts';
const values = {
  NOOBIUS_TOKEN_CHAIN_ID: '1',
  NOOBIUS_TOKEN_CONTRACT: '0x' + 'a'.repeat(40),
  NOOBIUS_TOKEN_DECIMALS: '6',
  NOOBIUS_TOKEN_RPC_URL: 'https://rpc.test.invalid',
  NOOBIUS_TOKEN_THRESHOLD: '888',
  NOOBIUS_TOKEN_CONFIRMATIONS: '12',
};
const wallet = '0x' + 'b'.repeat(40);
function transport(amount = '888000000', chain = '0x1', decimals = '0x6') {
  const requests = [];
  const fetcher = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const result =
      request.method === 'eth_chainId'
        ? chain
        : request.method === 'eth_blockNumber'
          ? '0x100'
          : request.method === 'eth_getCode'
            ? '0x6001'
            : request.params[0].data === '0x313ce567'
              ? decimals
              : '0x' + BigInt(amount).toString(16);
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  };
  return { fetcher, requests };
}
function fixture() {
  const db = database();
  db.sqlite
    .prepare('INSERT INTO players(wallet,name,created_at) VALUES (?,?,0)')
    .run(wallet, 'Access test');
  return db;
}
test('holding verification targets the exact chain, asset, decimals and confirmed block without transfers', async () => {
  const policy = tokenPolicy(values),
    rpc = transport();
  assert.ok(policy);
  const result = await readTokenHolding(policy, wallet, rpc.fetcher);
  assert.equal(result.eligible, true);
  assert.equal(result.block, '0xf4');
  assert.ok(
    rpc.requests
      .filter((r) => r.method === 'eth_call')
      .every(
        (r) =>
          r.params[0].to === values.NOOBIUS_TOKEN_CONTRACT &&
          r.params[1] === '0xf4',
      ),
  );
  assert.ok(
    rpc.requests.every(
      (r) => !r.method.includes('send') && !r.method.includes('sign'),
    ),
  );
  assert.equal(
    (await readTokenHolding(policy, wallet, transport('887999999').fetcher))
      .eligible,
    false,
  );
  await assert.rejects(
    readTokenHolding(policy, wallet, transport('888000000', '0x2').fetcher),
    /network mismatch/,
  );
  await assert.rejects(
    readTokenHolding(
      policy,
      wallet,
      transport('888000000', '0x1', '0x12').fetcher,
    ),
    /asset mismatch/,
  );
});
test('unconfigured production is closed; local test access is explicitly identified', async () => {
  const db = fixture();
  assert.equal((await realmAccess(db, wallet, {}, false, 1000)).allowed, false);
  const local = await realmAccess(db, wallet, {}, true, 1000);
  assert.equal(local.status, 'test');
  assert.equal(local.allowed, true);
  assert.equal(
    tokenPolicy({ ...values, NOOBIUS_TOKEN_RPC_URL: 'http://localhost:8000' }),
    null,
  );
});
test('Solana holder access is unsupported without RPC or cached-grace reuse', async () => {
  const db = fixture(),
    solana = 'solana:' + '1'.repeat(32),
    now = Date.now(),
    rpc = transport(),
    policy = tokenPolicy(values),
    permit = { policy: policy.key, localTest: false };
  db.sqlite
    .prepare('INSERT INTO players(wallet,name,created_at) VALUES (?,?,0)')
    .run(solana, 'Solana access test');
  // Even a stale eligible/grace row must not authorize an unsupported account.
  db.sqlite
    .prepare(`INSERT INTO realm_entitlements
    (wallet,policy,amount,block,status,checked_at,next_check_at,grace_until)
    VALUES (?,?,?,'0xf4','eligible',?,?,?)`)
    .run(solana, policy.key, '888000000', now, now + 60000, now + 300000);
  await assert.rejects(
    readTokenHolding(policy, solana, rpc.fetcher),
    /Ethereum\/EVM accounts only/,
  );
  for (const status of ['eligible', 'unavailable']) {
    db.sqlite
      .prepare('UPDATE realm_entitlements SET status=? WHERE wallet=?')
      .run(status, solana);
    const access = await realmAccess(
      db,
      solana,
      values,
      false,
      now,
      rpc.fetcher,
    );
    assert.equal(access.status, 'unsupported');
    assert.equal(access.allowed, false);
    assert.equal(access.graceUntil, undefined);
    assert.match(access.message, /Ethereum\/EVM accounts only/);
    assert.equal(
      db.sqlite
        .prepare(`SELECT ${walletHoldingGuard(solana, permit)} AS allowed`)
        .get().allowed,
      0,
    );
    assert.equal(
      db.sqlite
        .prepare(
          `SELECT ${holdingGuard('p.wallet', permit)} AS allowed FROM players p WHERE wallet=?`,
        )
        .get(solana).allowed,
      0,
    );
  }
  assert.equal(rpc.requests.length, 0);
  assert.equal(
    (await realmAccess(db, solana, {}, false, now, rpc.fetcher)).status,
    'unsupported',
  );
  assert.equal(
    (await realmAccess(db, solana, {}, true, now, rpc.fetcher)).status,
    'test',
  );
  // An eligible EVM account remains its own save and entitlement, never a link.
  assert.equal(
    (await realmAccess(db, wallet, values, false, now, rpc.fetcher)).allowed,
    true,
  );
  assert.equal(
    db.sqlite
      .prepare(`SELECT ${walletHoldingGuard(wallet, permit)} AS allowed`)
      .get().allowed,
    1,
  );
  assert.equal(
    db.sqlite
      .prepare(`SELECT ${walletHoldingGuard(solana, permit)} AS allowed`)
      .get().allowed,
    0,
  );
});
test('verified access has bounded RPC grace and confirmed holding loss removes access', async () => {
  const db = fixture(),
    offline = async () => {
      throw new Error('offline');
    };
  assert.equal(
    (await realmAccess(db, wallet, values, false, 1000, transport().fetcher))
      .allowed,
    true,
  );
  let answer = await realmAccess(db, wallet, values, false, 62000, offline);
  assert.equal(answer.status, 'unavailable');
  assert.equal(answer.allowed, true);
  answer = await realmAccess(db, wallet, values, false, 302000, offline);
  assert.equal(answer.allowed, false);
  answer = await realmAccess(
    db,
    wallet,
    values,
    false,
    318000,
    transport('0').fetcher,
  );
  assert.equal(answer.status, 'ineligible');
  assert.equal(answer.allowed, false);
  answer = await realmAccess(db, wallet, values, false, 379000, offline);
  assert.equal(answer.allowed, false);
});
test('a changed asset policy cannot reuse another asset holdings', async () => {
  const db = fixture();
  await realmAccess(db, wallet, values, false, 1000, transport().fetcher);
  const other = { ...values, NOOBIUS_TOKEN_CONTRACT: '0x' + 'c'.repeat(40) };
  const unavailable = await realmAccess(
    db,
    wallet,
    other,
    false,
    2000,
    async () => {
      throw new Error('offline');
    },
  );
  assert.equal(unavailable.allowed, false);
});

test('local holder testing requires an explicit flag, development build and loopback host', () => {
  const enabled = { NOOBIUS_LOCAL_REALM_TEST: 'true' };
  assert.equal(localRealmTest(enabled, 'http://localhost:3000/', true), true);
  assert.equal(localRealmTest(enabled, 'https://example.com/', true), false);
  assert.equal(localRealmTest(enabled, 'http://localhost:3000/', false), false);
  assert.equal(localRealmTest({}, 'http://localhost:3000/', true), false);
});

test('a delayed eligible response cannot reverse a same-time confirmed loss or a newer block', async () => {
  const db = fixture();
  let release;
  const delay = new Promise((resolve) => {
    release = resolve;
  });
  const rpc = transport();
  const slow = async (...args) => {
    await delay;
    return rpc.fetcher(...args);
  };
  const old = realmAccess(db, wallet, values, false, 1000, slow);
  const latest = await realmAccess(
    db,
    wallet,
    values,
    false,
    1000,
    transport('0').fetcher,
  );
  assert.equal(latest.allowed, false);
  release();
  assert.equal((await old).allowed, false);
  const staleBlock = async (url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === 'eth_blockNumber')
      return Response.json({ result: '0xff' });
    return rpc.fetcher(url, options);
  };
  assert.equal(
    (await realmAccess(db, wallet, values, false, 62000, staleBlock)).allowed,
    false,
  );
});

test('GPU writes reject revoked holdings at commit and safe return preserves the center', async () => {
  const db = fixture(),
    now = Date.now(),
    clientId = crypto.randomUUID();
  const f = newFacility(now);
  f.inventory = { kit: 2, board: 2, copper: 6, silicon: 4 };
  f.career = careerFor(f);
  f.career.completed = { service: 2, supply: 2, workload: 2 };
  f.career.modules = ['fast'];
  f.career.commissioned = 1;
  db.sqlite
    .prepare('UPDATE players SET facility_state=? WHERE wallet=?')
    .run(JSON.stringify(f), wallet);
  await realmAccess(db, wallet, values, false, now, transport().fetcher);
  const permit = { policy: tokenPolicy(values).key, localTest: false };
  const joined = await joinNeighborhood(
    db,
    wallet,
    'gpu',
    0,
    clientId,
    { permit },
    now,
  );
  const controller = { clientId, generation: joined.generation };
  db.sqlite
    .prepare('UPDATE crew_presence SET x=-4,z=9 WHERE wallet=?')
    .run(wallet);
  const started = await startProject(
    db,
    wallet,
    controller,
    'gpu-launch',
    now,
    permit,
  );
  assert.equal(started.project.required.workload, 2);
  const before = db.sqlite
    .prepare('SELECT facility_state FROM players WHERE wallet=?')
    .get(wallet).facility_state;
  const originalBatch = db.batch.bind(db);
  db.batch = async (statements) => {
    db.sqlite
      .prepare(
        "UPDATE realm_entitlements SET status='ineligible',grace_until=0 WHERE wallet=?",
      )
      .run(wallet);
    return originalBatch(statements);
  };
  await assert.rejects(
    contributeProject(
      db,
      wallet,
      controller,
      started.project.id,
      'supply',
      crypto.randomUUID(),
      now,
      permit,
    ),
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT facility_state FROM players WHERE wallet=?')
      .get(wallet).facility_state,
    before,
  );
  assert.equal(
    db.sqlite.prepare('SELECT count(*) n FROM cluster_contributions').get().n,
    0,
  );
  await assert.rejects(
    syncNeighborhood(db, wallet, controller, 1, { x: -4, z: 9 }, now, permit),
  );
  await assert.rejects(
    changeScene(db, wallet, controller, 'commons', now, permit),
  );
  await assert.rejects(
    joinNeighborhood(db, wallet, 'gpu', 0, clientId, { permit }, now),
  );
  db.batch = originalBatch;
  const returned = await joinNeighborhood(
    db,
    wallet,
    'commons',
    0,
    clientId,
    { expectedGeneration: joined.generation },
    now,
  );
  assert.notEqual(returned.generation, joined.generation);
  assert.equal(returned.realm, 'commons');
  assert.equal(
    db.sqlite
      .prepare('SELECT facility_state FROM players WHERE wallet=?')
      .get(wallet).facility_state,
    before,
  );
  await assert.rejects(
    joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      { expectedGeneration: joined.generation },
      now,
    ),
    /connection changed/,
  );
});

test('RPC failure preserves confirmed denial at the same block', async () => {
  const db = fixture();
  await realmAccess(db, wallet, values, false, 1000, transport('0').fetcher);
  const failed = await realmAccess(
    db,
    wallet,
    values,
    false,
    62000,
    async () => {
      throw new Error('offline');
    },
  );
  assert.equal(failed.allowed, false);
  assert.equal(
    (await realmAccess(db, wallet, values, false, 78000, transport().fetcher))
      .allowed,
    false,
  );
});

test('newer confirmed chain evidence wins even if its request began earlier', async () => {
  const db = fixture();
  let release;
  const delay = new Promise((resolve) => {
    release = resolve;
  });
  const deny = transport('0').fetcher;
  const laterBlock = async (url, options) => {
    await delay;
    const request = JSON.parse(options.body);
    if (request.method === 'eth_blockNumber')
      return Response.json({ result: '0x101' });
    return deny(url, options);
  };
  const oldRequest = realmAccess(db, wallet, values, false, 1000, laterBlock);
  assert.equal(
    (await realmAccess(db, wallet, values, false, 1001, transport().fetcher))
      .allowed,
    true,
  );
  release();
  assert.equal((await oldRequest).allowed, false);
  assert.equal(
    db.sqlite.prepare('SELECT block FROM realm_entitlements').get().block,
    '0xf5',
  );
});
