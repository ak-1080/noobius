import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
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
  reserveComputePayment,
  recordBuyerComputePayment,
  getComputePayment,
  getComputeListing,
} from '../lib/compute-market.ts';
import { reconcileComputePayment } from '../lib/compute-payment-recovery.ts';

// Actual file backup/reopen and production settlement modules. The chain
// boundary is controlled: these tests never broadcast or use a funded wallet.
for (const point of ['buyer-recorded', 'authorized-submitted']) {
  void test(`restored ${point} checkout reconciles a later finalized receipt once without the original process or signing key`, async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'noobius-restore-'));
    const source = database();
    let restored = null;
    t.after(() => {
      restored?.sqlite.close();
      source.sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const [buyer, seller, signer, mint] = await Promise.all([
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
    ]);
    const now = 1_000_000;
    const wallet = (actor) => 'solana:' + actor.address;
    for (const actor of [buyer, seller])
      source.sqlite
        .prepare(
          'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
        )
        .run(wallet(actor), 'Restore QA', 1000, now);
    const policy = {
      ecosystem: 'solana',
      network: 'devnet',
      contract: mint.address,
      tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      decimals: 6,
      threshold: '1',
      key: 'restore-test',
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
      source,
      {
        id: listingId,
        seller: wallet(seller),
        compute: 250,
        tokenAmount: '1000000',
      },
      policy,
      now,
    );
    await reserveComputePayment(
      source,
      listingId,
      wallet(buyer),
      quote,
      policy,
      now,
    );
    const buyerBytes = encodePaymentTransaction(
      await partiallySignTransaction(
        [buyer.keyPair],
        getTransactionDecoder().decode(
          Buffer.from(quote.unsignedTransactionBase64, 'base64'),
        ),
      ),
    );
    await recordBuyerComputePayment(
      source,
      quote.quoteId,
      wallet(buyer),
      buyerBytes,
      now + 1,
    );
    const recorded = await getComputePayment(source, quote.quoteId);
    const authorized = await coSignRecordedPayment(
      quote,
      {
        signature: recorded.buyer_signature,
        transactionBase64: buyerBytes,
      },
      signer.keyPair,
    );
    if (point === 'authorized-submitted')
      source.sqlite
        .prepare(
          "UPDATE compute_payments SET authorized_transaction=?,status='submitted' WHERE id=?",
        )
        .run(authorized.transactionBase64, quote.quoteId);

    const snapshot = path.join(directory, 'snapshot.sqlite');
    await backup(source.sqlite, snapshot);
    restored = database({ sqlite: new DatabaseSync(snapshot), migrate: false });
    assert.deepEqual(
      restored.sqlite
        .prepare('PRAGMA integrity_check')
        .all()
        .map((row) => row.integrity_check),
      ['ok'],
    );
    assert.equal(
      restored.sqlite.prepare('PRAGMA foreign_key_check').all().length,
      0,
    );
    assert.equal(
      (await getComputeListing(restored, listingId)).status,
      'reserved',
    );
    const initial = restored.sqlite.prepare(
      'SELECT credits FROM players WHERE wallet=?',
    );
    assert.equal(initial.get(wallet(buyer)).credits, 1000);
    assert.equal(initial.get(wallet(seller)).credits, 750);

    const finalized = {
      slot: 110,
      meta: { err: null },
      transaction: [authorized.transactionBase64, 'base64'],
    };
    let observations = 0;
    const rpc = {
      observe: async () => {
        observations++;
        return { status: 'settled', transaction: finalized };
      },
      broadcast: () => {
        throw Error('Restore must not create another transfer');
      },
    };
    // No authorization key is supplied to recovery. The exact quote/signature
    // in the backup identifies the finalized receipt from after the snapshot.
    await Promise.all([
      reconcileComputePayment(
        restored,
        quote.quoteId,
        rpc,
        undefined,
        now + 200,
      ),
      reconcileComputePayment(
        restored,
        quote.quoteId,
        rpc,
        undefined,
        now + 201,
      ),
    ]);
    await reconcileComputePayment(
      restored,
      quote.quoteId,
      rpc,
      undefined,
      now + 202,
    );
    assert.ok(observations >= 1);
    assert.equal(
      (await getComputePayment(restored, quote.quoteId)).status,
      'settled',
    );
    assert.equal((await getComputeListing(restored, listingId)).status, 'sold');
    assert.equal(initial.get(wallet(buyer)).credits, 1250);
    assert.equal(initial.get(wallet(seller)).credits, 750);
    assert.equal(
      restored.sqlite.prepare('PRAGMA foreign_key_check').all().length,
      0,
    );
  });
}
