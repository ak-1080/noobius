import {
  computeMarketSnapshot,
  handleComputeMarketAction,
  paymentConfiguration,
} from '../lib/compute-market-api.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
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
      blockSlots: [],
      blocks: new Map(),
    };
  const fetcher = async (_url, init) => {
    assert.equal(new URL(_url).protocol, 'https:');
    assert.equal(init.redirect, 'manual');
    const payload = JSON.parse(init.body);
    if (Array.isArray(payload)) {
      assert.ok(payload.length <= 16);
      const results = [];
      for (const request of payload)
        results.push(
          await (
            await fetcher(_url, { ...init, body: JSON.stringify(request) })
          ).json(),
        );
      return Response.json(results.reverse()); // JSON-RPC batches may return out of order.
    }
    const { method, id: requestId, params } = payload;
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
      case 'getBlocksWithLimit':
        assert.equal(params[0], quote.contextSlot);
        assert.equal(params[1], 192);
        assert.equal(params[2].commitment, 'finalized');
        result = state.blockSlots;
        break;
      case 'getBlock':
        assert.equal(params[1].commitment, 'finalized');
        assert.equal(params[1].transactionDetails, 'signatures');
        result = state.blocks.get(params[0]) ?? null;
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
  assert.ok(
    f.calls.some(
      ({ method, params }) =>
        method === 'getLatestBlockhash' && params[0].commitment === 'confirmed',
    ),
  );
  f.state.wrongNetwork = true;
  await assert.rejects(f.rpc.quoteLifetime(), /network mismatch/);
  f.state.wrongNetwork = false;
  f.state.program = 'other';
  await assert.rejects(f.rpc.quoteLifetime(), /Unsupported/);
});
void test('a lagging finalized RPC node does not prevent co-signing a live buyer approval', async () => {
  const f = await fixture();
  await f.record();
  f.state.slot = 49;
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'submitted',
  );
  assert.equal(f.state.sent.length, 1);
  assert.ok(
    f.calls.some(
      ({ method, params }) =>
        method === 'sendTransaction' &&
        params[1].preflightCommitment === 'confirmed',
    ),
  );
});
void test('a separately verified RPC can quote and broadcast the same durable payment after a primary outage', async () => {
  const f = await fixture();
  const requests = [];
  const rpc = new ComputePaymentRpc(
    f.policy,
    async (url, init) => {
      requests.push({ url, method: JSON.parse(init.body).method });
      if (url === f.policy.rpcUrl) throw Error('Primary offline');
      return f.fetcher(url, init);
    },
    'https://history.example/private?key=backup-secret',
  );
  assert.equal((await rpc.quoteLifetime()).contextSlot, 50);
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, rpc, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  assert.deepEqual(f.state.sent, [saved.authorized_transaction]);
  assert.ok(
    requests.some(
      ({ url, method }) =>
        url.startsWith('https://history.example/') &&
        method === 'getGenesisHash',
    ),
  );
  assert.ok(
    requests.some(
      ({ url, method }) =>
        url.startsWith('https://history.example/') &&
        method === 'sendTransaction',
    ),
  );
});
void test('separate transaction history resolves a finalized payment that the primary cannot see', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  f.state.tx = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  const rpc = new ComputePaymentRpc(
    f.policy,
    async (url, init) => {
      const { id, method } = JSON.parse(init.body);
      if (url === f.policy.rpcUrl && method === 'getTransaction')
        return Response.json({ jsonrpc: '2.0', id, result: null });
      return f.fetcher(url, init);
    },
    'https://history.example',
  );
  await reconcileComputePayment(f.db, f.quote.quoteId, rpc);
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
void test('wrong-chain or unavailable fallback never releases a broadcastable reservation', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const rpc = new ComputePaymentRpc(
    f.policy,
    async (url, init) => {
      const { id, method } = JSON.parse(init.body);
      if (url !== f.policy.rpcUrl && method === 'getGenesisHash')
        return Response.json({ jsonrpc: '2.0', id, result: 'wrong-chain' });
      return f.fetcher(url, init);
    },
    'https://history.example/private?key=backup-secret',
  );
  await assert.rejects(
    reconcileComputePayment(f.db, f.quote.quoteId, rpc),
    (error) => error.message === 'Payment network is temporarily unavailable.',
  );
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'submitted',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
});
void test('two missing history results remain ambiguous and RPC fallback configuration stays private', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const rpc = new ComputePaymentRpc(
    f.policy,
    f.fetcher,
    'https://history.example/private?key=backup-secret',
  );
  await reconcileComputePayment(f.db, f.quote.quoteId, rpc);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'submitted',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  for (const fallback of [
    'http://history.example',
    'https://user:secret@history.example',
    f.policy.rpcUrl,
    'not a URL with secret',
  ])
    assert.throws(
      () => new ComputePaymentRpc(f.policy, f.fetcher, fallback),
      (error) => !error.message.includes('secret'),
    );
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
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'submitted',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  assert.equal(f.state.sent.length, 2);
  assert.deepEqual(f.state.sent[0], f.state.sent[1]);
});
function completeFinalizedHistory(f) {
  f.state.height = 101;
  f.state.valid = false;
  f.state.blockSlots = [50, 70, 120];
  f.state.blocks = new Map([
    [
      50,
      {
        blockHeight: 99,
        parentSlot: 49,
        blockhash: f.quote.recentBlockhash,
        previousBlockhash: f.signer.address,
        signatures: [],
      },
    ],
    [
      70,
      {
        blockHeight: 100,
        parentSlot: 50,
        blockhash: f.buyer.address,
        previousBlockhash: f.quote.recentBlockhash,
        signatures: [],
      },
    ],
    [
      120,
      {
        blockHeight: 101,
        parentSlot: 70,
        blockhash: f.seller.address,
        previousBlockhash: f.buyer.address,
        signatures: [],
      },
    ],
  ]);
}
void test('a rejected durable broadcast is released only after a complete finalized lifetime proves no execution', async () => {
  const f = await fixture();
  await f.record();
  f.state.sendThrows = true;
  await assert.rejects(
    reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair),
  );
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  completeFinalizedHistory(f);
  // Delayed recovery reads the quote's historical lifetime, even much later.
  f.state.slot = 10000;
  f.state.sendThrows = false;
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'expired',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'open');
  assert.equal(f.state.sent.length, 1);
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.buyer.address).credits,
    1000,
  );
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.seller.address).credits,
    750,
  );
  assert.equal(
    f.db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM compute_payments WHERE buyer=? AND status IN ('quoted','recorded','submitted')",
      )
      .get('solana:' + f.buyer.address).n,
    0,
  );
});
void test('a paid signature in any lifetime block stays reserved until delayed transaction history can verify delivery', async () => {
  for (const paidSlot of [50, 70, 120]) {
    const f = await fixture();
    await f.record();
    await reconcileComputePayment(
      f.db,
      f.quote.quoteId,
      f.rpc,
      f.signer.keyPair,
    );
    const saved = await getComputePayment(f.db, f.quote.quoteId);
    completeFinalizedHistory(f);
    f.state.blocks.get(paidSlot).signatures = [saved.buyer_signature];
    await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
    assert.equal(
      (await getComputePayment(f.db, f.quote.quoteId)).status,
      'submitted',
    );
    assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
    f.state.tx = {
      slot: paidSlot,
      meta: { err: null },
      transaction: [saved.authorized_transaction, 'base64'],
    };
    await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
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
  }
});
void test('partial, disconnected, forked or malformed finalized block history never releases a submitted checkout', async () => {
  for (const breakProof of [
    (f) => f.state.blocks.delete(70),
    (f) => {
      f.state.blockSlots = [50, 120];
    },
    (f) => {
      f.state.blocks.get(120).previousBlockhash = f.signer.address;
    },
    (f) => {
      f.state.blocks.get(120).parentSlot = 119;
    },
    (f) => {
      f.state.blocks.get(70).blockHeight = 98;
    },
    (f) => {
      f.state.blocks.get(50).blockhash = f.signer.address;
      f.state.blocks.get(70).previousBlockhash = f.signer.address;
    },
    (f) => {
      delete f.state.blocks.get(70).signatures;
    },
    (f) => {
      f.state.blocks.get(70).signatures = ['malformed'];
    },
    (f, signature) => {
      f.state.blocks.get(70).signatures = [signature.slice(0, 64)];
    },
    (f) => {
      f.state.blocks.get(120).blockHeight = 100;
    },
    (f) => {
      for (const block of f.state.blocks.values()) block.blockHeight += 2;
    },
    (f) => {
      f.state.blockSlots = Array.from(
        { length: 193 },
        (_, index) => 50 + index,
      );
    },
  ]) {
    const f = await fixture();
    await f.record();
    await reconcileComputePayment(
      f.db,
      f.quote.quoteId,
      f.rpc,
      f.signer.keyPair,
    );
    const saved = await getComputePayment(f.db, f.quote.quoteId);
    completeFinalizedHistory(f);
    breakProof(f, saved.buyer_signature);
    assert.equal(
      (await f.rpc.observe(f.quote, saved.buyer_signature)).status,
      'pending',
    );
    assert.equal(
      (await getComputePayment(f.db, f.quote.quoteId)).status,
      'submitted',
    );
    assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  }
});
void test('a separately verified history provider can prove nonexecution when the primary block history is pruned', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  completeFinalizedHistory(f);
  let fallbackBatch = false;
  const rpc = new ComputePaymentRpc(
    f.policy,
    async (url, init) => {
      const payload = JSON.parse(init.body);
      if (Array.isArray(payload)) {
        if (url === f.policy.rpcUrl)
          return Response.json(
            payload.map(({ id }) => ({ jsonrpc: '2.0', id, result: null })),
          );
        fallbackBatch = true;
      }
      return f.fetcher(url, init);
    },
    'https://history.example',
  );
  assert.equal(
    (await rpc.observe(f.quote, saved.buyer_signature)).status,
    'expired',
  );
  assert.equal(fallbackBatch, true);
});
void test('missing signature publication stays pending and a later complete block proof can release the reservation', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  completeFinalizedHistory(f);
  delete f.state.blocks.get(70).signatures;
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  f.state.blocks.get(70).signatures = [];
  const realNow = Date.now;
  const later = realNow() + 60001;
  try {
    Date.now = () => later;
    await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
  } finally {
    Date.now = realNow;
  }
  assert.equal(
    (await getComputePayment(f.db, f.quote.quoteId)).status,
    'expired',
  );
  assert.equal((await getComputeListing(f.db, f.id)).status, 'open');
});
void test('valid blockhashes do not trigger block scans; exhausted proof budgets and invalid batch identities stay pending', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  completeFinalizedHistory(f);
  f.state.valid = true;
  assert.equal(
    (await f.rpc.observe(f.quote, saved.buyer_signature)).status,
    'pending',
  );
  assert.ok(!f.calls.some(({ method }) => method === 'getBlocksWithLimit'));
  f.state.valid = false;
  const duplicateIds = new ComputePaymentRpc(f.policy, async (url, init) => {
    const result = await f.fetcher(url, init);
    if (!Array.isArray(JSON.parse(init.body))) return result;
    const batch = await result.json();
    batch[0].id = batch[1].id;
    return Response.json(batch);
  });
  assert.equal(
    (await duplicateIds.observe(f.quote, saved.buyer_signature)).status,
    'pending',
  );
  const realNow = Date.now;
  let now = realNow() + 60001;
  const budgeted = new ComputePaymentRpc(f.policy, async (url, init) => {
    if (JSON.parse(init.body).method === 'getBlocksWithLimit') now += 8001;
    return f.fetcher(url, init);
  });
  try {
    Date.now = () => now;
    f.calls.length = 0;
    assert.equal(
      (await budgeted.observe(f.quote, saved.buyer_signature)).status,
      'pending',
    );
    assert.ok(!f.calls.some(({ method }) => method === 'getBlock'));
  } finally {
    Date.now = realNow;
  }
});
void test('a full lifetime is proven in small sequential batches and incomplete history backs off across RPC instances', async () => {
  const f = await fixture();
  await f.record();
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  f.state.height = 200;
  f.state.slot = 500;
  const hashes = Array.from({ length: 160 }, (_, index) => {
    if (!index) return f.quote.recentBlockhash;
    const bytes = Buffer.alloc(32);
    bytes.writeUInt32LE(index, 0);
    return base58.encode(bytes);
  });
  f.state.blockSlots = hashes.map((_, index) => 50 + index * 2);
  f.state.blocks = new Map(
    f.state.blockSlots.map((slot, index) => [
      slot,
      {
        parentSlot: index ? f.state.blockSlots[index - 1] : 49,
        blockHeight: index + 1,
        blockhash: hashes[index],
        previousBlockhash: index ? hashes[index - 1] : f.signer.address,
        signatures: [],
      },
    ]),
  );
  let batches = 0,
    inFlight = false;
  const rpc = new ComputePaymentRpc(f.policy, async (url, init) => {
    const isBatch = Array.isArray(JSON.parse(init.body));
    if (isBatch) {
      assert.equal(inFlight, false);
      inFlight = true;
      batches++;
    }
    try {
      return await f.fetcher(url, init);
    } finally {
      if (isBatch) inFlight = false;
    }
  });
  assert.equal(
    (await rpc.observe(f.quote, saved.buyer_signature)).status,
    'expired',
  );
  assert.equal(batches, 10);
  assert.equal(
    f.calls.filter(({ method }) => method === 'getBlock').length,
    160,
  );
  f.state.blocks.delete(60);
  assert.equal(
    (await rpc.observe(f.quote, saved.buyer_signature)).status,
    'pending',
  );
  f.calls.length = 0;
  const recreated = new ComputePaymentRpc(f.policy, f.fetcher);
  assert.equal(
    (await recreated.observe(f.quote, saved.buyer_signature)).status,
    'pending',
  );
  assert.ok(f.calls.some(({ method }) => method === 'getTransaction'));
  assert.ok(
    !f.calls.some(
      ({ method }) => method === 'getBlocksWithLimit' || method === 'getBlock',
    ),
  );
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
void test('a stale buyer-only expiry cannot release a checkout concurrently authorized by another recovery', async () => {
  const f = await fixture();
  await f.record();
  const stale = {
    observe: async (_quote, signature, neverAuthorized) => {
      assert.equal(neverAuthorized, true);
      await reconcileComputePayment(
        f.db,
        f.quote.quoteId,
        f.rpc,
        f.signer.keyPair,
      );
      const concurrent = await getComputePayment(f.db, f.quote.quoteId);
      assert.equal(concurrent.status, 'submitted');
      assert.ok(concurrent.authorized_transaction);
      return { status: 'expired', signature, slot: 120 };
    },
    broadcast: async () =>
      assert.fail('Stale expiry must only preserve the current record'),
  };
  await reconcileComputePayment(f.db, f.quote.quoteId, stale, f.signer.keyPair);
  const saved = await getComputePayment(f.db, f.quote.quoteId);
  assert.equal(saved.status, 'submitted');
  assert.equal((await getComputeListing(f.db, f.id)).status, 'reserved');
  assert.equal(
    f.db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get('solana:' + f.buyer.address).credits,
    1000,
  );
  f.state.tx = {
    slot: 110,
    meta: { err: null },
    transaction: [saved.authorized_transaction, 'base64'],
  };
  await reconcileComputePayment(f.db, f.quote.quoteId, f.rpc);
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
