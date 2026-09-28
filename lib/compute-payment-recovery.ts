import {
  getComputePayment,
  expireUnsignedComputeQuote,
  settleFinalizedComputePayment,
  ComputeMarketError,
} from './compute-market.ts';
import {
  coSignRecordedPayment,
  type ComputePaymentQuote,
} from './solana-payment.ts';
import { ComputePaymentRpc } from './compute-payment-rpc.ts';
export type PaymentRecoveryStage =
  | 'quote-validation'
  | 'quote-expiry'
  | 'configuration'
  | 'payment-read'
  | 'record-validation'
  | 'observation'
  | 'settlement'
  | 'reservation-release'
  | 'authorization'
  | 'authorization-persistence'
  | 'broadcast-persistence'
  | 'broadcast';
export type PaymentRecoveryErrorCategory =
  | 'configuration-unavailable'
  | 'token-policy-unavailable'
  | 'quote-policy-mismatch'
  | 'authorization-unavailable'
  | 'ledger-conflict'
  | 'rpc-unavailable'
  | 'rpc-invalid'
  | 'payment-invalid'
  | 'storage-failure'
  | 'runtime-reference'
  | 'runtime-operation'
  | 'invalid-json'
  | 'unexpected-error';
export type PaymentRecoveryDiagnostic = {
  stage: PaymentRecoveryStage;
  category: PaymentRecoveryErrorCategory;
};
export type PaymentAuthorizationSource =
  | CryptoKeyPair
  | (() => Promise<CryptoKeyPair | undefined>);

// Return fixed labels only. Exception messages/stacks can contain private RPC
// URLs or wire bytes and must never be copied into scheduled-worker logs.
export function paymentRecoveryErrorCategory(
  error: unknown,
): PaymentRecoveryErrorCategory {
  try {
    if (error instanceof ComputeMarketError) {
      if (error.status === 503) {
        if (
          error.message ===
          'Token trading is not available yet. Your earned Compute stays in the game.'
        )
          return 'token-policy-unavailable';
        if (
          error.message ===
          'This payment needs its original network configuration to finish. Your reservation is saved.'
        )
          return 'quote-policy-mismatch';
        if (
          error.message ===
          'Payment authorization is unavailable. Your reservation is saved.'
        )
          return 'authorization-unavailable';
      }
      return error.status === 503
        ? 'configuration-unavailable'
        : 'ledger-conflict';
    }
    if (error instanceof ReferenceError) return 'runtime-reference';
    if (error instanceof SyntaxError) return 'invalid-json';
    if (
      error instanceof DOMException &&
      ['OperationError', 'NotSupportedError', 'DataError'].includes(error.name)
    )
      return 'runtime-operation';
    const message = error instanceof Error ? error.message : '';
    if (typeof message !== 'string') return 'unexpected-error';
    if (
      message === 'Payment network is temporarily unavailable.' ||
      message === 'Payment network could not complete the request.' ||
      message === 'Payment submission result is uncertain.'
    )
      return 'rpc-unavailable';
    if (
      message === 'Malformed payment RPC response.' ||
      message === 'Stale payment RPC response.' ||
      message === 'Payment RPC network mismatch.' ||
      message === 'Fallback payment RPC network mismatch.' ||
      message === 'Payment history proof is incomplete.'
    )
      return 'rpc-invalid';
    if (/^(D1_|SQLITE_|SQLITE_BUSY\b)/.test(message)) return 'storage-failure';
    if (
      /^(Invalid .*payment|Invalid buyer payment|Stored payment quote|The signed payment|Wrong payment authorization|Recorded payment|Finalized payment|Payment is not a successful finalized)/.test(
        message,
      )
    )
      return 'payment-invalid';
  } catch {
    /* malformed error objects cannot affect recovery */
  }
  return 'unexpected-error';
}
// Call only with trusted configured RPC clients. A buyer's claimed receipt or
// timeout is never evidence for delivery or releasing the seller's reservation.
export async function reconcileComputePayment(
  db: D1Database,
  id: string,
  rpc: ComputePaymentRpc,
  authorization?: PaymentAuthorizationSource,
  now = Date.now(),
  onStage?: (stage: PaymentRecoveryStage) => void,
) {
  const stage = (value: PaymentRecoveryStage) => {
    try {
      onStage?.(value);
    } catch {
      /* telemetry cannot change payment authority */
    }
  };
  stage('payment-read');
  let payment = await getComputePayment(db, id);
  if (!payment) throw new ComputeMarketError(404, 'Checkout not found.');
  if (payment.status === 'quoted') {
    stage('quote-expiry');
    await expireUnsignedComputeQuote(db, id, now);
    return (await getComputePayment(db, id))!;
  }
  if (!['recorded', 'submitted'].includes(payment.status)) return payment;
  stage('record-validation');
  if (!payment.buyer_signature || !payment.buyer_transaction)
    throw Error('Recorded payment is incomplete.');
  const quote = JSON.parse(payment.quote_json) as ComputePaymentQuote;
  const neverAuthorized =
    payment.status === 'recorded' && !payment.authorized_transaction;
  stage('observation');
  const observed = await rpc.observe(
    quote,
    payment.buyer_signature,
    neverAuthorized,
  );
  if (observed.status === 'settled') {
    stage('settlement');
    return (
      await settleFinalizedComputePayment(db, id, observed.transaction, now)
    ).payment;
  }
  if (observed.status === 'failed' || observed.status === 'expired') {
    if (observed.signature !== payment.buyer_signature)
      throw Error('Recovery signature mismatch.');
    // A concurrent recovery can authorize while this network observation is
    // pending. Buyer-only expiry evidence is valid only if the durable record
    // still has never become broadcastable at the instant it is released.
    const buyerOnlyExpiry = observed.status === 'expired' && neverAuthorized;
    stage('reservation-release');
    await db.batch([
      db
        .prepare(
          "UPDATE compute_payments SET status=?,finalized_slot=?,updated_at=? WHERE id=? AND buyer_signature=? AND status IN ('recorded','submitted') AND (?=0 OR (status='recorded' AND authorized_transaction IS NULL)) AND EXISTS(SELECT 1 FROM compute_listings WHERE quote_id=? AND status='reserved')",
        )
        .bind(
          observed.status,
          observed.slot,
          now,
          id,
          observed.signature,
          buyerOnlyExpiry ? 1 : 0,
          id,
        ),
      db
        .prepare(
          "UPDATE compute_listings SET status='open',quote_id=NULL WHERE quote_id=? AND status='reserved' AND changes()=1",
        )
        .bind(id),
    ]);
    return (await getComputePayment(db, id))!;
  }
  // Observation can overlap another recovery's authorization. Re-read before
  // touching any old signing key so saved broadcastable bytes remain sufficient.
  const observedQuote = payment.quote_json,
    observedSignature = payment.buyer_signature,
    observedApproval = payment.buyer_transaction;
  stage('payment-read');
  payment = await getComputePayment(db, id);
  if (!payment) throw new ComputeMarketError(404, 'Checkout not found.');
  if (!['recorded', 'submitted'].includes(payment.status)) return payment;
  if (
    payment.quote_json !== observedQuote ||
    payment.buyer_signature !== observedSignature ||
    payment.buyer_transaction !== observedApproval
  )
    throw Error('Payment authorization changed.');
  if (!payment.authorized_transaction) {
    stage('authorization');
    const authorizationKeyPair =
      typeof authorization === 'function'
        ? await authorization()
        : authorization;
    if (!authorizationKeyPair) return payment; // Never replace an unavailable old key.
    const authorized = await coSignRecordedPayment(
      quote,
      {
        signature: observedSignature,
        transactionBase64: observedApproval,
      },
      authorizationKeyPair,
    );
    // Persist the complete immutable wire bytes BEFORE a network call. A crash
    // after this write is recovered by looking up/rebroadcasting the same txid.
    stage('authorization-persistence');
    await db
      .prepare(
        "UPDATE compute_payments SET authorized_transaction=?,status='submitted',updated_at=? WHERE id=? AND buyer_signature=? AND status='recorded' AND authorized_transaction IS NULL AND EXISTS(SELECT 1 FROM compute_listings WHERE quote_id=? AND status='reserved')",
      )
      .bind(authorized.transactionBase64, now, id, payment.buyer_signature, id)
      .run();
    payment = await getComputePayment(db, id);
    if (!payment) throw new ComputeMarketError(404, 'Checkout not found.');
    if (!['recorded', 'submitted'].includes(payment.status)) return payment;
    if (payment.authorized_transaction !== authorized.transactionBase64)
      throw Error('Payment authorization changed.');
  }
  if (!payment.authorized_transaction || !payment.buyer_signature)
    return payment;
  // Touch before broadcast so a failing RPC does not starve other checkouts.
  stage('broadcast-persistence');
  await db
    .prepare(
      "UPDATE compute_payments SET updated_at=? WHERE id=? AND status IN ('recorded','submitted')",
    )
    .bind(now, id)
    .run();
  stage('broadcast');
  await rpc.broadcast(
    payment.authorized_transaction,
    payment.buyer_signature,
    quote.contextSlot,
  );
  return payment;
}
export async function recoverComputePayments(
  db: D1Database,
  resolve: (quote: ComputePaymentQuote) => Promise<{
    rpc: ComputePaymentRpc;
    keyPair?: CryptoKeyPair;
    getAuthorizationKeyPair?: () => Promise<CryptoKeyPair | undefined>;
  }>,
  now = Date.now(),
  onError?: (diagnostic: PaymentRecoveryDiagnostic) => void,
) {
  const rows = await db
    .prepare(
      "SELECT id,quote_json FROM compute_payments WHERE (status='quoted' AND expires_at<=?) OR (status IN ('recorded','submitted') AND updated_at<=?) ORDER BY updated_at,id LIMIT 10",
    )
    .bind(now, now - 15000)
    .all<{ id: string; quote_json: string }>();
  const counts = {
    checked: 0,
    settled: 0,
    expired: 0,
    failed: 0,
    pending: 0,
    errors: 0,
  };
  for (const row of rows.results) {
    counts.checked++;
    let stage: PaymentRecoveryStage = 'quote-validation';
    try {
      const quote = JSON.parse(row.quote_json) as ComputePaymentQuote;
      // Expiration of unsigned quotes does not depend on network availability.
      stage = 'quote-expiry';
      if (await expireUnsignedComputeQuote(db, row.id, now)) {
        counts.expired++;
        continue;
      }
      stage = 'configuration';
      const config = await resolve(quote);
      const payment = await reconcileComputePayment(
        db,
        row.id,
        config.rpc,
        config.getAuthorizationKeyPair ?? config.keyPair,
        now,
        (value) => {
          stage = value;
        },
      );
      if (
        payment &&
        (payment.status === 'settled' ||
          payment.status === 'expired' ||
          payment.status === 'failed')
      )
        counts[payment.status]++;
      else counts.pending++;
    } catch (error) {
      counts.errors++;
      try {
        onError?.({ stage, category: paymentRecoveryErrorCategory(error) });
      } catch {
        /* diagnostics cannot erase or alter a recorded approval */
      }
      await db
        .prepare(
          "UPDATE compute_payments SET updated_at=? WHERE id=? AND status IN ('recorded','submitted')",
        )
        .bind(now, row.id)
        .run();
    }
  }
  return counts;
}
