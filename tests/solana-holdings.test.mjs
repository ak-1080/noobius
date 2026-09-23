import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { database } from './sqlite-d1.mjs';
import {
  tokenPolicy,
  readTokenHolding,
  realmAccess,
} from '../lib/realm-access.ts';
import { walletHoldingGuard } from '../lib/realm-authority.ts';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
} from '../lib/solana-holdings.ts';
const addr = (n) => base58.encode(new Uint8Array(32).fill(n));
const owner = addr(1),
  mint = addr(2),
  wallet = 'solana:' + owner;
const values = {
  NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
  NOOBIUS_SOLANA_NETWORK: 'devnet',
  NOOBIUS_TOKEN_MINT: mint,
  NOOBIUS_TOKEN_DECIMALS: '6',
  NOOBIUS_TOKEN_THRESHOLD: '888',
  NOOBIUS_TOKEN_RPC_URL: 'https://rpc.test.invalid',
};
const policy = tokenPolicy(values);
function rpc(options = {}) {
  const requests = [];
  const amounts = options.amounts ?? ['444000000', '444000000'];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    assert.equal(init.redirect, 'error');
    let result;
    if (body.method === 'getGenesisHash')
      result = options.genesis ?? SOLANA_GENESIS.devnet;
    else if (body.method === 'getAccountInfo')
      result = {
        context: { slot: 100 },
        value: {
          owner: options.program ?? SPL_TOKEN_PROGRAM,
          executable: false,
          data: {
            parsed: {
              type: 'mint',
              info: { decimals: options.decimals ?? 6, isInitialized: true },
            },
          },
        },
      };
    else if (body.method === 'getTokenAccountsByOwner') {
      assert.equal(body.params[0], owner);
      assert.equal(body.params[1].mint, mint);
      assert.equal(body.params[2].commitment, 'finalized');
      assert.equal(body.params[2].minContextSlot, 100);
      result = {
        context: { slot: options.slot ?? 101 },
        value: amounts.map((amount, i) => ({
          pubkey: addr(options.duplicate ? 3 : i + 3),
          account: {
            owner: options.program ?? SPL_TOKEN_PROGRAM,
            executable: false,
            data: {
              parsed: {
                type: 'account',
                info: {
                  owner: options.owner ?? owner,
                  mint: options.mint ?? mint,
                  state: 'initialized',
                  tokenAmount: { amount, decimals: 6 },
                },
              },
            },
          },
        })),
      };
    } else throw Error('Unexpected RPC ' + body.method);
    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  };
  return { fetcher, requests };
}
void test('Solana policy preserves case and separates network/mint/precision in cache identity', () => {
  assert.equal(policy.contract, mint);
  assert.match(policy.key, /^solana:/);
  assert.equal(policy.tokenProgram, SPL_TOKEN_PROGRAM);
  assert.notEqual(
    tokenPolicy({ ...values, NOOBIUS_TOKEN_PROGRAM: TOKEN_2022_PROGRAM }).key,
    policy.key,
  );
  assert.notEqual(
    tokenPolicy({ ...values, NOOBIUS_SOLANA_NETWORK: 'mainnet-beta' }).key,
    policy.key,
  );
  for (const change of [
    { NOOBIUS_TOKEN_MINT: 'invalid' },
    { NOOBIUS_TOKEN_DECIMALS: '19' },
    { NOOBIUS_SOLANA_NETWORK: 'unknown' },
    { NOOBIUS_TOKEN_RPC_URL: 'http://rpc.test.invalid' },
    { NOOBIUS_TOKEN_THRESHOLD: '0' },
    { NOOBIUS_TOKEN_PROGRAM: 'unknown' },
  ])
    assert.equal(tokenPolicy({ ...values, ...change }), null);
});
void test('finalized Solana holdings aggregate multiple owned token accounts exactly', async () => {
  const r = rpc();
  assert.deepEqual(await readTokenHolding(policy, wallet, r.fetcher), {
    block: '0x65',
    amount: '888000000',
    eligible: true,
  });
  assert.equal(
    (
      await readTokenHolding(
        policy,
        wallet,
        rpc({ amounts: ['887999999'] }).fetcher,
      )
    ).eligible,
    false,
  );
  assert.equal(
    (await readTokenHolding(policy, wallet, rpc({ amounts: [] }).fetcher))
      .eligible,
    false,
  );
});
void test('Token-2022 holding policy accepts only accounts owned by its configured program', async () => {
  const token2022Policy = tokenPolicy({
    ...values,
    NOOBIUS_TOKEN_PROGRAM: TOKEN_2022_PROGRAM,
  });
  assert.equal(
    (
      await readTokenHolding(
        token2022Policy,
        wallet,
        rpc({ program: TOKEN_2022_PROGRAM }).fetcher,
      )
    ).eligible,
    true,
  );
  await assert.rejects(
    readTokenHolding(token2022Policy, wallet, rpc().fetcher),
    /mint mismatch/,
  );
});
void test('wrong network, mint, owner, precision, duplicate accounts, stale slot and corrupt balances fail closed', async () => {
  for (const options of [
    { genesis: SOLANA_GENESIS['mainnet-beta'] },
    { decimals: 9 },
    { owner: addr(9) },
    { mint: addr(9) },
    { duplicate: true },
    { slot: 99 },
    { amounts: ['1e9'] },
    { amounts: ['18446744073709551616'] },
  ])
    await assert.rejects(
      readTokenHolding(policy, wallet, rpc(options).fetcher),
    );
  await assert.rejects(
    readTokenHolding(policy, '0x' + 'a'.repeat(40), rpc().fetcher),
    /Solana account/,
  );
});
void test('Solana eligibility reaches write-time guards; EVM cache cannot grant Solana access', async () => {
  const db = database();
  const now = Date.now();
  db.sqlite
    .prepare('INSERT INTO players(wallet,name,created_at) VALUES (?,?,0)')
    .run(wallet, 'Solana Test');
  const access = await realmAccess(
    db,
    wallet,
    values,
    false,
    now,
    rpc().fetcher,
  );
  assert.equal(access.allowed, true);
  const permit = { policy: policy.key, localTest: false };
  assert.equal(
    db.sqlite
      .prepare(`SELECT ${walletHoldingGuard(wallet, permit)} AS allowed`)
      .get().allowed,
    1,
  );
  assert.equal(
    db.sqlite
      .prepare(
        `SELECT ${walletHoldingGuard(wallet, { policy: '1:evm-policy', localTest: false })} AS allowed`,
      )
      .get().allowed,
    0,
  );
  assert.equal(
    (
      await realmAccess(
        db,
        wallet,
        values,
        false,
        now + 61000,
        rpc({ amounts: ['0'] }).fetcher,
      )
    ).allowed,
    false,
  );
  assert.equal(
    db.sqlite
      .prepare(`SELECT ${walletHoldingGuard(wallet, permit)} AS allowed`)
      .get().allowed,
    0,
  );
  db.sqlite.close();
});
