import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { validSolanaAddress } from '../lib/solana-holdings.ts';

export const STAGING_CHECKOUT_ORIGIN =
  'https://noobius-game-staging.rinkydooonso.workers.dev';

// These checks precede every hosted database query, including fixture updates.
// An edited/deployed config must never silently redirect QA to production.
export function assertStagingCheckoutTarget(config) {
  assert.equal(config.name, 'noobius-game-staging');
  assert.equal(config.account_id, '818bac5a5a12b327928ded9344c453bb');
  assert.equal(config.vars?.NOOBIUS_SOLANA_NETWORK, 'devnet');
  assert.equal(config.vars?.NOOBIUS_SITE_ORIGIN, STAGING_CHECKOUT_ORIGIN);
  assert.equal(config.d1_databases?.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      ['binding', 'database_name', 'database_id'].map((key) => [
        key,
        config.d1_databases[0][key],
      ]),
    ),
    {
      binding: 'DB',
      database_name: 'noobius-game-staging',
      database_id: 'c996298e-b0ee-4edb-9684-33e44c22d5d8',
    },
  );
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const phases = ['submission-started', 'submitted', 'verified'];

// Only public, bounded test terms are persisted. No signer, raw transaction,
// session cookie or private RPC URL belongs in this checkpoint.
export function assertDetachedCheckpoint(checkpoint, identities) {
  assert.equal(checkpoint.version, 1);
  assert.equal(checkpoint.origin, STAGING_CHECKOUT_ORIGIN);
  assert.equal(checkpoint.network, 'devnet');
  for (const field of ['mint', 'buyer', 'seller'])
    assert.ok(validSolanaAddress(checkpoint[field]), `Invalid ${field}`);
  for (const field of ['paymentId', 'listingId'])
    assert.match(checkpoint[field], uuid);
  assert.equal(checkpoint.mint, identities.mint);
  assert.equal(checkpoint.buyer, identities.buyer);
  assert.equal(checkpoint.seller, identities.seller);
  assert.ok(checkpoint.buyer !== checkpoint.seller);
  assert.equal(checkpoint.compute, 250);
  assert.equal(checkpoint.amount, '1000000');
  assert.equal(checkpoint.decimals, 6);
  assert.ok(phases.includes(checkpoint.phase));
  assert.ok(Number.isFinite(Date.parse(checkpoint.startedAt)));
  if (checkpoint.departedAt !== undefined)
    assert.ok(Number.isFinite(Date.parse(checkpoint.departedAt)));
  assert.equal(base58.decode(checkpoint.signature).length, 64);
  for (const field of ['buyerTokensBefore', 'sellerTokensBefore'])
    assert.match(checkpoint[field], /^(0|[1-9][0-9]*)$/);
  assert.ok(BigInt(checkpoint.buyerTokensBefore) >= 1000000n);
  if (checkpoint.submittedStatus !== undefined)
    assert.ok(
      ['recorded', 'submitted', 'settled'].includes(checkpoint.submittedStatus),
    );
  const keys = new Set([
    'version',
    'origin',
    'network',
    'mint',
    'buyer',
    'seller',
    'paymentId',
    'listingId',
    'compute',
    'amount',
    'decimals',
    'phase',
    'startedAt',
    'signature',
    'buyerTokensBefore',
    'sellerTokensBefore',
    'submittedStatus',
    'verifiedAt',
    'departedAt',
  ]);
  assert.ok(Object.keys(checkpoint).every((key) => keys.has(key)));
  return checkpoint;
}

export async function submitDetachedCheckout(checkpoint, { persist, submit }) {
  // Durable intent comes first. Any ambiguous reply leaves this checkpoint in
  // place; neither this helper nor the later verifier can submit a second time.
  await persist(checkpoint, { exclusive: true });
  const receipt = await submit();
  assert.equal(receipt.id, checkpoint.paymentId);
  assert.equal(receipt.signature, checkpoint.signature);
  assert.ok(['recorded', 'submitted', 'settled'].includes(receipt.status));
  const saved = {
    ...checkpoint,
    phase: 'submitted',
    submittedStatus: receipt.status,
  };
  await persist(saved, { exclusive: false });
  return saved;
}

export function assertDetachedSettlement(checkpoint, row) {
  assert.ok(
    row,
    'The detached checkout has no durable payment record. Do not pay again.',
  );
  assert.equal(row.id, checkpoint.paymentId);
  assert.equal(row.listing_id, checkpoint.listingId);
  assert.equal(row.buyer, 'solana:' + checkpoint.buyer);
  assert.equal(row.buyer_signature, checkpoint.signature);
  assert.equal(row.network, 'devnet');
  assert.equal(row.mint, checkpoint.mint);
  assert.equal(row.amount, checkpoint.amount);
  assert.equal(row.decimals, checkpoint.decimals);
  assert.equal(row.compute, checkpoint.compute);
  assert.equal(row.seller, 'solana:' + checkpoint.seller);
  assert.equal(row.token_amount, checkpoint.amount);
  assert.equal(
    row.status,
    'settled',
    'Detached checkout has not settled independently. Read its saved status; do not submit again.',
  );
  assert.equal(row.listing_status, 'sold');
  assert.ok(Number.isSafeInteger(row.finalized_slot) && row.finalized_slot > 0);
  // A missing reply may have concealed synchronous settlement; an already
  // settled reply likewise proves no recovery after client departure. Preserve
  // that exact receipt, but do not label either case a successful cron drill.
  assert.ok(
    ['recorded', 'submitted'].includes(checkpoint.submittedStatus),
    'An acknowledged pending submission is required; this trial cannot prove detached cron recovery.',
  );
  assert.ok(Number.isFinite(Date.parse(checkpoint.departedAt)));
  assert.ok(
    Number.isSafeInteger(row.updated_at) &&
      row.updated_at >= Date.parse(checkpoint.departedAt),
    'Checkout settled before the original process left; detached cron recovery is unproven.',
  );
  return row;
}

export async function logoutGeneratedCheckoutClients(clients) {
  const failures = [];
  for (const [role, client] of Object.entries(clients)) {
    let complete = false;
    // Logout is idempotent and cannot reconcile, authorize or broadcast a
    // payment. A lost cleanup response can therefore be retried safely.
    for (let attempt = 0; attempt < 2 && !complete; attempt++) {
      try {
        complete =
          (await client.request('logout', client.body({}))).status === 200;
      } catch {
        /* one bounded retry below */
      }
    }
    if (!complete) failures.push(role);
  }
  assert.deepEqual(failures, [], 'Generated checkout session cleanup failed.');
}
