import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import { database } from './sqlite-d1.mjs';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
} from '../lib/solana-holdings.ts';
import {
  createComputePaymentQuote,
  encodePaymentTransaction,
} from '../lib/solana-payment.ts';
import {
  createComputeListing,
  reserveComputePayment,
  recordBuyerComputePayment,
  getComputePayment,
  getComputeListing,
} from '../lib/compute-market.ts';
import {
  handleComputeMarketAction,
  paymentConfiguration,
  paymentRecoveryConfiguration,
} from '../lib/compute-market-api.ts';
import {
  reconcileComputePayment,
  recoverComputePayments,
} from '../lib/compute-payment-recovery.ts';

// In-memory D1-compatible ledger and generated signers only. The actual RPC
// boundary uses a controlled transport; no chain or hosted service is contacted.
async function fixture(t) {
  const db = database();
  t.after(() => db.sqlite.close());
  const [buyer, seller, signer, mint] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(true),
    generateKeyPairSigner(),
  ]);
  const wallet = (actor) => 'solana:' + actor.address;
  for (const actor of [buyer, seller])
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
      )
      .run(wallet(actor), 'Lazy authorization QA', 1000, 1_000_000);
  const exported = await crypto.subtle.exportKey(
    'jwk',
    signer.keyPair.privateKey,
  );
  const signerBytes = Buffer.concat([
    Buffer.from(exported.d, 'base64url'),
    Buffer.from(await crypto.subtle.exportKey('raw', signer.keyPair.publicKey)),
  ]).toString('base64');
  const values = {
    NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
    NOOBIUS_SOLANA_NETWORK: 'devnet',
    NOOBIUS_TOKEN_MINT: mint.address,
    NOOBIUS_TOKEN_PROGRAM: SPL_TOKEN_PROGRAM,
    NOOBIUS_TOKEN_DECIMALS: '6',
    NOOBIUS_TOKEN_THRESHOLD: '1',
    NOOBIUS_TOKEN_RPC_URL: 'https://controlled.invalid',
    NOOBIUS_PAYMENTS_ENABLED: 'true',
    NOOBIUS_PAYMENT_SIGNER: signer.address,
    NOOBIUS_PAYMENT_KEYS: JSON.stringify({ [signer.address]: signerBytes }),
  };
  const { policy } = await paymentConfiguration(values);
  const listingId = crypto.randomUUID();
  const quote = await createComputePaymentQuote({
    quoteId: crypto.randomUUID(),
    network: 'devnet',
    mint: mint.address,
    tokenProgram: SPL_TOKEN_PROGRAM,
    buyer: buyer.address,
    seller: seller.address,
    decimals: 6,
    amount: '1000000',
    authorizationSigner: signer.address,
    recentBlockhash: mint.address,
    lastValidBlockHeight: 100,
    contextSlot: 50,
  });
  await createComputeListing(
    db,
    {
      id: listingId,
      seller: wallet(seller),
      compute: 250,
      tokenAmount: '1000000',
    },
    policy,
    1_000_000,
  );
  await reserveComputePayment(
    db,
    listingId,
    wallet(buyer),
    quote,
    policy,
    1_000_000,
  );
  const approval = encodePaymentTransaction(
    await partiallySignTransaction(
      [buyer.keyPair],
      getTransactionDecoder().decode(
        Buffer.from(quote.unsignedTransactionBase64, 'base64'),
      ),
    ),
  );
  await recordBuyerComputePayment(
    db,
    quote.quoteId,
    wallet(buyer),
    approval,
    1_000_001,
  );
  const state = { transaction: null, beforeObservation: null };
  const calls = [],
    events = [],
    sent = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(_url, values.NOOBIUS_TOKEN_RPC_URL);
    const { id, method, params } = JSON.parse(init.body);
    calls.push(method);
    events.push(method);
    let result;
    if (method === 'getGenesisHash') result = SOLANA_GENESIS.devnet;
    else if (method === 'getTransaction') {
      assert.equal(params[1].commitment, 'finalized');
      const before = state.beforeObservation;
      state.beforeObservation = null;
      await before?.();
      result = state.transaction;
    } else if (method === 'getSlot') result = 120;
    else if (method === 'getBlockHeight') result = 99;
    else if (method === 'sendTransaction') {
      const saved = await getComputePayment(db, quote.quoteId);
      assert.equal(saved.status, 'submitted');
      assert.equal(
        params[0],
        saved.authorized_transaction,
        'Exact authorized bytes must already be durable before broadcast',
      );
      sent.push(params[0]);
      result = saved.buyer_signature;
    } else assert.fail('Unexpected RPC method: ' + method);
    return Response.json({ jsonrpc: '2.0', id, result });
  });
  const credits = (actor) =>
    db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get(wallet(actor)).credits;
  const watchKeys = (encoded = '{malformed-old-key-map') => {
    let reads = 0;
    Object.defineProperty(values, 'NOOBIUS_PAYMENT_KEYS', {
      configurable: true,
      get() {
        reads++;
        events.push('key-load');
        return encoded;
      },
    });
    return () => reads;
  };
  return {
    db,
    buyer,
    seller,
    signer,
    mint,
    wallet,
    values,
    policy,
    listingId,
    quote,
    approval,
    state,
    calls,
    events,
    sent,
    credits,
    watchKeys,
  };
}

async function authorize(f) {
  await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    {
      observe: async () => ({ status: 'pending' }),
      broadcast: async (wire) => {
        const saved = await getComputePayment(f.db, f.quote.quoteId);
        assert.equal(saved.status, 'submitted');
        assert.equal(saved.authorized_transaction, wire);
      },
    },
    f.signer.keyPair,
    1_000_002,
  );
  return getComputePayment(f.db, f.quote.quoteId);
}

void test('scheduled and API finalization deliver a submitted payment once without parsing malformed old keys', async (t) => {
  const f = await fixture(t),
    saved = await authorize(f);
  f.state.transaction = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  const reads = f.watchKeys();
  const recovered = await recoverComputePayments(
    f.db,
    (quote) => paymentRecoveryConfiguration(f.values, quote),
    1_020_000,
  );
  assert.equal(recovered.settled, 1);
  assert.equal(recovered.errors, 0);
  assert.equal(reads(), 0);
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'sold');
  for (let i = 0; i < 2; i++) {
    const receipt = await handleComputeMarketAction(
      f.db,
      f.wallet(f.buyer),
      'compute-payment-status',
      { id: f.quote.quoteId },
      f.values,
      false,
    );
    assert.equal(receipt.payment.status, 'settled');
    assert.equal(receipt.payment.signature, saved.buyer_signature);
    assert.equal(f.credits(f.buyer), 1250);
  }
  assert.equal(
    (
      await recoverComputePayments(
        f.db,
        (quote) => paymentRecoveryConfiguration(f.values, quote),
        1_040_000,
      )
    ).checked,
    0,
  );
  assert.equal(reads(), 0);
  assert.equal(f.sent.length, 0);
});

void test('pending submitted payment rebroadcasts only its saved bytes without loading an unavailable signer', async (t) => {
  const f = await fixture(t),
    saved = await authorize(f),
    reads = f.watchKeys();
  const config = await paymentRecoveryConfiguration(f.values, f.quote);
  const latest = await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    config.rpc,
    config.getAuthorizationKeyPair,
    1_020_000,
  );
  assert.equal(latest.status, 'submitted');
  assert.equal(latest.authorized_transaction, saved.authorized_transaction);
  assert.equal(latest.buyer_signature, saved.buyer_signature);
  assert.equal(reads(), 0);
  assert.deepEqual(f.sent, [saved.authorized_transaction]);
  assert.equal(f.credits(f.buyer), 1000);
  assert.equal(f.credits(f.seller), 750);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(
    f.db.sqlite.prepare('SELECT COUNT(*) n FROM compute_payments').get().n,
    1,
  );
});

void test('pending recorded approval with malformed keys retains its reservation and cannot broadcast', async (t) => {
  const f = await fixture(t),
    reads = f.watchKeys(),
    diagnostics = [];
  const result = await recoverComputePayments(
    f.db,
    (quote) => paymentRecoveryConfiguration(f.values, quote),
    1_020_000,
    (value) => diagnostics.push(value),
  );
  assert.equal(result.errors, 1);
  assert.deepEqual(diagnostics, [
    { stage: 'authorization', category: 'authorization-unavailable' },
  ]);
  assert.equal(reads(), 1);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'recorded');
  assert.equal(saved.buyer_transaction, f.approval);
  assert.equal(saved.authorized_transaction, null);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(f.credits(f.buyer), 1000);
  assert.equal(f.credits(f.seller), 750);
  assert.equal(f.sent.length, 0);
});

void test('pending recorded approval with a retired key remains pending without replacement authorization', async (t) => {
  const f = await fixture(t),
    reads = f.watchKeys('{}');
  const result = await recoverComputePayments(
    f.db,
    (quote) => paymentRecoveryConfiguration(f.values, quote),
    1_020_000,
  );
  assert.equal(result.pending, 1);
  assert.equal(result.errors, 0);
  assert.equal(reads(), 1);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'recorded');
  assert.equal(saved.authorized_transaction, null);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(f.sent.length, 0);
});

void test('new listings and quotes retain eager signer validation and reject malformed keys before changing balances', async (t) => {
  const f = await fixture(t),
    reads = f.watchKeys();
  const openListing = crypto.randomUUID();
  await createComputeListing(
    f.db,
    {
      id: openListing,
      seller: f.wallet(f.seller),
      compute: 10,
      tokenAmount: '1000',
    },
    f.policy,
    1_000_002,
  );
  const sellerBefore = f.credits(f.seller);
  for (const [wallet, action, body] of [
    [
      f.wallet(f.seller),
      'compute-listing-create',
      { id: crypto.randomUUID(), compute: 10, tokenAmount: '1000' },
    ],
    [
      f.wallet(f.buyer),
      'compute-payment-quote',
      { id: crypto.randomUUID(), listingId: openListing },
    ],
  ])
    await assert.rejects(
      handleComputeMarketAction(f.db, wallet, action, body, f.values, true),
      (error) =>
        error.status === 503 &&
        /Payment authorization is unavailable/.test(error.message),
    );
  assert.equal(reads(), 2);
  assert.equal(f.calls.length, 0);
  assert.equal(f.credits(f.seller), sellerBefore);
  assert.equal((await getComputeListing(f.db, openListing)).status, 'open');
  assert.equal(
    f.db.sqlite.prepare('SELECT COUNT(*) n FROM compute_payments').get().n,
    1,
  );
});

void test('recovery rejects changed original network, mint, decimals or program before signer loading or RPC', async (t) => {
  const f = await fixture(t);
  for (const changed of [
    { NOOBIUS_SOLANA_NETWORK: 'mainnet-beta' },
    { NOOBIUS_TOKEN_MINT: f.seller.address },
    { NOOBIUS_TOKEN_DECIMALS: '7' },
    { NOOBIUS_TOKEN_PROGRAM: TOKEN_2022_PROGRAM },
    { NOOBIUS_TOKEN_RPC_URL: 'http://unsafe.invalid' },
    { NOOBIUS_TOKEN_ECOSYSTEM: 'evm' },
  ]) {
    const values = { ...f.values, ...changed };
    let reads = 0;
    Object.defineProperty(values, 'NOOBIUS_PAYMENT_KEYS', {
      get() {
        reads++;
        throw Error('Signer access before policy validation');
      },
    });
    await assert.rejects(
      paymentRecoveryConfiguration(values, f.quote),
      (error) => error.status === 503,
    );
    assert.equal(reads, 0);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'recorded',
  );
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
});

void test('authorization completed during observation is re-read before any unavailable old key is loaded', async (t) => {
  const f = await fixture(t),
    reads = f.watchKeys();
  let concurrent;
  f.state.beforeObservation = async () => {
    concurrent = await authorize(f);
  };
  const config = await paymentRecoveryConfiguration(f.values, f.quote);
  await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    config.rpc,
    config.getAuthorizationKeyPair,
    1_020_000,
  );
  assert.equal(reads(), 0);
  assert.deepEqual(f.sent, [concurrent.authorized_transaction]);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'submitted',
  );
});

void test('valid lazy signer is loaded after observation and durable authorization precedes broadcast', async (t) => {
  const f = await fixture(t),
    encoded = f.values.NOOBIUS_PAYMENT_KEYS;
  const reads = f.watchKeys(encoded);
  const result = await recoverComputePayments(
    f.db,
    (quote) => paymentRecoveryConfiguration(f.values, quote),
    1_020_000,
  );
  assert.equal(result.pending, 1);
  assert.equal(result.errors, 0);
  assert.equal(reads(), 1);
  assert.deepEqual(f.events, [
    'getGenesisHash',
    'getTransaction',
    'getSlot',
    'getBlockHeight',
    'key-load',
    'getGenesisHash',
    'sendTransaction',
  ]);
  assert.equal(f.sent.length, 1);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).authorized_transaction,
    f.sent[0],
  );
});
