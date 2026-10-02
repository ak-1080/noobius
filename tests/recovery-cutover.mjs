// Called only by the owning local release runner. No hosted credentials,
// broadcasting, wallet fixtures or save paths from the caller are accepted.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
  signBytes,
} from '@solana/kit';
import { Client } from './api-client.mjs';
import { database } from './sqlite-d1.mjs';
import { newActiveFacility } from '../lib/facility.ts';
import { seedSkillXp } from '../lib/progression.ts';
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
const root = process.env.NOOBIUS_RELEASE_QA_ROOT;
const file = process.env.NOOBIUS_RESTORE_DATABASE_PATH;
if (
  !root ||
  process.env.NOOBIUS_TEST_ORIGIN !== 'http://127.0.0.1:3003' ||
  realpathSync(process.cwd()) !== realpathSync(root) ||
  !file ||
  !realpathSync(file).startsWith(realpathSync(root) + path.sep)
)
  throw Error(
    'Restore drill requires the runner-owned database and local app.',
  );
const recordFile = path.join(root, 'restore-fixture.json');
const source = database({ sqlite: new DatabaseSync(file), migrate: false });
source.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const phase = process.argv[2];
try {
  if (phase === 'seed') {
    const [buyer, seller, authorizer, mint] = await Promise.all(
      Array.from({ length: 4 }, () => generateKeyPairSigner()),
    );
    const clients = [];
    for (const [i, actor] of [buyer, seller].entries()) {
      const c = new Client({ address: actor.address });
      const nonce = ok(
        await c.request('nonce', {
          address: actor.address,
          ecosystem: 'solana',
        }),
      );
      ok(
        await c.request('verify', {
          signature:
            '0x' +
            Buffer.from(
              await signBytes(
                actor.keyPair.privateKey,
                new TextEncoder().encode(nonce.message),
              ),
            ).toString('hex'),
        }),
      );
      const p = ok(await c.request('profile')).profile;
      const facility = newActiveFacility();
      facility.builds = { 'rack-a': 3, 'rack-b': 3 };
      facility.inventory = {
        scrap: 19,
        copper: 23,
        silicon: 11,
        coolant: 5,
        chips: 3,
      };
      facility.workload = {
        id: crypto.randomUUID(),
        rack: 'rack-a',
        label: 'Reclaim a server',
        startedAt: Date.now(),
        readyAt: Date.now() + 3600000,
        reward: 8,
      };
      const wallet = 'solana:' + actor.address;
      source.sqlite
        .prepare(
          'UPDATE players SET name=?,credits=?,xp=?,skill_xp=?,facility_state=? WHERE wallet=?',
        )
        .run(
          'Recovery QA ' + i,
          2000,
          6050,
          JSON.stringify(seedSkillXp(6050)),
          JSON.stringify(facility),
          wallet,
        );
      source.sqlite
        .prepare(
          'INSERT INTO earning_events(id,wallet,browser_key,source,compute,materials,created_at) SELECT ?,wallet,browser_key,?,123,17,? FROM earning_accounts WHERE wallet=?',
        )
        .run(crypto.randomUUID(), 'restore-fixture', Date.now(), wallet);
      clients.push({ wallet, cookies: [...c.cookies], publicId: p.publicId });
    }
    const policy = {
      ecosystem: 'solana',
      network: 'devnet',
      contract: mint.address,
      tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      decimals: 6,
      threshold: '1000',
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
      authorizationSigner: authorizer.address,
      recentBlockhash: mint.address,
      lastValidBlockHeight: 100,
      contextSlot: 50,
    });
    await createComputeListing(
      source,
      {
        id: listingId,
        seller: clients[1].wallet,
        compute: 250,
        tokenAmount: '1000000',
      },
      policy,
    );
    await reserveComputePayment(
      source,
      listingId,
      clients[0].wallet,
      quote,
      policy,
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
      clients[0].wallet,
      buyerBytes,
    );
    const recorded = await getComputePayment(source, quote.quoteId);
    const authorized = await coSignRecordedPayment(
      quote,
      { signature: recorded.buyer_signature, transactionBase64: buyerBytes },
      authorizer.keyPair,
    );
    for (const c of clients) {
      const client = new Client();
      client.cookies = new Map(c.cookies);
      c.profile = ok(await client.request('profile')).profile;
    }
    writeFileSync(
      recordFile,
      JSON.stringify({
        clients,
        quoteId: quote.quoteId,
        listingId,
        authorized: authorized.transactionBase64,
      }),
      { mode: 0o600 },
    );
    console.log(
      'Seeded two generated saves, skill tracks, supplies, finite work, earning allowances and one recorded checkout. No signing keys persisted.',
    );
  } else {
    const saved = JSON.parse(readFileSync(recordFile, 'utf8'));
    assert.deepEqual(
      source.sqlite
        .prepare('PRAGMA integrity_check')
        .all()
        .map((x) => x.integrity_check),
      ['ok'],
    );
    assert.deepEqual(
      source.sqlite.prepare('PRAGMA foreign_key_check').all(),
      [],
    );
    const health = await fetch('http://127.0.0.1:3003/api/health');
    assert.equal(health.status, 200);
    for (const c of saved.clients) {
      const client = new Client();
      client.cookies = new Map(c.cookies);
      const actual = ok(await client.request('profile')).profile;
      const expected = structuredClone(c.profile);
      if (
        ['settled', 'rollback-write'].includes(phase) &&
        c === saved.clients[0]
      ) {
        expected.credits += 250;
        expected.facility.compute += 250;
      }
      assert.deepEqual(
        actual,
        expected,
        'App must preserve the exact saved profile, supplies, skill XP, work and quota',
      );
      assert.equal(actual.publicId, c.publicId);
    }
    if (phase === 'reconcile') {
      const receipt = {
        slot: 110,
        meta: { err: null },
        transaction: [saved.authorized, 'base64'],
      };
      const rpc = {
        observe: async () => ({ status: 'settled', transaction: receipt }),
        broadcast: () => {
          throw Error('Restore must not broadcast another payment');
        },
      };
      await Promise.all([
        reconcileComputePayment(source, saved.quoteId, rpc),
        reconcileComputePayment(source, saved.quoteId, rpc),
      ]);
      await reconcileComputePayment(source, saved.quoteId, rpc);
      assert.equal(
        (await getComputePayment(source, saved.quoteId)).status,
        'settled',
      );
      assert.equal(
        (await getComputeListing(source, saved.listingId)).status,
        'sold',
      );
    } else if (phase === 'restored') {
      assert.equal(
        (await getComputePayment(source, saved.quoteId)).status,
        'recorded',
      );
      assert.equal(
        (await getComputeListing(source, saved.listingId)).status,
        'reserved',
      );
    } else if (phase === 'rollback-write') {
      const c = saved.clients[1],
        client = new Client();
      client.cookies = new Map(c.cookies);
      const changed = ok(
        await client.request('name', {
          expectedWallet: c.wallet,
          name: 'Rollback QA',
        }),
      ).profile;
      assert.equal(changed.name, 'Rollback QA');
      c.profile.name = changed.name;
      writeFileSync(recordFile, JSON.stringify(saved), { mode: 0o600 });
    } else assert.equal(phase, 'settled');
    console.log(
      'Verified ' +
        phase +
        ': schema health, exact saved profiles and escrow/payment state.',
    );
  }
} finally {
  source.sqlite.close();
}
