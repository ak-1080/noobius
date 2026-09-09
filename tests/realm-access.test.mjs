import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
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
