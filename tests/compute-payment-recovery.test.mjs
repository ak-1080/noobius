import {
  computeMarketSnapshot,
  handleComputeMarketAction,
  paymentConfiguration,
} from '../lib/compute-market-api.ts';
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
import { ComputePaymentRpc } from '../lib/compute-payment-rpc.ts';
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
  reconcileComputePayment,
  recoverComputePayments,
} from '../lib/compute-payment-recovery.ts';
async function fixture() {
  const db = database(),
    buyer = await generateKeyPairSigner(),
    seller = await generateKeyPairSigner(),
    signer = await generateKeyPairSigner(true),
    mint = await generateKeyPairSigner();
  for (const p of [buyer, seller])
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
      )
      .run('solana:' + p.address, 'Test', 1000, 1000000);
  const policy = {
      ecosystem: 'solana',
      network: 'devnet',
      contract: mint.address,
      tokenProgram: SPL_TOKEN_PROGRAM,
      decimals: 6,
      threshold: '888',
      key: 'devnet-token',
      rpcUrl: 'https://rpc.example',
    },
    id = crypto.randomUUID();
  const quote = await createComputePaymentQuote({
    quoteId: crypto.randomUUID(),
    network: 'devnet',
    mint: mint.address,
    buyer: buyer.address,
    seller: seller.address,
    decimals: 6,
    amount: '1000000',
    recentBlockhash: mint.address,
    lastValidBlockHeight: 100,
    contextSlot: 50,
    authorizationSigner: signer.address,
  });
  await createComputeListing(
    db,
    {
      id,
      seller: 'solana:' + seller.address,
      compute: 250,
      tokenAmount: '1000000',
    },
    policy,
    1000000,
  );
  await reserveComputePayment(
    db,
    id,
    'solana:' + buyer.address,
    quote,
    policy,
    1000000,
  );
  const signed = encodePaymentTransaction(
    await partiallySignTransaction(
      [buyer.keyPair],
      getTransactionDecoder().decode(
        Buffer.from(quote.unsignedTransactionBase64, 'base64'),
      ),
    ),
  );
  const record = () =>
    recordBuyerComputePayment(
      db,
      quote.quoteId,
      'solana:' + buyer.address,
      signed,
      1000001,
    );
  const calls = [],
    state = {
      tx: null,
      height: 99,
      slot: 120,
      status: null,
      valid: false,
      ledgerStart: 1,
      sendThrows: false,
      sent: [],
      wrongNetwork: false,
    };
  const fetcher = async (_url, init) => {
    const { method, id: requestId, params } = JSON.parse(init.body);
    calls.push({ method, params });
    let result;
    switch (method) {
      case 'getGenesisHash':
        result = state.wrongNetwork ? 'wrong' : SOLANA_GENESIS.devnet;
        break;
      case 'getTransaction':
        result = state.tx;
        assert.equal(params[1].commitment, 'finalized');
        break;
      case 'getSlot':
        result = state.slot;
        break;
      case 'getBlockHeight':
        result = state.height;
        break;
      case 'isBlockhashValid':
        result = { context: { slot: state.slot }, value: state.valid };
        break;
      case 'minimumLedgerSlot':
        result = state.ledgerStart;
        break;
      case 'getSignatureStatuses':
        assert.equal(params[1].searchTransactionHistory, true);
        result = {
          context: { slot: state.statusSlot ?? state.slot },
          value: [state.status],
        };
        break;
      case 'getAccountInfo':
        result = {
          context: { slot: 50 },
          value: {
            owner: state.program ?? SPL_TOKEN_PROGRAM,
            executable: false,
            data: {
              parsed: {
                type: 'mint',
                info: {
                  isInitialized: true,
                  decimals: 6,
                  ...(state.extensions === undefined
                    ? {}
                    : { extensions: state.extensions }),
                },
              },
            },
          },
        };
        break;
      case 'getLatestBlockhash':
        result = {
          context: { slot: 50 },
          value: { blockhash: mint.address, lastValidBlockHeight: 100 },
        };
        break;
      case 'sendTransaction': {
        const p = await getComputePayment(db, quote.quoteId);
        assert.equal(p.status, 'submitted');
        assert.equal(p.authorized_transaction, params[0]);
        assert.ok(p.buyer_signature);
        state.sent.push(params[0]);
        if (state.sendThrows) throw Error('Network disconnected after send');
        result = p.buyer_signature;
        break;
      }
      default:
        throw Error('Unexpected method ' + method);
    }
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: requestId, result }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  };
  const rpc = new ComputePaymentRpc(policy, fetcher);
  return {
    db,
    buyer,
    seller,
    signer,
    quote,
    id,
    policy,
    record,
    rpc,
    fetcher,
    state,
    calls,
  };
}
void test('RPC checks network and SPL mint before issuing a lifetime; wrong network or program fails closed', async () => {
  const f = await fixture();
  assert.equal((await f.rpc.quoteLifetime()).contextSlot, 50);
  f.state.wrongNetwork = true;
  await assert.rejects(f.rpc.quoteLifetime(), /network mismatch/);
  f.state.wrongNetwork = false;
  f.state.program = 'other';
  await assert.rejects(f.rpc.quoteLifetime(), /Unsupported/);
});
void test('Token-2022 quotes allow metadata but reject fees and other behavior-changing extensions', async () => {
  const f = await fixture();
  f.policy.tokenProgram = TOKEN_2022_PROGRAM;
  f.state.program = TOKEN_2022_PROGRAM;
  f.state.extensions = [
    { extension: 'metadataPointer', state: {} },
    { extension: 'tokenMetadata', state: {} },
  ];
  assert.equal((await f.rpc.quoteLifetime()).contextSlot, 50);
  for (const extension of [
    'transferFeeConfig',
    'transferHook',
    'nonTransferable',
  ]) {
    f.state.extensions = [{ extension, state: {} }];
    await assert.rejects(
      f.rpc.quoteLifetime(),
      /unsupported payment extensions/,
    );
  }
  f.state.extensions = [];
  assert.equal((await f.rpc.quoteLifetime()).contextSlot, 50);
});
void test('crash after recording and ambiguous broadcast recover by sending exactly the same durable transaction', async () => {
  const f = await fixture();
  await f.record();
  f.state.sendThrows = true;
  await assert.rejects(
    reconcileComputePayment(
      f.db,
      f.quote.quoteId,
      f.rpc,
      f.signer.keyPair,
      1000100,
    ),
    /temporarily unavailable/,
  );
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  assert.ok(saved.authorized_transaction);
  f.state.sendThrows = false;
  await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    f.rpc,
    undefined,
    1000200,
  );
  assert.deepEqual(f.state.sent, [
    saved.authorized_transaction,
    saved.authorized_transaction,
  ]);
  f.state.tx = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  await Promise.all(
    [1, 2].map(() =>
      reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, undefined, 1000300),
    ),
  );
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'settled',
  );
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.buyer.address).credits,
    1250,
  );
});
void test('application-signature persistence failure cannot expose a broadcastable transaction', async () => {
  const f = await fixture();
  await f.record();
  f.db.sqlite.exec(
    "CREATE TRIGGER fail_authorize BEFORE UPDATE OF authorized_transaction ON compute_payments BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;",
  );
  await assert.rejects(
    reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair),
    /storage unavailable/,
  );
  assert.equal(f.state.sent.length, 0);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'recorded',
  );
});
void test('known finalized failure releases the listing without crediting buyer or refunding seller twice', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const p = await getComputePayment(f.db, f.quote.quoteId);
  f.state.tx = {
    slot: 110,
    meta: { err: { InstructionError: [1, 'InsufficientFunds'] } },
    transaction: [p.authorized_transaction, 'base64'],
  };
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'failed',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'open');
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.seller.address).credits,
    750,
  );
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.buyer.address).credits,
    1000,
  );
});
void test('buyer-only checkout expires after finalized blockhash lifetime; missing RPC history alone never releases it', async () => {
  const f = await fixture();
  await f.record();
  const p = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(
    (await f.rpc.observe(f.quote, p.buyer_signature, true)).status,
    'pending',
  );
  f.state.height = 101;
  f.state.valid = true;
  assert.equal(
    (await f.rpc.observe(f.quote, p.buyer_signature, true)).status,
    'pending',
  );
  f.state.valid = false;
  assert.equal(
    (await f.rpc.observe(f.quote, p.buyer_signature)).status,
    'pending',
  );
  assert.equal(
    (await f.rpc.observe(f.quote, p.buyer_signature, true)).status,
    'expired',
  );
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'expired',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'open');
  assert.equal(f.state.sent.length, 0);
});
void test('signed and broadcastable checkout stays reserved when an RPC has no transaction history', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const payment = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(payment.status, 'submitted');
  assert.ok(payment.authorized_transaction);
  f.state.height = 101;
  f.state.valid = false;
  f.state.ledgerStart = 1;
  f.state.status = null;
  assert.equal(
    (await f.rpc.observe(f.quote, payment.buyer_signature)).status,
    'pending',
  );
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  assert.equal((await getComputePayment(f.db, f.quote.quoteId)).status, 'submitted');
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  assert.equal(f.state.sent.length, 2);
  assert.deepEqual(f.state.sent[0], f.state.sent[1]);
});
void test('recovery jobs preserve uncertain reservations and expire unsigned quotes without needing RPC', async () => {
  const f = await fixture();
  let result = await recoverComputePayments(
    f.db,
    async () => {
      throw Error('No RPC');
    },
    1090001,
  );
  assert.equal(result.expired, 1);
  assert.equal(result.errors, 0);
  const g = await fixture();
  await g.record();
  result = await recoverComputePayments(
    g.db,
    async () => {
      throw Error('No RPC');
    },
    1090001,
  );
  assert.equal(result.errors, 1);
  assert.equal(
    (await getComputePayment(g.db, g.quote.quoteId)).status,
    'recorded',
  );
  assert.equal((await getComputeListing(g.db, g.id)).status, 'reserved');
});
void test('expired and released checkout cannot be authorized after a delayed recovery read', async () => {
  const f = await fixture();
  await f.record();
  const delayed = {
    observe: async () => {
      f.state.height = 101;
      await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
      return { status: 'pending' };
    },
    broadcast: async () => {
      assert.fail('Terminal checkout was broadcast');
    },
  };
  await reconcileComputePayment(
    f.db,
    f.quote.quoteId,
    delayed,
    f.signer.keyPair,
  );
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'expired',
  );
});

void test('API gates new sales but permits cancellation during a pause and keeps signing secrets out of snapshots', async () => {
  const f = await fixture();
  const exported = await crypto.subtle.exportKey(
    'jwk',
    f.signer.keyPair.privateKey,
  );
  const secret = Buffer.concat([
    Buffer.from(exported.d, 'base64url'),
    Buffer.from(
      await crypto.subtle.exportKey('raw', f.signer.keyPair.publicKey),
    ),
  ]).toString('base64');
  const values = {
    NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
    NOOBIUS_SOLANA_NETWORK: 'devnet',
    NOOBIUS_TOKEN_MINT: f.policy.contract,
    NOOBIUS_TOKEN_DECIMALS: '6',
    NOOBIUS_TOKEN_RPC_URL: f.policy.rpcUrl,
    NOOBIUS_PAYMENTS_ENABLED: 'true',
    NOOBIUS_PAYMENT_SIGNER: f.signer.address,
    NOOBIUS_PAYMENT_KEYS: JSON.stringify({ [f.signer.address]: secret }),
  };
  assert.ok((await paymentConfiguration(values)).keyPair);
  const body = { id: crypto.randomUUID(), compute: 25, tokenAmount: '25000' },
    wallet = 'solana:' + f.seller.address;
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      wallet,
      'compute-listing-create',
      body,
      values,
      false,
    ),
    /Complete your first/,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  let created;
  try {
    created = await handleComputeMarketAction(
      f.db,
      wallet,
      'compute-listing-create',
      body,
      values,
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(created.listing.compute, 25);
  const snapshot = await computeMarketSnapshot(f.db, wallet, values);
  assert.equal(snapshot.available, true);
  for (const privateValue of [
    secret,
    values.NOOBIUS_PAYMENT_KEYS,
    values.NOOBIUS_TOKEN_RPC_URL,
  ])
    assert.ok(!JSON.stringify(snapshot).includes(privateValue));
  values.NOOBIUS_TRADE_PAUSED = 'true';
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      wallet,
      'compute-listing-create',
      { ...body, id: crypto.randomUUID() },
      values,
      true,
    ),
    /not available/,
  );
  assert.equal(
    (
      await handleComputeMarketAction(
        f.db,
        wallet,
        'compute-listing-cancel',
        { id: body.id },
        values,
        false,
      )
    ).listing.status,
    'cancelled',
  );
  assert.equal(
    (await computeMarketSnapshot(f.db, wallet, values)).available,
    false,
  );
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      '0x123',
      'compute-listing-create',
      body,
      values,
      true,
    ),
    /Solana wallet/,
  );
});
void test('checkout access is bound to the authenticated buyer; unavailable RPC cannot erase a recorded approval', async () => {
  const f = await fixture();
  await f.record();
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      'solana:' + f.seller.address,
      'compute-payment-status',
      { id: f.quote.quoteId },
      {},
      true,
    ),
    /not found/,
  );
  const result = await handleComputeMarketAction(
    f.db,
    'solana:' + f.buyer.address,
    'compute-payment-status',
    { id: f.quote.quoteId },
    {},
    false,
  );
  assert.equal(result.payment.status, 'recorded');
  assert.ok(!Object.hasOwn(result.payment, 'buyer_transaction'));
  assert.ok(!Object.hasOwn(result.payment, 'authorized_transaction'));
});
