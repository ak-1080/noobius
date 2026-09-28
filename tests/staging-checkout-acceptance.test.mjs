import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { generateKeyPairSigner } from '@solana/kit';
import {
  STAGING_CHECKOUT_ORIGIN,
  assertStagingCheckoutTarget,
  assertDetachedCheckpoint,
  submitDetachedCheckout,
  assertDetachedSettlement,
  logoutGeneratedCheckoutClients,
} from '../scripts/staging-checkout-acceptance.mjs';

async function fixture() {
  const [buyer, seller, mint] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  const identities = {
    buyer: buyer.address,
    seller: seller.address,
    mint: mint.address,
  };
  const checkpoint = {
    version: 1,
    origin: STAGING_CHECKOUT_ORIGIN,
    network: 'devnet',
    ...identities,
    paymentId: crypto.randomUUID(),
    listingId: crypto.randomUUID(),
    compute: 250,
    amount: '1000000',
    decimals: 6,
    phase: 'submitted',
    submittedStatus: 'submitted',
    startedAt: new Date().toISOString(),
    departedAt: new Date(Date.now() - 120000).toISOString(),
    signature: base58.encode(crypto.getRandomValues(new Uint8Array(64))),
    buyerTokensBefore: '5000000',
    sellerTokensBefore: '1000000',
  };
  const row = {
    id: checkpoint.paymentId,
    listing_id: checkpoint.listingId,
    buyer: 'solana:' + buyer.address,
    seller: 'solana:' + seller.address,
    buyer_signature: checkpoint.signature,
    status: 'settled',
    finalized_slot: 100,
    updated_at: Date.now(),
    network: 'devnet',
    mint: mint.address,
    amount: '1000000',
    decimals: 6,
    compute: 250,
    token_amount: '1000000',
    listing_status: 'sold',
  };
  return { checkpoint, row, identities };
}

void test('hosted checkout database guard accepts only the exact staging account and D1 binding', () => {
  const config = {
    name: 'noobius-game-staging',
    account_id: '818bac5a5a12b327928ded9344c453bb',
    vars: {
      NOOBIUS_SOLANA_NETWORK: 'devnet',
      NOOBIUS_SITE_ORIGIN: STAGING_CHECKOUT_ORIGIN,
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'noobius-game-staging',
        database_id: 'c996298e-b0ee-4edb-9684-33e44c22d5d8',
      },
    ],
  };
  assert.doesNotThrow(() => assertStagingCheckoutTarget(config));
  for (const change of [
    { name: 'noobius-game' },
    { account_id: 'different-account' },
    { vars: { ...config.vars, NOOBIUS_SOLANA_NETWORK: 'mainnet' } },
    {
      vars: { ...config.vars, NOOBIUS_SITE_ORIGIN: 'https://play.noobius.io' },
    },
    {
      d1_databases: [
        { ...config.d1_databases[0], database_id: 'production-db' },
      ],
    },
    { d1_databases: [...config.d1_databases, config.d1_databases[0]] },
  ])
    assert.throws(() => assertStagingCheckoutTarget({ ...config, ...change }));
});

void test('detached checkpoint binds generated identities, fixed terms and public metadata only', async () => {
  const { checkpoint, identities } = await fixture();
  assert.equal(assertDetachedCheckpoint(checkpoint, identities), checkpoint);
  for (const change of [
    { network: 'mainnet' },
    { buyer: identities.seller },
    { compute: 251 },
    { amount: '2000000' },
    { paymentId: "' OR 1=1" },
    { signature: identities.mint },
    { buyerTokensBefore: '999999' },
    { sellerTokensBefore: '-1' },
    { phase: 'retry' },
    { rpcUrl: 'https://private.example/?key=secret' },
    { signedTransaction: 'private-wire-bytes' },
    { secret: 'private-key' },
  ])
    assert.throws(() =>
      assertDetachedCheckpoint({ ...checkpoint, ...change }, identities),
    );
});

void test('detached submission durably records intent before exactly one network submission and never polls', async () => {
  const { checkpoint } = await fixture();
  checkpoint.phase = 'submission-started';
  delete checkpoint.submittedStatus;
  delete checkpoint.departedAt;
  const events = [];
  const saved = await submitDetachedCheckout(checkpoint, {
    persist: (value, options) =>
      events.push({ action: 'persist', value, options }),
    submit: () => {
      events.push({ action: 'submit' });
      return {
        id: checkpoint.paymentId,
        signature: checkpoint.signature,
        status: 'submitted',
      };
    },
  });
  assert.deepEqual(
    events.map((event) => event.action),
    ['persist', 'submit', 'persist'],
  );
  assert.equal(events[0].options.exclusive, true);
  assert.equal(events[0].value.phase, 'submission-started');
  assert.equal(events[2].options.exclusive, false);
  assert.equal(saved.phase, 'submitted');
  assert.equal(saved.submittedStatus, 'submitted');
});

void test('checkpoint persistence failure prevents submission; ambiguous network result is never retried', async () => {
  const { checkpoint } = await fixture();
  checkpoint.phase = 'submission-started';
  delete checkpoint.submittedStatus;
  delete checkpoint.departedAt;
  let submissions = 0;
  await assert.rejects(
    submitDetachedCheckout(checkpoint, {
      persist: () => {
        throw Error('checkpoint unavailable');
      },
      submit: () => {
        submissions++;
      },
    }),
    /checkpoint unavailable/,
  );
  assert.equal(submissions, 0);
  const saved = [];
  await assert.rejects(
    submitDetachedCheckout(checkpoint, {
      persist: (value) => saved.push(value),
      submit: () => {
        submissions++;
        throw Error('response lost after server accepted');
      },
    }),
    /response lost/,
  );
  assert.equal(submissions, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].phase, 'submission-started');
});

void test('changed or rejected submission replies cannot overwrite the original immutable intent', async () => {
  const { checkpoint } = await fixture();
  checkpoint.phase = 'submission-started';
  delete checkpoint.submittedStatus;
  delete checkpoint.departedAt;
  for (const change of [
    { id: crypto.randomUUID() },
    { signature: 'wrong-signature' },
    { status: 'failed' },
  ]) {
    const saved = [];
    await assert.rejects(
      submitDetachedCheckout(checkpoint, {
        persist: (value) => saved.push(value),
        submit: () => ({
          id: checkpoint.paymentId,
          signature: checkpoint.signature,
          status: 'submitted',
          ...change,
        }),
      }),
    );
    assert.equal(saved.length, 1);
    assert.equal(saved[0].phase, 'submission-started');
  }
});

void test('detached verification requires the exact unattended finalized settlement and rejects pending or different receipts', async () => {
  const { checkpoint, row } = await fixture();
  assert.equal(assertDetachedSettlement(checkpoint, row), row);
  assert.throws(
    () => assertDetachedSettlement(checkpoint, null),
    /no durable payment record/,
  );
  for (const change of [
    { id: crypto.randomUUID() },
    { listing_id: crypto.randomUUID() },
    { buyer: row.seller },
    { buyer_signature: 'wrong' },
    { network: 'mainnet' },
    { mint: checkpoint.buyer },
    { amount: '2000000' },
    { decimals: 9 },
    { compute: 251 },
    { seller: row.buyer },
    { token_amount: '2000000' },
    { status: 'recorded' },
    { status: 'submitted' },
    { status: 'expired' },
    { status: 'failed' },
    { listing_status: 'reserved' },
    { finalized_slot: null },
  ])
    assert.throws(() =>
      assertDetachedSettlement(checkpoint, { ...row, ...change }),
    );
  for (const submittedStatus of [undefined, 'settled'])
    assert.throws(
      () => assertDetachedSettlement({ ...checkpoint, submittedStatus }, row),
      /cannot prove detached cron recovery/,
    );
  assert.throws(
    () =>
      assertDetachedSettlement(checkpoint, {
        ...row,
        updated_at: Date.parse(checkpoint.departedAt) - 1,
      }),
    /before the original process left/,
  );
});

void test('generated checkout cleanup retries only idempotent logout and continues through both roles', async () => {
  const calls = [];
  let buyerAttempts = 0;
  const client = (role) => ({
    body: () => ({ expectedWallet: role }),
    request: async (action, body) => {
      calls.push({ role, action, body });
      if (role === 'buyer' && buyerAttempts++ === 0)
        throw Error('lost logout reply');
      return { status: 200 };
    },
  });
  await logoutGeneratedCheckoutClients({
    buyer: client('buyer'),
    seller: client('seller'),
  });
  assert.deepEqual(
    calls.map((call) => call.action),
    ['logout', 'logout', 'logout'],
  );
  assert.deepEqual(
    calls.map((call) => call.role),
    ['buyer', 'buyer', 'seller'],
  );
  assert.ok(calls.every((call) => call.body.expectedWallet === call.role));
});

void test('generated checkout cleanup reports bounded failures without skipping the remaining role', async () => {
  const calls = [];
  const client = (role) => ({
    body: () => ({ expectedWallet: role }),
    request: async (action) => {
      calls.push({ role, action });
      return { status: role === 'buyer' ? 503 : 200 };
    },
  });
  await assert.rejects(
    logoutGeneratedCheckoutClients({
      buyer: client('buyer'),
      seller: client('seller'),
    }),
    /session cleanup failed/,
  );
  assert.deepEqual(
    calls.map((call) => call.role),
    ['buyer', 'buyer', 'seller'],
  );
});
