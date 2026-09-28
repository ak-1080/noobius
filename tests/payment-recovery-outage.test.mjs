import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import { database } from './sqlite-d1.mjs';
import {
  createComputePaymentQuote,
  coSignRecordedPayment,
  encodePaymentTransaction,
} from '../lib/solana-payment.ts';
import {
  createComputeListing,
  reserveComputePayment,
  recordBuyerComputePayment,
  getComputePayment,
  getComputeListing,
  ComputeMarketError,
} from '../lib/compute-market.ts';
import {
  recoverComputePayments,
  reconcileComputePayment,
  paymentRecoveryErrorCategory,
} from '../lib/compute-payment-recovery.ts';
import { ComputePaymentRpc } from '../lib/compute-payment-rpc.ts';
import { SOLANA_GENESIS } from '../lib/solana-holdings.ts';
import recoveryWorker from '../services/payment-recovery/worker.ts';

async function fixture(t) {
  const db = database();
  t.after(() => db.sqlite.close());
  const [buyer, seller, signer, mint] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
  const wallet = (actor) => 'solana:' + actor.address;
  for (const actor of [buyer, seller])
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
      )
      .run(wallet(actor), 'Isolated outage QA', 1000, 1_000_000);
  const policy = {
    ecosystem: 'solana',
    network: 'devnet',
    contract: mint.address,
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    decimals: 6,
    threshold: '1',
    key: 'isolated-outage',
    rpcUrl: 'https://unused.example',
  };
  const listingId = crypto.randomUUID();
  const quote = await createComputePaymentQuote({
    quoteId: crypto.randomUUID(),
    network: 'devnet',
    mint: mint.address,
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
  const signed = encodePaymentTransaction(
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
    signed,
    1_000_001,
  );
  const credits = (actor) =>
    db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get(wallet(actor)).credits;
  return { db, buyer, seller, signer, quote, listingId, credits, policy };
}

void test('actual scheduled handler logs fixed failure labels, fails the event, and leaves approval recoverable by the next healthy cron', async (t) => {
  const f = await fixture(t);
  const privateUrl = 'https://private.invalid/?api-key=DO_NOT_LOG';
  const env = {
    DB: f.db,
    NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
    NOOBIUS_SOLANA_NETWORK: 'unsupported',
    NOOBIUS_TOKEN_MINT: f.quote.mint,
    NOOBIUS_TOKEN_DECIMALS: '6',
    NOOBIUS_TOKEN_THRESHOLD: '1',
    NOOBIUS_TOKEN_RPC_URL: privateUrl,
  };
  let now = 1_020_000;
  t.mock.method(Date, 'now', () => now);
  const logs = [];
  t.mock.method(console, 'log', (message) => logs.push(message));
  const methods = [];
  const savedBefore = await getComputePayment(f.db, f.quote.quoteId);
  const authorized = await coSignRecordedPayment(
    f.quote,
    {
      signature: savedBefore.buyer_signature,
      transactionBase64: savedBefore.buyer_transaction,
    },
    f.signer.keyPair,
  );
  const finalized = {
    slot: 110,
    meta: { err: null },
    transaction: [authorized.transactionBase64, 'base64'],
  };
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const { id, method } = JSON.parse(init.body);
    methods.push(method);
    assert.ok(['getGenesisHash', 'getTransaction'].includes(method));
    return Response.json({
      jsonrpc: '2.0',
      id,
      result: method === 'getGenesisHash' ? SOLANA_GENESIS.devnet : finalized,
    });
  });

  await assert.rejects(recoveryWorker.scheduled({}, env), {
    message: 'Compute payment recovery has unresolved errors.',
  });
  assert.deepEqual(
    logs.map((message) => JSON.parse(message)),
    [
      {
        event: 'compute-payment-recovery',
        checked: 1,
        settled: 0,
        expired: 0,
        failed: 0,
        pending: 0,
        errors: 1,
        errorStages: { configuration: 1 },
        errorCategories: { 'token-policy-unavailable': 1 },
      },
    ],
  );
  assert.ok(!logs.join('\n').includes(privateUrl));
  assert.ok(!logs.join('\n').includes(f.quote.buyer));
  assert.ok(!logs.join('\n').includes(savedBefore.buyer_signature));
  assert.deepEqual(methods, []);
  const retained = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(retained.status, 'recorded');
  assert.equal(retained.buyer_transaction, savedBefore.buyer_transaction);
  assert.equal(retained.buyer_signature, savedBefore.buyer_signature);
  assert.equal(retained.authorized_transaction, null);
  assert.equal(retained.updated_at, now);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(f.credits(f.buyer), 1000);
  assert.equal(f.credits(f.seller), 750);

  // A later independent event sees trusted finality without importing an old
  // signing key, making another transfer or invoking any buyer status endpoint.
  now = 1_040_000;
  env.NOOBIUS_SOLANA_NETWORK = 'devnet';
  await recoveryWorker.scheduled({}, env);
  assert.deepEqual(JSON.parse(logs[1]), {
    event: 'compute-payment-recovery',
    checked: 1,
    settled: 1,
    expired: 0,
    failed: 0,
    pending: 0,
    errors: 0,
  });
  assert.deepEqual(methods, ['getGenesisHash', 'getTransaction']);
  const settled = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(settled.status, 'settled');
  assert.equal(settled.buyer_signature, savedBefore.buyer_signature);
  assert.equal(settled.finalized_slot, 110);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'sold');
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
  now = 1_060_000;
  await recoveryWorker.scheduled({}, env);
  assert.equal(logs.length, 2);
  assert.equal(methods.length, 2);
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
});

// No external provider or wallet is touched. This exercises the production
// scheduled recovery core against actual D1-compatible SQLite and real signed
// payment messages, with a deliberately unavailable/ambiguous chain boundary.
void test('scheduled recovery preserves a recorded approval during provider outage and settles once after availability returns without the buyer', async (t) => {
  const f = await fixture(t);
  const outageCalls = [];
  const unavailable = new ComputePaymentRpc(f.policy, async (_url, init) => {
    outageCalls.push(JSON.parse(init.body).method);
    return new Response(null, { status: 503 });
  });
  const diagnostics = [];
  const failed = await recoverComputePayments(
    f.db,
    async () => ({ rpc: unavailable, keyPair: f.signer.keyPair }),
    1_020_000,
    (diagnostic) => diagnostics.push(diagnostic),
  );
  assert.deepEqual(failed, {
    checked: 1,
    settled: 0,
    expired: 0,
    failed: 0,
    pending: 0,
    errors: 1,
  });
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'recorded');
  assert.equal(saved.authorized_transaction, null);
  assert.ok(saved.buyer_transaction);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(f.credits(f.buyer), 1000);
  assert.equal(f.credits(f.seller), 750);
  assert.ok(outageCalls.length >= 1);
  assert.ok(outageCalls.every((method) => method !== 'sendTransaction'));
  assert.deepEqual(diagnostics, [
    { stage: 'observation', category: 'rpc-unavailable' },
  ]);

  const sent = [];
  let finalized = null;
  const rpc = {
    observe: async () =>
      finalized
        ? { status: 'settled', transaction: finalized }
        : { status: 'pending' },
    broadcast: async (wire, signature) => {
      const payment = await getComputePayment(f.db, f.quote.quoteId);
      assert.equal(payment.status, 'submitted');
      assert.equal(payment.authorized_transaction, wire);
      assert.equal(payment.buyer_signature, signature);
      sent.push(wire);
    },
  };
  const pending = await recoverComputePayments(
    f.db,
    async () => ({ rpc, keyPair: f.signer.keyPair }),
    1_040_000,
  );
  assert.equal(pending.pending, 1);
  assert.equal(pending.errors, 0);
  assert.equal(sent.length, 1);
  finalized = {
    slot: 110,
    meta: { err: null },
    transaction: [sent[0], 'base64'],
  };
  // The next independent scheduled run can use durable bytes/receipt alone;
  // the original request and authorization key are no longer required.
  const recovered = await recoverComputePayments(
    f.db,
    async () => ({ rpc }),
    1_060_000,
  );
  assert.equal(recovered.settled, 1);
  assert.equal(recovered.errors, 0);
  await Promise.all(
    [1, 2].map(() =>
      reconcileComputePayment(f.db, f.quote.quoteId, rpc, undefined, 1_060_001),
    ),
  );
  assert.equal(
    (await recoverComputePayments(f.db, async () => ({ rpc }), 1_080_000))
      .checked,
    0,
  );
  assert.equal(sent.length, 1);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'settled',
  );
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'sold');
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
});

void test('scheduled recovery retains authorized bytes after an ambiguous broadcast and observes finality without creating a replacement transfer', async (t) => {
  const f = await fixture(t);
  let broadcasts = 0;
  const unavailableRpc = {
    observe: async () => ({ status: 'pending' }),
    broadcast: async (wire, signature) => {
      const payment = await getComputePayment(f.db, f.quote.quoteId);
      assert.equal(payment.authorized_transaction, wire);
      assert.equal(payment.buyer_signature, signature);
      broadcasts++;
      throw Error('Controlled response lost after send');
    },
  };
  const failed = await recoverComputePayments(
    f.db,
    async () => ({ rpc: unavailableRpc, keyPair: f.signer.keyPair }),
    1_020_000,
  );
  assert.equal(failed.errors, 1);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  assert.ok(saved.authorized_transaction);
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
  assert.equal(f.credits(f.buyer), 1000);
  assert.equal(f.credits(f.seller), 750);
  const finalized = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  const restoredRpc = {
    observe: async (_quote, signature) => {
      assert.equal(signature, saved.buyer_signature);
      return { status: 'settled', transaction: finalized };
    },
    broadcast: () => {
      throw Error('A known finalized receipt must not be broadcast again');
    },
  };
  const recovered = await recoverComputePayments(
    f.db,
    async () => ({ rpc: restoredRpc }),
    1_040_000,
  );
  assert.equal(recovered.settled, 1);
  await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    restoredRpc,
    undefined,
    1_040_001,
  );
  assert.equal(broadcasts, 1);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).buyer_signature,
    saved.buyer_signature,
  );
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
});

void test('scheduled recovery diagnostics distinguish configuration stages without retaining private exception text', async (t) => {
  const f = await fixture(t);
  const secret = 'https://private.invalid/?api-key=DO_NOT_LOG';
  const diagnostics = [];
  const counts = await recoverComputePayments(
    f.db,
    async () => {
      throw new ComputeMarketError(503, secret);
    },
    1_020_000,
    (diagnostic) => diagnostics.push(diagnostic),
  );
  assert.equal(counts.errors, 1);
  assert.deepEqual(diagnostics, [
    { stage: 'configuration', category: 'configuration-unavailable' },
  ]);
  assert.ok(!JSON.stringify(diagnostics).includes(secret));
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'recorded',
  );
  assert.equal((await getComputeListing(f.db, f.listingId)).status, 'reserved');
});

void test('throwing stage/error observers cannot prevent durable authorization, error bookkeeping or later settlement', async (t) => {
  const f = await fixture(t);
  const rpc = {
    observe: async () => ({ status: 'pending' }),
    broadcast: async () => {
      throw Error('Controlled failed broadcast');
    },
  };
  await assert.rejects(
    reconcileComputePayment(
      f.db,
      f.quote.quoteId,
      rpc,
      f.signer.keyPair,
      1_020_000,
      () => {
        throw Error('Observer must not affect authority');
      },
    ),
    /Controlled failed broadcast/,
  );
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  assert.ok(saved.authorized_transaction);
  const counts = await recoverComputePayments(
    f.db,
    async () => ({ rpc }),
    1_040_000,
    () => {
      throw Error('Error observer must not affect bookkeeping');
    },
  );
  assert.equal(counts.errors, 1);
  assert.equal(
    f.db.sqlite
      .prepare('SELECT updated_at FROM compute_payments WHERE id=?')
      .get(f.quote.quoteId).updated_at,
    1_040_000,
  );
  const finalized = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  const settled = await recoverComputePayments(
    f.db,
    async () => ({
      rpc: {
        observe: async () => ({ status: 'settled', transaction: finalized }),
        broadcast: () => {
          throw Error('No additional transfer permitted');
        },
      },
    }),
    1_060_000,
  );
  assert.equal(settled.settled, 1);
  assert.equal(f.credits(f.buyer), 1250);
  assert.equal(f.credits(f.seller), 750);
});

void test('diagnostic categories are fixed labels for runtime/storage failures, unknown values and malformed error objects', () => {
  const secret = 'https://private.invalid/?api-key=DO_NOT_LOG';
  const cases = [
    [new ReferenceError(secret), 'runtime-reference'],
    [new SyntaxError(secret), 'invalid-json'],
    [new DOMException(secret, 'OperationError'), 'runtime-operation'],
    [new Error('D1_ERROR: ' + secret), 'storage-failure'],
    [
      new Error('Payment network is temporarily unavailable.'),
      'rpc-unavailable',
    ],
    [new Error('Stale payment RPC response.'), 'rpc-invalid'],
    [new Error('Invalid buyer payment signature.'), 'payment-invalid'],
    [new Error(secret), 'unexpected-error'],
    [{ message: secret, stack: secret }, 'unexpected-error'],
    [
      new ComputeMarketError(
        503,
        'Token trading is not available yet. Your earned Compute stays in the game.',
      ),
      'token-policy-unavailable',
    ],
    [
      new ComputeMarketError(
        503,
        'This payment needs its original network configuration to finish. Your reservation is saved.',
      ),
      'quote-policy-mismatch',
    ],
    [
      new ComputeMarketError(
        503,
        'Payment authorization is unavailable. Your reservation is saved.',
      ),
      'authorization-unavailable',
    ],
  ];
  const poisoned = new Error();
  Object.defineProperty(poisoned, 'message', {
    get: () => {
      throw Error(secret);
    },
  });
  cases.push([poisoned, 'unexpected-error']);
  for (const [error, expected] of cases) {
    const category = paymentRecoveryErrorCategory(error);
    assert.equal(category, expected);
    assert.ok(!category.includes(secret));
  }
});
