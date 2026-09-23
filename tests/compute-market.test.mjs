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
  encodePaymentTransaction,
  coSignRecordedPayment,
} from '../lib/solana-payment.ts';
import {
  createComputeListing,
  cancelComputeListing,
  reserveComputePayment,
  expireUnsignedComputeQuote,
  recordBuyerComputePayment,
  settleFinalizedComputePayment,
  getComputePayment,
  getComputeListing,
} from '../lib/compute-market.ts';
async function fixture() {
  const db = database(),
    seller = await generateKeyPairSigner(),
    buyer = await generateKeyPairSigner(),
    other = await generateKeyPairSigner(),
    signer = await generateKeyPairSigner(),
    mint = await generateKeyPairSigner();
  const wallet = (p) => 'solana:' + p.address,
    now = 1000000;
  for (const p of [seller, buyer, other])
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
      )
      .run(wallet(p), 'Test', 1000, now);
  const policy = {
    ecosystem: 'solana',
    network: 'devnet',
    contract: mint.address,
    tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    decimals: 6,
    threshold: '888',
    rpcUrl: 'https://rpc.example',
    key: 'test-devnet-mint',
  };
  const input = {
    id: crypto.randomUUID(),
    seller: wallet(seller),
    compute: 250,
    tokenAmount: '1000000',
  };
  const listing = () => createComputeListing(db, input, policy, now);
  const quote = async (p = buyer) =>
    createComputePaymentQuote({
      quoteId: crypto.randomUUID(),
      network: 'devnet',
      buyer: p.address,
      seller: seller.address,
      mint: mint.address,
      decimals: 6,
      amount: input.tokenAmount,
      authorizationSigner: signer.address,
      recentBlockhash: mint.address,
      lastValidBlockHeight: 100,
      contextSlot: 50,
    });
  const balance = (p) =>
    db.sqlite
      .prepare('SELECT credits FROM players WHERE wallet=?')
      .get(wallet(p)).credits;
  const signed = async (q) =>
    encodePaymentTransaction(
      await partiallySignTransaction(
        [buyer.keyPair],
        getTransactionDecoder().decode(
          Buffer.from(q.unsignedTransactionBase64, 'base64'),
        ),
      ),
    );
  return {
    db,
    seller,
    buyer,
    other,
    signer,
    policy,
    input,
    listing,
    quote,
    balance,
    signed,
    wallet,
    now,
  };
}
void test('listing reserves earned Compute once, rejects ID reuse, and refunds once under concurrent cancellations', async () => {
  const f = await fixture(),
    { db, input, policy, seller, other, balance, wallet } = f;
  await Promise.all([f.listing(), f.listing()]);
  assert.equal(balance(seller), 750);
  await assert.rejects(
    createComputeListing(db, { ...input, seller: wallet(other) }, policy),
    /conflicting/,
  );
  assert.equal(balance(other), 1000);
  await assert.rejects(
    cancelComputeListing(db, input.id, wallet(other)),
    /not found/,
  );
  await Promise.all([
    cancelComputeListing(db, input.id, wallet(seller)),
    cancelComputeListing(db, input.id, wallet(seller)),
  ]);
  assert.equal(balance(seller), 1000);
  assert.equal((await f.listing()).status, 'cancelled');
  assert.equal(balance(seller), 1000);
});
void test('concurrent listings cannot overspend and normal gameplay sees the reserved balance', async () => {
  const f = await fixture();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      createComputeListing(
        f.db,
        { ...f.input, id: crypto.randomUUID() },
        f.policy,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 4);
  assert.equal(f.balance(f.seller), 0);
  const spent = f.db.sqlite
    .prepare(
      'UPDATE players SET credits=credits-1 WHERE wallet=? AND credits>=1',
    )
    .run(f.wallet(f.seller));
  assert.equal(spent.changes, 0);
});
void test('two buyers race for one listing; exactly one reservation wins, cancellation cannot refund it', async () => {
  const f = await fixture();
  await f.listing();
  const quotes = await Promise.all([f.quote(), f.quote(f.other)]);
  const results = await Promise.allSettled(
    quotes.map((q) =>
      reserveComputePayment(
        f.db,
        f.input.id,
        'solana:' + q.buyer,
        q,
        f.policy,
        f.now,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(
    cancelComputeListing(f.db, f.input.id, f.wallet(f.seller)),
    /purchased/,
  );
  assert.equal(f.balance(f.seller), 750);
  const winner = results.find((r) => r.status === 'fulfilled').value;
  assert.equal((await getComputeListing(f.db, f.input.id)).quote_id, winner.id);
});
void test('same quote retries converge; one buyer cannot reserve two listings', async () => {
  const f = await fixture();
  await f.listing();
  const q = await f.quote();
  const reserves = await Promise.all(
    [0, 1].map(() =>
      reserveComputePayment(
        f.db,
        f.input.id,
        f.wallet(f.buyer),
        q,
        f.policy,
        f.now,
      ),
    ),
  );
  assert.equal(reserves[0].id, reserves[1].id);
  const second = { ...f.input, id: crypto.randomUUID() };
  await createComputeListing(f.db, second, f.policy, f.now);
  await assert.rejects(
    reserveComputePayment(
      f.db,
      second.id,
      f.wallet(f.buyer),
      await f.quote(),
      f.policy,
      f.now,
    ),
    /pending checkout/,
  );
});
void test('unsigned expiry releases only checkout, stale buyer approval cannot be recorded after release', async () => {
  const f = await fixture();
  await f.listing();
  const q = await f.quote(),
    wire = await f.signed(q);
  await reserveComputePayment(
    f.db,
    f.input.id,
    f.wallet(f.buyer),
    q,
    f.policy,
    f.now,
  );
  assert.equal(
    await expireUnsignedComputeQuote(f.db, q.quoteId, f.now + 89999),
    false,
  );
  assert.equal(
    await expireUnsignedComputeQuote(f.db, q.quoteId, f.now + 90000),
    true,
  );
  assert.equal(
    await expireUnsignedComputeQuote(f.db, q.quoteId, f.now + 90001),
    false,
  );
  await assert.rejects(
    recordBuyerComputePayment(
      f.db,
      q.quoteId,
      f.wallet(f.buyer),
      wire,
      f.now + 90001,
    ),
    /expired/,
  );
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'open');
  assert.equal(f.balance(f.seller), 750);
});
void test('record-before-expiry and expiry-before-record races preserve reservation or reject payment', async () => {
  for (const recordFirst of [true, false]) {
    const f = await fixture();
    await f.listing();
    const q = await f.quote(),
      wire = await f.signed(q);
    await reserveComputePayment(
      f.db,
      f.input.id,
      f.wallet(f.buyer),
      q,
      f.policy,
      f.now,
    );
    if (recordFirst) {
      await recordBuyerComputePayment(
        f.db,
        q.quoteId,
        f.wallet(f.buyer),
        wire,
        f.now + 89999,
      );
      assert.equal(
        await expireUnsignedComputeQuote(f.db, q.quoteId, f.now + 9999999),
        false,
      );
      assert.equal(
        (await getComputeListing(f.db, f.input.id)).status,
        'reserved',
      );
    } else {
      await expireUnsignedComputeQuote(f.db, q.quoteId, f.now + 90000);
      await assert.rejects(
        recordBuyerComputePayment(
          f.db,
          q.quoteId,
          f.wallet(f.buyer),
          wire,
          f.now + 90000,
        ),
      );
    }
  }
});
void test('exact finalized payment delivers Compute once across concurrent retries and later gameplay spending', async () => {
  const f = await fixture();
  await f.listing();
  const q = await f.quote(),
    wire = await f.signed(q);
  await reserveComputePayment(
    f.db,
    f.input.id,
    f.wallet(f.buyer),
    q,
    f.policy,
    f.now,
  );
  await assert.rejects(
    recordBuyerComputePayment(f.db, q.quoteId, f.wallet(f.other), wire, f.now),
    /not found/,
  );
  const p = await recordBuyerComputePayment(
    f.db,
    q.quoteId,
    f.wallet(f.buyer),
    wire,
    f.now,
  );
  const full = await coSignRecordedPayment(
    q,
    { signature: p.buyer_signature, transactionBase64: p.buyer_transaction },
    f.signer.keyPair,
  );
  const result = {
    slot: 123,
    meta: { err: null },
    transaction: [full.transactionBase64, 'base64'],
  };
  await assert.rejects(
    settleFinalizedComputePayment(f.db, q.quoteId, {
      ...result,
      meta: { err: 'failed' },
    }),
  );
  assert.equal(f.balance(f.buyer), 1000);
  const settlements = await Promise.all(
    [0, 1, 2].map(() => settleFinalizedComputePayment(f.db, q.quoteId, result)),
  );
  assert.equal(settlements.filter((r) => r.delivered).length, 1);
  assert.equal(f.balance(f.buyer), 1250);
  assert.equal(f.balance(f.seller), 750);
  f.db.sqlite
    .prepare('UPDATE players SET credits=credits-100 WHERE wallet=?')
    .run(f.wallet(f.buyer));
  assert.equal(
    (await settleFinalizedComputePayment(f.db, q.quoteId, result)).delivered,
    false,
  );
  assert.equal(f.balance(f.buyer), 1150);
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'sold');
});
void test('database failure rolls back reservation debit and finalized delivery together', async () => {
  const f = await fixture();
  f.db.sqlite.exec(
    "CREATE TRIGGER reject_credit BEFORE UPDATE OF credits ON players BEGIN SELECT RAISE(ABORT,'fault injection'); END;",
  );
  await assert.rejects(f.listing(), /fault injection/);
  assert.equal(await getComputeListing(f.db, f.input.id), null);
  assert.equal(f.balance(f.seller), 1000);
  f.db.sqlite.exec('DROP TRIGGER reject_credit');
  await f.listing();
  const q = await f.quote();
  await reserveComputePayment(
    f.db,
    f.input.id,
    f.wallet(f.buyer),
    q,
    f.policy,
    f.now,
  );
  const p = await recordBuyerComputePayment(
    f.db,
    q.quoteId,
    f.wallet(f.buyer),
    await f.signed(q),
    f.now,
  );
  const full = await coSignRecordedPayment(
    q,
    { signature: p.buyer_signature, transactionBase64: p.buyer_transaction },
    f.signer.keyPair,
  );
  f.db.sqlite.exec(
    "CREATE TRIGGER reject_credit BEFORE UPDATE OF credits ON players BEGIN SELECT RAISE(ABORT,'fault injection'); END;",
  );
  await assert.rejects(
    settleFinalizedComputePayment(f.db, q.quoteId, {
      slot: 123,
      meta: { err: null },
      transaction: [full.transactionBase64, 'base64'],
    }),
    /fault injection/,
  );
  assert.equal((await getComputePayment(f.db, q.quoteId)).status, 'recorded');
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'reserved');
  assert.equal(f.balance(f.buyer), 1000);
});

void test('buyer cancellation authenticates ownership and releases an unsigned reservation even while trading is disabled', async () => {
  const { handleComputeMarketAction, computeMarketSnapshot } =
    await import('../lib/compute-market-api.ts');
  const f = await fixture();
  await f.listing();
  const q = await f.quote();
  await reserveComputePayment(
    f.db,
    f.input.id,
    f.wallet(f.buyer),
    q,
    f.policy,
    Date.now(),
  );
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      f.wallet(f.other),
      'compute-payment-cancel',
      { id: q.quoteId },
      {},
      false,
    ),
    /not found/,
  );
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'reserved');
  const result = await handleComputeMarketAction(
    f.db,
    f.wallet(f.buyer),
    'compute-payment-cancel',
    { id: q.quoteId },
    {},
    false,
  );
  assert.equal(result.payment.status, 'expired');
  assert.equal(result.payment.compute, 250);
  assert.equal(result.payment.seller, f.seller.address);
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'open');
  assert.equal(f.balance(f.seller), 750);
  await assert.rejects(
    recordBuyerComputePayment(
      f.db,
      q.quoteId,
      f.wallet(f.buyer),
      await f.signed(q),
    ),
    /expired/,
  );
  const snapshot = await computeMarketSnapshot(f.db, f.wallet(f.seller), {});
  assert.equal(snapshot.available, false);
  assert.equal(
    snapshot.listings.length,
    1,
    'seller must recover Compute even if token configuration is removed',
  );
  assert.equal(snapshot.listings[0].currentToken, 0);
  await handleComputeMarketAction(
    f.db,
    f.wallet(f.seller),
    'compute-listing-cancel',
    { id: f.input.id },
    {},
    false,
  );
  assert.equal(f.balance(f.seller), 1000);
});
void test('recording before buyer cancellation prevents the reserved Compute from being released', async () => {
  const { handleComputeMarketAction } =
    await import('../lib/compute-market-api.ts');
  const f = await fixture();
  await f.listing();
  const q = await f.quote();
  await reserveComputePayment(
    f.db,
    f.input.id,
    f.wallet(f.buyer),
    q,
    f.policy,
    Date.now(),
  );
  await recordBuyerComputePayment(
    f.db,
    q.quoteId,
    f.wallet(f.buyer),
    await f.signed(q),
  );
  await assert.rejects(
    handleComputeMarketAction(
      f.db,
      f.wallet(f.buyer),
      'compute-payment-cancel',
      { id: q.quoteId },
      {},
      false,
    ),
    /already processing/,
  );
  assert.equal((await getComputePayment(f.db, q.quoteId)).status, 'recorded');
  assert.equal((await getComputeListing(f.db, f.input.id)).status, 'reserved');
  assert.equal(f.balance(f.seller), 750);
  assert.equal(f.balance(f.buyer), 1000);
});
