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
// Call only with trusted configured RPC clients. A buyer's claimed receipt or
// timeout is never evidence for delivery or releasing the seller's reservation.
export async function reconcileComputePayment(
  db: D1Database,
  id: string,
  rpc: ComputePaymentRpc,
  authorizationKeyPair?: CryptoKeyPair,
  now = Date.now(),
) {
  let payment = await getComputePayment(db, id);
  if (!payment) throw new ComputeMarketError(404, 'Checkout not found.');
  if (payment.status === 'quoted') {
    await expireUnsignedComputeQuote(db, id, now);
    return (await getComputePayment(db, id))!;
  }
  if (!['recorded', 'submitted'].includes(payment.status)) return payment;
  if (!payment.buyer_signature || !payment.buyer_transaction)
    throw Error('Recorded payment is incomplete.');
  const quote = JSON.parse(payment.quote_json) as ComputePaymentQuote;
  const observed = await rpc.observe(quote, payment.buyer_signature);
  if (observed.status === 'settled')
    return (
      await settleFinalizedComputePayment(db, id, observed.transaction, now)
    ).payment;
  if (observed.status === 'failed' || observed.status === 'expired') {
    if (observed.signature !== payment.buyer_signature)
      throw Error('Recovery signature mismatch.');
    await db.batch([
      db
        .prepare(
          "UPDATE compute_payments SET status=?,finalized_slot=?,updated_at=? WHERE id=? AND buyer_signature=? AND status IN ('recorded','submitted') AND EXISTS(SELECT 1 FROM compute_listings WHERE quote_id=? AND status='reserved')",
        )
        .bind(observed.status, observed.slot, now, id, observed.signature, id),
      db
        .prepare(
          "UPDATE compute_listings SET status='open',quote_id=NULL WHERE quote_id=? AND status='reserved' AND changes()=1",
        )
        .bind(id),
    ]);
    return (await getComputePayment(db, id))!;
  }
  if (!payment.authorized_transaction) {
    if (!authorizationKeyPair) return payment; // Keep old key configurations for recovery.
    const authorized = await coSignRecordedPayment(
      quote,
      {
        signature: payment.buyer_signature,
        transactionBase64: payment.buyer_transaction,
      },
      authorizationKeyPair,
    );
    // Persist the complete immutable wire bytes BEFORE a network call. A crash
    // after this write is recovered by looking up/rebroadcasting the same txid.
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
  await db
    .prepare(
      "UPDATE compute_payments SET updated_at=? WHERE id=? AND status IN ('recorded','submitted')",
    )
    .bind(now, id)
    .run();
  await rpc.broadcast(
    payment.authorized_transaction,
    payment.buyer_signature,
    quote.contextSlot,
  );
  return payment;
}
export async function recoverComputePayments(
  db: D1Database,
  resolve: (
    quote: ComputePaymentQuote,
  ) => Promise<{ rpc: ComputePaymentRpc; keyPair?: CryptoKeyPair }>,
  now = Date.now(),
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
    try {
      const quote = JSON.parse(row.quote_json) as ComputePaymentQuote;
      // Expiration of unsigned quotes does not depend on network availability.
      if (await expireUnsignedComputeQuote(db, row.id, now)) {
        counts.expired++;
        continue;
      }
      const config = await resolve(quote);
      const payment = await reconcileComputePayment(
        db,
        row.id,
        config.rpc,
        config.keyPair,
        now,
      );
      if (
        payment &&
        (payment.status === 'settled' ||
          payment.status === 'expired' ||
          payment.status === 'failed')
      )
        counts[payment.status]++;
      else counts.pending++;
    } catch {
      counts.errors++;
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
