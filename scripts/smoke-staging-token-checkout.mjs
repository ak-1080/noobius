// Isolated hosted devnet payment test. It modifies only the two generated test
// identities in staging D1; no production account or real token is involved.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from '../tests/api-client.mjs';
import {
  createKeyPairSignerFromBytes,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import { findAssociatedTokenPda as findLegacyAta } from '@solana-program/token';
import { findAssociatedTokenPda as findToken2022Ata } from '@solana-program/token-2022';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  validSolanaAddress,
} from '../lib/solana-holdings.ts';
import {
  encodePaymentTransaction,
  validateBuyerPayment,
} from '../lib/solana-payment.ts';
import { configuredDevnetRpcUrl } from './devnet-rpc-config.mjs';
import {
  STAGING_CHECKOUT_ORIGIN,
  assertStagingCheckoutTarget,
  assertDetachedCheckpoint,
  submitDetachedCheckout,
  assertDetachedSettlement,
  logoutGeneratedCheckoutClients,
} from './staging-checkout-acceptance.mjs';

const origin = STAGING_CHECKOUT_ORIGIN;
if (
  process.env.NOOBIUS_TEST_ORIGIN !== origin ||
  process.env.NOOBIUS_STAGING_TOKEN_CHECKOUT !== '1'
)
  throw Error('Explicit isolated staging checkout test flags are required.');
const mode = process.argv[2] ?? 'normal';
if (
  process.argv.length > 3 ||
  !['normal', '--prepare-detached', '--verify-detached'].includes(mode)
)
  throw Error(
    'Choose normal checkout, --prepare-detached or --verify-detached.',
  );
assertStagingCheckoutTarget(
  JSON.parse(readFileSync('deploy/cloudflare/staging-game.json', 'utf8')),
);
const proofPath = '.wrangler/noobius-devnet-proof.json';
const keysPath = '.wrangler/noobius-devnet-wallets.json';
const detachedPath = '.wrangler/noobius-staging-detached-checkout.json';
if (mode === '--prepare-detached' && existsSync(detachedPath))
  throw Error(
    'A detached checkout checkpoint already exists. Verify its original payment; do not pay again.',
  );
if (mode === '--verify-detached' && !existsSync(detachedPath))
  throw Error(
    'Prepare one detached checkout first. Verification never creates or submits a payment.',
  );
if (!existsSync(proofPath) || !existsSync(keysPath))
  throw Error(
    'Finalized devnet proof and generated test accounts are required.',
  );
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const saved = JSON.parse(readFileSync(keysPath, 'utf8'));
if (
  proof.network !== 'devnet' ||
  saved.network !== 'devnet' ||
  ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(proof.tokenProgram) ||
  proof.apiCheckout?.status !== 'settled'
)
  throw Error('This trial requires a settled real-devnet test-token proof.');
const mint = proof.mint;
const buyers = {};
for (const role of ['buyer', 'seller']) {
  if (!validSolanaAddress(saved[role]?.address) || !saved[role]?.secret)
    throw Error('Generated test account is missing.');
  buyers[role] = await createKeyPairSignerFromBytes(
    Buffer.from(saved[role].secret, 'base64'),
  );
  assert.equal(buyers[role].address, saved[role].address);
}

const rpcUrl = configuredDevnetRpcUrl();
async function rpc(method, params = []) {
  const id = crypto.randomUUID();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Devnet RPC unavailable for ' + method);
  const data = await response.json();
  if (data?.id !== id || data?.error || !Object.hasOwn(data, 'result'))
    throw Error('Devnet RPC rejected ' + method);
  return data.result;
}
assert.equal(await rpc('getGenesisHash'), SOLANA_GENESIS.devnet);

function d1(command) {
  assertStagingCheckoutTarget(
    JSON.parse(readFileSync('deploy/cloudflare/staging-game.json', 'utf8')),
  );
  const result = spawnSync(
    './node_modules/.bin/wrangler',
    [
      'd1',
      'execute',
      'DB',
      '--remote',
      '--config',
      'deploy/cloudflare/staging-game.json',
      '--command',
      command,
      '--json',
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    // Keep provider diagnostics private. Never retry an ambiguous database
    // mutation or expose possible signed URLs in Wrangler's error output.
    writeFileSync(
      '.wrangler/noobius-staging-checkout-d1-failure.log',
      result.stdout + '\n' + result.stderr,
      { mode: 0o600 },
    );
    throw Error('Isolated staging database query failed.');
  }
  const data = JSON.parse(result.stdout);
  if (data?.[0]?.success !== true || !Array.isArray(data[0].results))
    throw Error('Invalid isolated staging database reply.');
  return data[0].results;
}
function ok(reply) {
  assert.equal(reply.status, 200, JSON.stringify(reply.data));
  return reply.data;
}
const clients = {};
async function login(role) {
  const signer = buyers[role];
  const client = new Client({ address: signer.address });
  client.body = (body) => ({
    expectedWallet: 'solana:' + signer.address,
    ...body,
  });
  clients[role] = client; // Cleanup covers a rejected/lost verification reply too.
  const nonce = ok(
    await client.request('nonce', {
      address: signer.address,
      ecosystem: 'solana',
    }),
  );
  assert.match(nonce.message, /Chain ID: devnet/);
  const signature =
    '0x' +
    Buffer.from(
      await crypto.subtle.sign(
        'Ed25519',
        signer.keyPair.privateKey,
        new TextEncoder().encode(nonce.message),
      ),
    ).toString('hex');
  ok(await client.request('verify', { signature }));
  return client;
}
const findAta =
  proof.tokenProgram === TOKEN_2022_PROGRAM ? findToken2022Ata : findLegacyAta;
async function tokenBalance(owner) {
  const [ata] = await findAta({
    mint,
    owner,
    tokenProgram: proof.tokenProgram,
  });
  const account = (
    await rpc('getAccountInfo', [
      ata,
      {
        encoding: 'jsonParsed',
        commitment: 'finalized',
      },
    ])
  ).value;
  return BigInt(account?.data?.parsed?.info?.tokenAmount?.amount ?? '0');
}
const identities = {
  mint,
  buyer: buyers.buyer.address,
  seller: buyers.seller.address,
};
async function runCheckout() {
  if (mode === '--verify-detached') {
    const checkpoint = assertDetachedCheckpoint(
      JSON.parse(readFileSync(detachedPath, 'utf8')),
      identities,
    );
    assert.ok(
      Number.isFinite(Date.parse(checkpoint.departedAt)),
      'The original checkout process must finish its session cleanup first.',
    );
    assert.ok(
      Date.now() - Date.parse(checkpoint.departedAt) >= 90000,
      'Wait at least 90 seconds after the original process leaves before verifying unattended recovery.',
    );
    // The verifier does not call the payment-status API until the read-only
    // database query proves unattended settlement. That endpoint can reconcile
    // payments itself and would otherwise conceal a broken recovery cron.
    const rows = d1(
      `SELECT p.id,p.listing_id,p.buyer,p.buyer_signature,p.status,p.finalized_slot,p.updated_at,json_extract(p.quote_json,'$.network') AS network,json_extract(p.quote_json,'$.mint') AS mint,json_extract(p.quote_json,'$.amount') AS amount,json_extract(p.quote_json,'$.decimals') AS decimals,l.seller,l.compute,l.token_amount,l.status AS listing_status FROM compute_payments p JOIN compute_listings l ON l.id=p.listing_id WHERE p.id='${checkpoint.paymentId}'`,
    );
    assert.equal(rows.length, 1);
    assertDetachedSettlement(checkpoint, rows[0]);
    const chain = await rpc('getTransaction', [
      checkpoint.signature,
      {
        encoding: 'base64',
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      },
    ]);
    assert.equal(chain?.meta?.err, null);
    assert.equal(chain.slot, rows[0].finalized_slot);
    assert.equal(
      await tokenBalance(buyers.buyer.address),
      BigInt(checkpoint.buyerTokensBefore) - 1000000n,
    );
    assert.equal(
      await tokenBalance(buyers.seller.address),
      BigInt(checkpoint.sellerTokensBefore) + 1000000n,
    );
    const buyer = await login('buyer');
    const seller = await login('seller');
    assert.equal(ok(await buyer.request('profile')).profile.credits, 250);
    assert.equal(ok(await seller.request('profile')).profile.credits, 250);
    for (let i = 0; i < 2; i++) {
      const receipt = ok(
        await buyer.request(
          'compute-payment-status',
          buyer.body({
            id: checkpoint.paymentId,
          }),
        ),
      ).payment;
      assert.equal(receipt.status, 'settled');
      assert.equal(receipt.signature, checkpoint.signature);
      assert.equal(ok(await buyer.request('profile')).profile.credits, 250);
      assert.equal(ok(await seller.request('profile')).profile.credits, 250);
    }
    const result = {
      testedAt: new Date().toISOString(),
      origin,
      network: 'devnet',
      mint,
      paymentId: checkpoint.paymentId,
      signature: checkpoint.signature,
      initialStatus: checkpoint.submittedStatus,
      departedAt: checkpoint.departedAt,
      durableSettledAt: new Date(rows[0].updated_at).toISOString(),
      independentlyObservedAt: new Date().toISOString(),
      computeDelivered: 250,
      testTokensTransferred: '1',
      detachedProcess: true,
      settledBeforeAnyStatusApi: true,
      freshLogin: true,
      duplicateDeliveryPrevented: true,
      limitation:
        'Client process closed after one submission; no Worker crash or provider outage was injected.',
    };
    writeFileSync(
      detachedPath,
      JSON.stringify(
        {
          ...checkpoint,
          phase: 'verified',
          verifiedAt: result.testedAt,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    writeFileSync(
      '.wrangler/noobius-staging-detached-payment-proof.json',
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    return {
      label: 'HOSTED DETACHED DEVNET CHECKOUT PASSED',
      result,
      proofPath: '.wrangler/noobius-staging-detached-payment-proof.json',
    };
  }
  if (existsSync(detachedPath)) {
    const checkpoint = assertDetachedCheckpoint(
      JSON.parse(readFileSync(detachedPath, 'utf8')),
      identities,
    );
    if (checkpoint.phase !== 'verified')
      throw Error(
        'Verify the pending detached checkout before another fixture trial. Do not reset its balances.',
      );
  }
  const buyer = await login('buyer');
  const seller = await login('seller');
  const market = ok(await buyer.request('compute-market'));
  assert.equal(
    market.available,
    true,
    'Devnet staging must be explicitly enabled first.',
  );
  assert.equal(market.network, 'devnet');
  assert.equal(market.mint, mint);
  assert.equal(market.decimals, 6);
  const roles = [buyers.buyer.address, buyers.seller.address].map(
    (address) => "'solana:" + address + "'",
  );
  assert.deepEqual(
    d1(
      `SELECT COUNT(*) AS count FROM compute_payments WHERE status IN ('quoted','recorded','submitted') AND (buyer IN (${roles.join(',')}) OR listing_id IN (SELECT id FROM compute_listings WHERE seller IN (${roles.join(',')})))`,
    ),
    [{ count: 0 }],
    'Test accounts must have no unsettled hosted payment.',
  );
  assert.deepEqual(
    d1(
      `SELECT COUNT(*) AS count FROM compute_listings WHERE status='reserved' AND seller IN (${roles.join(',')})`,
    ),
    [{ count: 0 }],
    'Test accounts must have no reserved hosted listing.',
  );

  // Qualify two dedicated test identities for trading and give the seller an
  // isolated fixture balance. Ordinary gameplay/earning has separate acceptance.
  // Prior settled receipts are retained. Only an outstanding obligation blocks
  // fixture reset; a successful earlier trial must not require deleting history.
  for (const [role, amount] of [
    ['buyer', 0],
    ['seller', 500],
  ]) {
    const address = buyers[role].address;
    const result = d1(
      `UPDATE players SET credits=${amount},facility_state=json_set(facility_state,'$.stats.repairs',1) WHERE wallet='solana:${address}' RETURNING credits,json_extract(facility_state,'$.stats.repairs') AS repairs`,
    );
    assert.deepEqual(result, [{ credits: amount, repairs: 1 }]);
  }
  assert.equal(ok(await buyer.request('profile')).profile.credits, 0);
  assert.equal(ok(await seller.request('profile')).profile.credits, 500);

  const buyerBefore = await tokenBalance(buyers.buyer.address);
  const sellerBefore = await tokenBalance(buyers.seller.address);
  assert.ok(
    buyerBefore >= 1000000n,
    'Generated buyer needs one devnet test token.',
  );

  const listingId = crypto.randomUUID();
  const created = ok(
    await seller.request(
      'compute-listing-create',
      seller.body({
        id: listingId,
        compute: 250,
        tokenAmount: '1000000',
      }),
    ),
  );
  assert.equal(created.listing.status, 'open');
  const paymentId = crypto.randomUUID();
  const offered = ok(
    await buyer.request(
      'compute-payment-quote',
      buyer.body({
        id: paymentId,
        listingId,
      }),
    ),
  );
  assert.equal(offered.quote.network, 'devnet');
  assert.equal(offered.quote.mint, mint);
  assert.equal(offered.quote.tokenProgram, proof.tokenProgram);
  const signed = encodePaymentTransaction(
    await partiallySignTransaction(
      [buyers.buyer.keyPair],
      getTransactionDecoder().decode(
        Buffer.from(offered.quote.unsignedTransactionBase64, 'base64'),
      ),
    ),
  );
  if (mode === '--prepare-detached') {
    const recorded = await validateBuyerPayment(offered.quote, signed);
    const checkpoint = assertDetachedCheckpoint(
      {
        version: 1,
        origin,
        network: 'devnet',
        mint,
        buyer: buyers.buyer.address,
        seller: buyers.seller.address,
        paymentId,
        listingId,
        compute: 250,
        amount: '1000000',
        decimals: 6,
        phase: 'submission-started',
        startedAt: new Date().toISOString(),
        signature: recorded.signature,
        buyerTokensBefore: buyerBefore.toString(),
        sellerTokensBefore: sellerBefore.toString(),
      },
      identities,
    );
    const submitted = await submitDetachedCheckout(checkpoint, {
      persist: (value, { exclusive }) =>
        writeFileSync(detachedPath, JSON.stringify(value, null, 2), {
          mode: 0o600,
          flag: exclusive ? 'wx' : 'w',
        }),
      submit: async () =>
        ok(
          await buyer.request(
            'compute-payment-submit',
            buyer.body({
              id: paymentId,
              transaction: signed,
            }),
          ),
        ).payment,
    });
    return {
      label: 'DETACHED CHECKOUT SUBMITTED; THIS PROCESS IS CLOSING',
      result: {
        paymentId,
        signature: submitted.signature,
        status: submitted.submittedStatus,
        detachedRecoveryEligible: ['recorded', 'submitted'].includes(
          submitted.submittedStatus,
        ),
        next: 'Wait at least 90 seconds, then run --verify-detached. Do not submit again.',
        ...(submitted.submittedStatus === 'settled'
          ? {
              limitation:
                'This payment already settled in its submission request; detached cron recovery is unproven. Preserve this receipt.',
            }
          : {}),
      },
    };
  }
  let receipt = ok(
    await buyer.request(
      'compute-payment-submit',
      buyer.body({
        id: paymentId,
        transaction: signed,
      }),
    ),
  ).payment;
  assert.equal(typeof receipt.signature, 'string');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < 45 && receipt.status !== 'settled'; i++) {
    if (['failed', 'expired'].includes(receipt.status))
      throw Error('Hosted devnet purchase did not settle: ' + receipt.status);
    await sleep(4000);
    receipt = ok(
      await buyer.request(
        'compute-payment-status',
        buyer.body({
          id: paymentId,
        }),
      ),
    ).payment;
  }
  assert.equal(receipt.status, 'settled', 'Hosted devnet purchase timed out.');
  const chain = await rpc('getTransaction', [
    receipt.signature,
    {
      encoding: 'base64',
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    },
  ]);
  assert.equal(chain?.meta?.err, null);
  assert.equal(
    await tokenBalance(buyers.buyer.address),
    buyerBefore - 1000000n,
  );
  assert.equal(
    await tokenBalance(buyers.seller.address),
    sellerBefore + 1000000n,
  );
  assert.equal(ok(await buyer.request('profile')).profile.credits, 250);
  assert.equal(ok(await seller.request('profile')).profile.credits, 250);
  receipt = ok(
    await buyer.request(
      'compute-payment-status',
      buyer.body({
        id: paymentId,
      }),
    ),
  ).payment;
  assert.equal(receipt.status, 'settled');
  assert.equal(ok(await buyer.request('profile')).profile.credits, 250);

  const result = {
    testedAt: new Date().toISOString(),
    origin,
    network: 'devnet',
    mint,
    tokenProgram: proof.tokenProgram,
    signature: receipt.signature,
    computeDelivered: 250,
    testTokensTransferred: '1',
    duplicateDeliveryPrevented: true,
    ledger: 'isolated hosted Cloudflare staging D1',
    wallet: 'generated test accounts, not browser extensions',
  };
  writeFileSync(
    '.wrangler/noobius-staging-payment-proof.json',
    JSON.stringify(result, null, 2),
    {
      mode: 0o600,
    },
  );
  return {
    label: 'HOSTED DEVNET TEST-TOKEN CHECKOUT PASSED',
    result,
    proofPath: '.wrangler/noobius-staging-payment-proof.json',
  };
}
let completed;
try {
  completed = await runCheckout();
} finally {
  await logoutGeneratedCheckoutClients(clients);
  if (mode === '--prepare-detached' && existsSync(detachedPath)) {
    const checkpoint = assertDetachedCheckpoint(
      JSON.parse(readFileSync(detachedPath, 'utf8')),
      identities,
    );
    writeFileSync(
      detachedPath,
      JSON.stringify(
        {
          ...checkpoint,
          departedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
const finalResult = { ...completed.result, sessionCleanup: 'logged out' };
if (completed.proofPath)
  writeFileSync(completed.proofPath, JSON.stringify(finalResult, null, 2), {
    mode: 0o600,
  });
console.log(completed.label, JSON.stringify(finalResult));
