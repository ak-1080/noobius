// Actual standalone Wrangler bundle, native workerd fetch and local D1. Every
// identity is generated here, and all RPC traffic is mocked with networking
// disabled. This catches runtime differences hidden by the game's fetch shim.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Miniflare, createFetchMock, Log, LogLevel } from 'miniflare';
import {
  generateKeyPairSigner,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  solanaHoldingPolicy,
} from '../lib/solana-holdings.ts';
import {
  coSignRecordedPayment,
  createComputePaymentQuote,
  encodePaymentTransaction,
} from '../lib/solana-payment.ts';
import {
  createComputeListing,
  getComputeListing,
  getComputePayment,
  recordBuyerComputePayment,
  reserveComputePayment,
} from '../lib/compute-market.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = (value) => createHash('sha256').update(value).digest('hex');
let bundleDirectory;

before(() => {
  // Existing .wrangler is ignored; the generated bundle contains no test keys.
  mkdirSync(path.join(root, '.wrangler'), { recursive: true });
  bundleDirectory = mkdtempSync(path.join(root, '.wrangler/recovery-runtime-'));
  chmodSync(bundleDirectory, 0o700);
  const result = spawnSync(
    path.join(root, 'node_modules/.bin/wrangler'),
    [
      'deploy',
      '--dry-run',
      '--config',
      'deploy/cloudflare/staging-payments.json',
      '--outdir',
      bundleDirectory,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        WRANGLER_SEND_METRICS: 'false',
      },
    },
  );
  // Do not emit Wrangler output: a developer's local environment can contain
  // provider credentials. An assertion reports only the process exit code.
  assert.equal(result.status, 0, 'Standalone recovery dry-run build failed.');
  assert.ok(readFileSync(path.join(bundleDirectory, 'worker.js')).length > 0);
});

after(() => {
  if (bundleDirectory)
    rmSync(bundleDirectory, { recursive: true, force: true });
});

async function fixture(
  t,
  {
    recorded = false,
    finalized = true,
    history = false,
    maintenance = false,
  } = {},
) {
  const [buyer, seller, signer, mint] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(true),
    generateKeyPairSigner(),
  ]);
  const privateJwk = await crypto.subtle.exportKey(
    'jwk',
    signer.keyPair.privateKey,
  );
  const publicBytes = Buffer.from(
    await crypto.subtle.exportKey('raw', signer.keyPair.publicKey),
  );
  const generatedSecret = Buffer.concat([
    Buffer.from(privateJwk.d, 'base64url'),
    publicBytes,
  ]).toString('base64');
  const bindings = {
    NOOBIUS_MAINTENANCE: maintenance ? 'true' : 'false',
    NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
    NOOBIUS_SOLANA_NETWORK: 'devnet',
    NOOBIUS_TOKEN_MINT: mint.address,
    NOOBIUS_TOKEN_PROGRAM: SPL_TOKEN_PROGRAM,
    NOOBIUS_TOKEN_DECIMALS: '6',
    NOOBIUS_TOKEN_THRESHOLD: '1',
    NOOBIUS_TOKEN_RPC_URL: 'https://unused.invalid/',
    NOOBIUS_PAYMENT_SIGNER: signer.address,
    // A durable submitted payment must recover without possessing a signer.
    NOOBIUS_PAYMENT_KEYS: JSON.stringify(
      recorded ? { [signer.address]: generatedSecret } : {},
    ),
    NOOBIUS_PAYMENTS_ENABLED: 'true',
  };
  const state = {
    finalized,
    calls: [],
    sent: [],
    expectedWire: null,
    signature: null,
    quote: null,
    batchCalls: 0,
    nextBlockhash: seller.address,
  };
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  fetchMock
    .get('https://unused.invalid')
    .intercept({ path: '/', method: 'POST' })
    .reply(200, async (options) => {
      // Miniflare forwards a ReadableStream rather than Undici's string body.
      const request = JSON.parse(await new Response(options.body).text());
      if (Array.isArray(request)) {
        assert.equal(history, true, 'Unexpected RPC batch.');
        assert.equal(
          request.length,
          2,
          'History must include both linked canonical blocks.',
        );
        state.batchCalls++;
        return JSON.stringify(
          request
            .map((item) => {
              assert.equal(item.method, 'getBlock');
              assert.equal(item.params[1].commitment, 'finalized');
              assert.equal(item.params[1].transactionDetails, 'signatures');
              const slot = item.params[0];
              assert.ok(slot === 50 || slot === 51);
              return {
                jsonrpc: '2.0',
                id: item.id,
                result: {
                  parentSlot: slot - 1,
                  blockHeight: slot === 50 ? 100 : 101,
                  blockhash:
                    slot === 50
                      ? state.quote.recentBlockhash
                      : state.nextBlockhash,
                  previousBlockhash:
                    slot === 50 ? buyer.address : state.quote.recentBlockhash,
                  signatures: [],
                },
              };
            })
            .reverse(),
        ); // Providers may return a batch in an arbitrary order.
      }
      state.calls.push(request.method);
      let result;
      switch (request.method) {
        case 'getGenesisHash':
          result = SOLANA_GENESIS.devnet;
          break;
        case 'getTransaction':
          assert.equal(request.params[1].commitment, 'finalized');
          result = state.finalized
            ? {
                slot: 110,
                meta: { err: null },
                transaction: [state.expectedWire, 'base64'],
              }
            : null;
          break;
        case 'getSlot':
          result = history ? 110 : 80;
          break;
        case 'getBlockHeight':
          result = history ? 101 : 90;
          break;
        case 'isBlockhashValid':
          assert.equal(history, true);
          result = { context: { slot: 110 }, value: false };
          break;
        case 'getBlocksWithLimit':
          assert.equal(history, true);
          assert.equal(request.params[0], 50);
          assert.equal(request.params[2].commitment, 'finalized');
          result = [50, 51];
          break;
        case 'sendTransaction':
          assert.equal(
            digest(request.params[0]),
            digest(state.expectedWire),
            'Recovery must broadcast only the original authorized transaction.',
          );
          assert.equal(request.params[1].skipPreflight, false);
          state.sent.push(digest(request.params[0]));
          result = state.signature;
          break;
        default:
          throw Error('Unexpected local fixture RPC method.');
      }
      return JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
    })
    .persist();
  const mf = new Miniflare({
    modules: true,
    scriptPath: path.join(bundleDirectory, 'worker.js'),
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    host: '127.0.0.1',
    port: 0,
    bindings,
    d1Databases: { DB: randomUUID() },
    d1Persist: false,
    fetchMock,
    log: new Log(LogLevel.NONE),
  });
  t.after(async () => {
    await mf.dispose();
    await fetchMock.close();
  });
  const db = await mf.getD1Database('DB');
  const journal = JSON.parse(
    readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'),
  );
  for (const entry of journal.entries) {
    const statements = readFileSync(
      path.join(root, `drizzle/${entry.tag}.sql`),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .map((sql) => sql.trim())
      .filter(Boolean);
    for (const sql of statements) await db.prepare(sql).run();
  }
  const beganAt = Date.now() - 60000;
  for (const player of [buyer, seller]) {
    await db
      .prepare(
        'INSERT INTO players(wallet,name,credits,created_at) VALUES (?,?,?,?)',
      )
      .bind(`solana:${player.address}`, 'Local runtime QA', 1000, beganAt)
      .run();
  }
  const quote = await createComputePaymentQuote({
    quoteId: randomUUID(),
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
  const policy = solanaHoldingPolicy(bindings);
  state.quote = quote;
  assert.ok(policy);
  const listingId = randomUUID();
  await createComputeListing(
    db,
    {
      id: listingId,
      seller: `solana:${seller.address}`,
      compute: 250,
      tokenAmount: '1000000',
    },
    policy,
    beganAt,
  );
  await reserveComputePayment(
    db,
    listingId,
    `solana:${buyer.address}`,
    quote,
    policy,
    beganAt,
  );
  const buyerWire = encodePaymentTransaction(
    await partiallySignTransaction(
      [buyer.keyPair],
      getTransactionDecoder().decode(
        Buffer.from(quote.unsignedTransactionBase64, 'base64'),
      ),
    ),
  );
  const payment = await recordBuyerComputePayment(
    db,
    quote.quoteId,
    `solana:${buyer.address}`,
    buyerWire,
    beganAt + 1,
  );
  const authorized = await coSignRecordedPayment(
    quote,
    {
      signature: payment.buyer_signature,
      transactionBase64: buyerWire,
    },
    signer.keyPair,
  );
  state.expectedWire = authorized.transactionBase64;
  state.signature = authorized.signature;
  if (!recorded) {
    await db
      .prepare(
        "UPDATE compute_payments SET authorized_transaction=?,status='submitted',updated_at=? WHERE id=?",
      )
      .bind(authorized.transactionBase64, beganAt + 2, quote.quoteId)
      .run();
  }
  const worker = await mf.getWorker();
  const schedule = async () => {
    const outcome = await worker.scheduled({
      cron: '* * * * *',
      scheduledTime: new Date(),
    });
    assert.equal(outcome.outcome, 'ok');
  };
  const credits = async (player) =>
    (
      await db
        .prepare('SELECT credits FROM players WHERE wallet=?')
        .bind(`solana:${player.address}`)
        .first()
    ).credits;
  return { db, buyer, seller, quote, listingId, state, schedule, credits };
}

void test(
  'maintenance pauses the deployed recovery runtime without touching payment state or RPC',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t, { maintenance: true });
    const before = await getComputePayment(f.db, f.quote.quoteId);
    const listing = await getComputeListing(f.db, f.listingId);
    await f.schedule();
    assert.deepEqual(await getComputePayment(f.db, f.quote.quoteId), before);
    assert.deepEqual(await getComputeListing(f.db, f.listingId), listing);
    assert.deepEqual(f.state.calls, []);
    assert.deepEqual(f.state.sent, []);
    assert.equal(await f.credits(f.buyer), 1000);
    assert.equal(await f.credits(f.seller), 750);
  },
);

void test(
  'standalone scheduled workerd settles a finalized durable payment exactly once without a signing key',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t);
    assert.equal(await f.credits(f.buyer), 1000);
    assert.equal(await f.credits(f.seller), 750);
    await f.schedule();
    const payment = await getComputePayment(f.db, f.quote.quoteId);
    assert.equal(payment.status, 'settled');
    assert.equal(payment.finalized_slot, 110);
    assert.equal(
      digest(payment.authorized_transaction),
      digest(f.state.expectedWire),
    );
    assert.equal(payment.buyer_signature, f.state.signature);
    assert.equal((await getComputeListing(f.db, f.listingId)).status, 'sold');
    assert.equal(await f.credits(f.buyer), 1250);
    assert.equal(await f.credits(f.seller), 750);
    assert.deepEqual(f.state.calls, ['getGenesisHash', 'getTransaction']);
    assert.equal(f.state.sent.length, 0);
    const calls = f.state.calls.length;
    await f.schedule();
    assert.equal(
      f.state.calls.length,
      calls,
      'Settled rows must leave the recovery queue.',
    );
    assert.equal(
      await f.credits(f.buyer),
      1250,
      'A repeated cron must not deliver Compute twice.',
    );
  },
);

void test(
  'standalone scheduled workerd authorizes and broadcasts the original buyer message, then delivers only after finality',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t, { recorded: true, finalized: false });
    await f.schedule();
    const submitted = await getComputePayment(f.db, f.quote.quoteId);
    assert.equal(submitted.status, 'submitted');
    assert.equal(
      digest(submitted.authorized_transaction),
      digest(f.state.expectedWire),
    );
    assert.equal(submitted.buyer_signature, f.state.signature);
    assert.equal(
      (await getComputeListing(f.db, f.listingId)).status,
      'reserved',
    );
    assert.equal(f.state.sent.length, 1);
    assert.equal(
      await f.credits(f.buyer),
      1000,
      'An unfinalized payment must not deliver Compute.',
    );
    assert.equal(await f.credits(f.seller), 750);
    f.state.finalized = true;
    await f.db
      .prepare('UPDATE compute_payments SET updated_at=? WHERE id=?')
      .bind(Date.now() - 16000, f.quote.quoteId)
      .run();
    await f.schedule();
    assert.equal(
      (await getComputePayment(f.db, f.quote.quoteId)).status,
      'settled',
    );
    assert.equal(await f.credits(f.buyer), 1250);
    assert.equal(await f.credits(f.seller), 750);
    const calls = f.state.calls.length;
    await f.schedule();
    assert.equal(f.state.calls.length, calls);
    assert.equal(
      f.state.sent.length,
      1,
      'A finalized payment must never be broadcast again.',
    );
    assert.equal(await f.credits(f.buyer), 1250);
  },
);

void test(
  'standalone scheduled workerd uses native fetch for signature-only history batches before releasing an expired reservation',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t, { finalized: false, history: true });
    await f.schedule();
    const payment = await getComputePayment(f.db, f.quote.quoteId);
    assert.equal(payment.status, 'expired');
    assert.equal(payment.finalized_slot, 110);
    assert.equal(
      digest(payment.authorized_transaction),
      digest(f.state.expectedWire),
    );
    const listing = await getComputeListing(f.db, f.listingId);
    assert.equal(listing.status, 'open');
    assert.equal(listing.quote_id, null);
    assert.equal(
      f.state.batchCalls,
      1,
      'The separate signature-history fetch path must execute.',
    );
    assert.equal(f.state.sent.length, 0);
    assert.equal(
      await f.credits(f.buyer),
      1000,
      'An expired transfer earns no Compute.',
    );
    assert.equal(
      await f.credits(f.seller),
      750,
      'Compute stays escrowed in the reopened listing.',
    );
    const calls = f.state.calls.length;
    await f.schedule();
    assert.equal(f.state.calls.length, calls);
    assert.equal(f.state.batchCalls, 1);
  },
);
