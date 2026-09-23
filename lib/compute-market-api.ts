import { Buffer } from 'node:buffer';
import { createKeyPairFromBytes, getAddressFromPublicKey } from '@solana/kit';
import {
  solanaHoldingPolicy,
  tokenSetting,
  SPL_TOKEN_PROGRAM,
} from './solana-holdings.ts';
import {
  createComputePaymentQuote,
  type ComputePaymentQuote,
} from './solana-payment.ts';
import { ComputePaymentRpc } from './compute-payment-rpc.ts';
import { reconcileComputePayment } from './compute-payment-recovery.ts';
import {
  ComputeMarketError,
  createComputeListing,
  cancelComputeListing,
  reserveComputePayment,
  getComputeListing,
  getComputePayment,
  recordBuyerComputePayment,
  expireUnsignedComputeQuote,
  type ComputePayment,
} from './compute-market.ts';
export async function paymentConfiguration(
  values: Record<string, unknown>,
  quote?: ComputePaymentQuote,
) {
  const policy = solanaHoldingPolicy(values);
  if (!policy || values.NOOBIUS_TOKEN_ECOSYSTEM !== 'solana')
    throw new ComputeMarketError(
      503,
      'Token trading is not available yet. Your earned Compute stays in the game.',
    );
  if (
    quote &&
    (quote.network !== policy.network ||
      quote.mint !== policy.contract ||
      quote.decimals !== policy.decimals ||
      (quote.tokenProgram ?? SPL_TOKEN_PROGRAM) !== policy.tokenProgram)
  )
    throw new ComputeMarketError(
      503,
      'This payment needs its original network configuration to finish. Your reservation is saved.',
    );
  let keyPair: CryptoKeyPair | undefined;
  const address = quote?.authorizationSigner ?? values.NOOBIUS_PAYMENT_SIGNER;
  try {
    const keys = JSON.parse(
      tokenSetting(values.NOOBIUS_PAYMENT_KEYS, '{}'),
    ) as Record<string, unknown>;
    const encoded = typeof address === 'string' ? keys[address] : undefined;
    if (typeof encoded === 'string') {
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length !== 64 || bytes.toString('base64') !== encoded)
        throw Error('Invalid key');
      keyPair = await createKeyPairFromBytes(bytes);
      if ((await getAddressFromPublicKey(keyPair.publicKey)) !== address)
        throw Error('Key mismatch');
    }
  } catch {
    throw new ComputeMarketError(
      503,
      'Payment authorization is unavailable. Your reservation is saved.',
    );
  }
  return {
    policy,
    rpc: new ComputePaymentRpc(
      policy,
      fetch,
      tokenSetting(values.NOOBIUS_TOKEN_RPC_FALLBACK_URL) || undefined,
    ),
    keyPair,
    address,
  };
}
async function receipt(db: D1Database, p: ComputePayment) {
  const listing = await getComputeListing(db, p.listing_id);
  if (!listing)
    throw new ComputeMarketError(
      409,
      'This payment needs support review. Its record is saved.',
    );
  const q = JSON.parse(p.quote_json) as ComputePaymentQuote;
  return {
    compute: listing.compute,
    seller: listing.seller.slice(7),
    id: p.id,
    listingId: p.listing_id,
    status: p.status,
    signature: p.buyer_signature,
    network: q.network,
    amount: q.amount,
    mint: q.mint,
    decimals: q.decimals,
    tokenProgram: q.tokenProgram ?? SPL_TOKEN_PROGRAM,
    expiresAt: p.expires_at,
  };
}
function stringField(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== 'string' || !value || value.length > 2000)
    throw new ComputeMarketError(400, 'Check your trade details.');
  return value;
}
function enabled(values: Record<string, unknown>) {
  if (
    values.NOOBIUS_PAYMENTS_ENABLED !== 'true' ||
    values.NOOBIUS_TRADE_PAUSED === 'true'
  )
    throw new ComputeMarketError(
      503,
      'Token trading is not available right now. Existing trades can still finish or be cancelled.',
    );
}
export async function computeMarketSnapshot(
  db: D1Database,
  wallet: string | null,
  values: Record<string, unknown>,
) {
  const policy = solanaHoldingPolicy(values),
    available =
      !!policy &&
      values.NOOBIUS_TOKEN_ECOSYSTEM === 'solana' &&
      values.NOOBIUS_PAYMENTS_ENABLED === 'true' &&
      values.NOOBIUS_TRADE_PAUSED !== 'true' &&
      typeof values.NOOBIUS_PAYMENT_SIGNER === 'string' &&
      !!values.NOOBIUS_PAYMENT_KEYS;
  const listings =
    policy || wallet
      ? await db
          .prepare(
            "SELECT l.id,l.compute,l.token_amount AS tokenAmount,l.status,p.name,(l.seller=?) AS mine,(l.policy=?) AS currentToken FROM compute_listings l JOIN players p ON p.wallet=l.seller WHERE (l.status='open' AND l.policy=?) OR (l.seller=? AND l.status IN ('open','reserved')) ORDER BY l.created_at DESC,l.id DESC LIMIT 50",
          )
          .bind(
            wallet ?? '',
            policy?.key ?? '',
            policy?.key ?? '',
            wallet ?? '',
          )
          .all()
      : { results: [] };
  const pending = wallet
    ? await db
        .prepare(
          "SELECT * FROM compute_payments WHERE buyer=? AND status IN ('quoted','recorded','submitted') ORDER BY created_at DESC LIMIT 10",
        )
        .bind(wallet)
        .all<ComputePayment>()
    : { results: [] };
  return {
    available,
    viewer: wallet,
    network: policy?.network ?? null,
    mint: policy?.contract ?? null,
    decimals: policy?.decimals ?? null,
    listings: listings.results,
    pending: await Promise.all(pending.results.map((p) => receipt(db, p))),
    recent: wallet
      ? await Promise.all(
          (
            await db
              .prepare(
                "SELECT * FROM compute_payments WHERE buyer=? AND status IN ('settled','failed','expired') ORDER BY updated_at DESC LIMIT 5",
              )
              .bind(wallet)
              .all<ComputePayment>()
          ).results.map((p) => receipt(db, p)),
        )
      : [],
    message: available
      ? 'Buy Compute directly from other players.'
      : 'Token trading is not available yet. Keep building and earning Compute.',
  };
}
export async function handleComputeMarketAction(
  db: D1Database,
  wallet: string,
  action: string,
  body: Record<string, unknown>,
  values: Record<string, unknown>,
  qualified: boolean,
) {
  if (!wallet.startsWith('solana:'))
    throw new ComputeMarketError(
      400,
      'Connect a Solana wallet to trade Compute.',
    );
  if (action === 'compute-listing-cancel')
    return {
      listing: await cancelComputeListing(db, stringField(body, 'id'), wallet),
    };
  if (
    action === 'compute-payment-status' ||
    action === 'compute-payment-cancel' ||
    action === 'compute-payment-submit'
  ) {
    const id = stringField(body, 'id'),
      existing = await getComputePayment(db, id);
    if (!existing || existing.buyer !== wallet)
      throw new ComputeMarketError(404, 'Checkout not found.');
    if (action === 'compute-payment-cancel') {
      await expireUnsignedComputeQuote(db, id, Date.now(), true);
      const cancelled = (await getComputePayment(db, id))!;
      if (cancelled.status !== 'expired')
        throw new ComputeMarketError(
          409,
          'Payment is already processing. Check its status; do not pay again.',
        );
      return { payment: await receipt(db, cancelled) };
    }
    if (action === 'compute-payment-submit') {
      try {
        await recordBuyerComputePayment(
          db,
          id,
          wallet,
          stringField(body, 'transaction'),
        );
      } catch (e) {
        if (e instanceof ComputeMarketError) throw e;
        throw new ComputeMarketError(
          400,
          'The wallet approval does not match this checkout.',
        );
      }
    }
    let payment = (await getComputePayment(db, id))!;
    try {
      const config = await paymentConfiguration(
        values,
        JSON.parse(payment.quote_json),
      );
      payment = await reconcileComputePayment(
        db,
        id,
        config.rpc,
        config.keyPair,
      );
    } catch {
      // Never tell the player to pay again after an uncertain broadcast.
      // Recovery retries the recorded signature independently of the browser.
      payment = (await getComputePayment(db, id))!;
    }
    return {
      payment: await receipt(db, payment),
      quote:
        payment.status === 'quoted' ? JSON.parse(payment.quote_json) : null,
    };
  }
  enabled(values);
  if (!qualified)
    throw new ComputeMarketError(
      403,
      'Complete your first repair or client job before trading Compute.',
    );
  const config = await paymentConfiguration(values);
  if (!config.keyPair || typeof config.address !== 'string')
    throw new ComputeMarketError(503, 'Token checkout is not ready yet.');
  if (action === 'compute-listing-create') {
    if (typeof body.compute !== 'number')
      throw new ComputeMarketError(400, 'Choose a whole Compute amount.');
    // Do not reserve a seller's Compute against a mint that checkout will reject.
    await config.rpc.quoteLifetime();
    return {
      listing: await createComputeListing(
        db,
        {
          id: stringField(body, 'id'),
          seller: wallet,
          compute: body.compute,
          tokenAmount: stringField(body, 'tokenAmount'),
        },
        config.policy,
      ),
    };
  }
  if (action === 'compute-payment-quote') {
    const id = stringField(body, 'id'),
      listingId = stringField(body, 'listingId');
    const existing = await getComputePayment(db, id);
    if (existing) {
      if (existing.buyer !== wallet || existing.listing_id !== listingId)
        throw new ComputeMarketError(
          409,
          'Checkout identifier is already in use.',
        );
      return {
        payment: await receipt(db, existing),
        quote:
          existing.status === 'quoted' ? JSON.parse(existing.quote_json) : null,
      };
    }
    const listing = await getComputeListing(db, listingId);
    if (
      !listing ||
      listing.status !== 'open' ||
      listing.policy !== config.policy.key
    )
      throw new ComputeMarketError(409, 'This listing is no longer available.');
    const quote = await createComputePaymentQuote({
      quoteId: id,
      network: config.policy.network,
      buyer: wallet.slice(7),
      seller: listing.seller.slice(7),
      mint: config.policy.contract,
      tokenProgram: config.policy.tokenProgram,
      decimals: config.policy.decimals,
      amount: listing.token_amount,
      authorizationSigner: config.address,
      ...(await config.rpc.quoteLifetime()),
    });
    const payment = await reserveComputePayment(
      db,
      listingId,
      wallet,
      quote,
      config.policy,
    );
    return { payment: await receipt(db, payment), quote };
  }
  throw new ComputeMarketError(404, 'Unknown Compute trading action.');
}
