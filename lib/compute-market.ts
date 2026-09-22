import {
  validSolanaAddress,
  type SolanaHoldingPolicy,
} from './solana-holdings.ts';
import {
  createComputePaymentQuote,
  validateBuyerPayment,
  verifyFinalizedPayment,
  type ComputePaymentQuote,
} from './solana-payment.ts';
export class ComputeMarketError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type ComputeListing = {
  id: string;
  seller: string;
  compute: number;
  token_amount: string;
  policy: string;
  status: string;
  quote_id: string | null;
  created_at: number;
};
export type ComputePayment = {
  id: string;
  listing_id: string;
  buyer: string;
  quote_json: string;
  status: string;
  buyer_signature: string | null;
  buyer_transaction: string | null;
  authorized_transaction: string | null;
  expires_at: number;
  last_valid_block_height: number;
  finalized_slot: number | null;
};
const validId = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const isWallet = (wallet: string) =>
  wallet.startsWith('solana:') && validSolanaAddress(wallet.slice(7));
const conflict = (message: string): never => {
  throw new ComputeMarketError(409, message);
};
export const getComputeListing = (db: D1Database, id: string) =>
  db
    .prepare('SELECT * FROM compute_listings WHERE id=?')
    .bind(id)
    .first<ComputeListing>();
export const getComputePayment = (db: D1Database, id: string) =>
  db
    .prepare('SELECT * FROM compute_payments WHERE id=?')
    .bind(id)
    .first<ComputePayment>();
export async function createComputeListing(
  db: D1Database,
  input: { id: string; seller: string; compute: number; tokenAmount: string },
  policy: SolanaHoldingPolicy,
  now = Date.now(),
) {
  if (
    !validId(input.id) ||
    !isWallet(input.seller) ||
    !Number.isSafeInteger(input.compute) ||
    input.compute < 1 ||
    input.compute > 1_000_000_000 ||
    !/^[1-9]\d{0,19}$/.test(input.tokenAmount) ||
    BigInt(input.tokenAmount) > BigInt('18446744073709551615')
  )
    throw new ComputeMarketError(
      400,
      'Choose a valid Compute amount and token price.',
    );
  await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO compute_listings(id,seller,compute,token_amount,policy,status,created_at)
      SELECT ?,?,?,?,?,'open',? WHERE EXISTS(SELECT 1 FROM players WHERE wallet=? AND credits>=?)
      AND (SELECT COUNT(*) FROM compute_listings WHERE seller=? AND status IN ('open','reserved'))<10`)
      .bind(
        input.id,
        input.seller,
        input.compute,
        input.tokenAmount,
        policy.key,
        now,
        input.seller,
        input.compute,
        input.seller,
      ),
    db
      .prepare(
        'UPDATE players SET credits=credits-? WHERE wallet=? AND changes()=1',
      )
      .bind(input.compute, input.seller),
  ]);
  const listing = await getComputeListing(db, input.id);
  if (
    !listing ||
    listing.seller !== input.seller ||
    listing.compute !== input.compute ||
    listing.token_amount !== input.tokenAmount ||
    listing.policy !== policy.key
  )
    conflict(
      'Not enough Compute, too many listings, or a conflicting request.',
    );
  return listing!;
}
export async function cancelComputeListing(
  db: D1Database,
  id: string,
  seller: string,
) {
  const listing = await getComputeListing(db, id);
  if (!listing || listing.seller !== seller)
    throw new ComputeMarketError(404, 'Listing not found.');
  if (listing.status === 'cancelled') return listing;
  const result = await db.batch([
    db
      .prepare(
        "UPDATE compute_listings SET status='cancelled' WHERE id=? AND seller=? AND status='open' AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND credits<=9007199254740991-?)",
      )
      .bind(id, seller, seller, listing.compute),
    db
      .prepare(
        'UPDATE players SET credits=credits+? WHERE wallet=? AND changes()=1',
      )
      .bind(listing.compute, seller),
  ]);
  const latest = (await getComputeListing(db, id))!;
  if (result[0].meta.changes !== 1 && latest.status !== 'cancelled')
    conflict('This listing is being purchased or has already sold.');
  return latest;
}
export async function reserveComputePayment(
  db: D1Database,
  listingId: string,
  buyer: string,
  quote: ComputePaymentQuote,
  policy: SolanaHoldingPolicy,
  now = Date.now(),
) {
  const listing = await getComputeListing(db, listingId);
  if (!listing || listing.policy !== policy.key)
    throw new ComputeMarketError(404, 'Listing is unavailable for this token.');
  if (
    !isWallet(buyer) ||
    buyer === listing.seller ||
    quote.buyer !== buyer.slice(7) ||
    quote.seller !== listing.seller.slice(7) ||
    quote.amount !== listing.token_amount ||
    quote.mint !== policy.contract ||
    quote.decimals !== policy.decimals ||
    quote.network !== policy.network
  )
    throw new ComputeMarketError(
      400,
      'Payment quote does not match this listing.',
    );
  const rebuilt = await createComputePaymentQuote(quote);
  if (
    rebuilt.messageBase64 !== quote.messageBase64 ||
    rebuilt.unsignedTransactionBase64 !== quote.unsignedTransactionBase64
  )
    throw new ComputeMarketError(400, 'Invalid payment quote.');
  const existing = await getComputePayment(db, quote.quoteId);
  if (existing) {
    if (
      existing.listing_id !== listingId ||
      existing.buyer !== buyer ||
      JSON.stringify(JSON.parse(existing.quote_json)) !== JSON.stringify(quote)
    )
      conflict('Payment request changed.');
    return existing;
  }
  const result = await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO compute_payments(id,listing_id,buyer,quote_json,status,expires_at,last_valid_block_height,created_at,updated_at)
      SELECT ?,?,?,?,'quoted',?,?,?,? WHERE EXISTS(SELECT 1 FROM compute_listings WHERE id=? AND status='open')
      AND NOT EXISTS(SELECT 1 FROM compute_payments WHERE buyer=? AND status IN ('quoted','recorded','submitted'))`)
      .bind(
        quote.quoteId,
        listingId,
        buyer,
        JSON.stringify(quote),
        now + 90000,
        quote.lastValidBlockHeight,
        now,
        now,
        listingId,
        buyer,
      ),
    db
      .prepare(
        "UPDATE compute_listings SET status='reserved',quote_id=? WHERE id=? AND changes()=1",
      )
      .bind(quote.quoteId, listingId),
  ]);
  const latest = await getComputePayment(db, quote.quoteId);
  if (
    result[0].meta.changes !== 1 &&
    (!latest ||
      latest.listing_id !== listingId ||
      latest.buyer !== buyer ||
      latest.quote_json !== JSON.stringify(quote))
  )
    conflict(
      'Another buyer reserved this listing, or you already have a pending checkout.',
    );
  return latest!;
}
export async function expireUnsignedComputeQuote(
  db: D1Database,
  id: string,
  now = Date.now(),
) {
  const result = await db.batch([
    db
      .prepare(
        "UPDATE compute_payments SET status='expired',updated_at=? WHERE id=? AND status='quoted' AND expires_at<=?",
      )
      .bind(now, id, now),
    db
      .prepare(
        "UPDATE compute_listings SET status='open',quote_id=NULL WHERE quote_id=? AND status='reserved' AND changes()=1",
      )
      .bind(id),
  ]);
  return result[0].meta.changes === 1;
}
export async function recordBuyerComputePayment(
  db: D1Database,
  id: string,
  buyer: string,
  transactionBase64: string,
  now = Date.now(),
) {
  const payment = await getComputePayment(db, id);
  if (!payment || payment.buyer !== buyer)
    throw new ComputeMarketError(404, 'Checkout not found.');
  const signed = await validateBuyerPayment(
    JSON.parse(payment.quote_json) as ComputePaymentQuote,
    transactionBase64,
  );
  if (
    payment.status === 'recorded' ||
    payment.status === 'submitted' ||
    payment.status === 'settled'
  ) {
    if (
      payment.buyer_signature !== signed.signature ||
      payment.buyer_transaction !== signed.transactionBase64
    )
      conflict('A different payment is already recorded.');
    return payment;
  }
  const result = await db
    .prepare(`UPDATE compute_payments SET status='recorded',buyer_signature=?,buyer_transaction=?,updated_at=?
    WHERE id=? AND buyer=? AND status='quoted' AND expires_at>? AND EXISTS(SELECT 1 FROM compute_listings WHERE quote_id=? AND status='reserved')`)
    .bind(signed.signature, signed.transactionBase64, now, id, buyer, now, id)
    .run();
  if (result.meta.changes !== 1) {
    const latest = await getComputePayment(db, id);
    if (
      latest &&
      ['recorded', 'submitted', 'settled'].includes(latest.status) &&
      latest.buyer_signature === signed.signature &&
      latest.buyer_transaction === signed.transactionBase64
    )
      return latest;
    conflict('Checkout expired or changed. No payment was authorized.');
  }
  return (await getComputePayment(db, id))!;
}
export async function settleFinalizedComputePayment(
  db: D1Database,
  id: string,
  chainResult: unknown,
  now = Date.now(),
) {
  const payment = await getComputePayment(db, id);
  if (
    !payment ||
    !payment.buyer_signature ||
    !['recorded', 'submitted', 'settled'].includes(payment.status)
  )
    conflict('No recorded payment is available.');
  const verified = await verifyFinalizedPayment(
    JSON.parse(payment!.quote_json) as ComputePaymentQuote,
    payment!.buyer_signature!,
    chainResult,
  );
  const listing = await getComputeListing(db, payment!.listing_id);
  if (!listing) conflict('Payment listing is unavailable.');
  const result = await db.batch([
    db
      .prepare(`UPDATE compute_payments SET status='settled',finalized_slot=?,updated_at=? WHERE id=? AND status IN ('recorded','submitted')
      AND EXISTS(SELECT 1 FROM compute_listings WHERE id=? AND quote_id=? AND status='reserved')
      AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND credits<=9007199254740991-?)`)
      .bind(
        verified.slot,
        now,
        id,
        listing!.id,
        id,
        payment!.buyer,
        listing!.compute,
      ),
    db
      .prepare(
        'UPDATE players SET credits=credits+? WHERE wallet=? AND changes()=1',
      )
      .bind(listing!.compute, payment!.buyer),
    db
      .prepare(
        "UPDATE compute_listings SET status='sold' WHERE quote_id=? AND status='reserved' AND EXISTS(SELECT 1 FROM compute_payments WHERE id=? AND status='settled')",
      )
      .bind(id, id),
  ]);
  const latest = await getComputePayment(db, id);
  if (!latest || latest.status !== 'settled')
    throw new ComputeMarketError(
      409,
      'Delivery is pending. Your payment remains recorded.',
    );
  return { payment: latest, delivered: result[0].meta.changes === 1 };
}
