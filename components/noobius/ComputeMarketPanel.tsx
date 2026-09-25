'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  ExternalLink,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/lib/game';
import type { ComputePaymentQuote } from '@/lib/solana-payment';
import { canTrade } from '@/lib/market';
import {
  ComputeCheckoutSession,
  formatTokenUnits,
  tokenUnits,
  paymentCopy,
  paymentIsPending,
  transactionLink,
  type ComputeMarketSnapshot,
  type ComputeCheckout,
  type ComputeOffer,
} from '@/lib/compute-trading-client';
import { api } from './useNoobius';
const readComputeMarket = (wallet: string) =>
  api<ComputeMarketSnapshot & { viewer: string | null }>(
    'compute-market?wallet=' + encodeURIComponent(wallet),
  );
type Props = {
  readMarket?: typeof readComputeMarket;
  profile: Profile;
  request: <T>(action: string, body: Record<string, unknown>) => Promise<T>;
  sign: (quote: ComputePaymentQuote) => Promise<string>;
  onConnect?: () => void;
};
export default function ComputeMarketPanel({
  profile,
  request,
  sign,
  onConnect,
  readMarket = readComputeMarket,
}: Props) {
  const [session] = useState(
    () =>
      new ComputeCheckoutSession(
        profile.wallet,
        (a, b) => request<ComputeCheckout>(a, b),
        sign,
      ),
  );
  const [snapshot, setSnapshot] = useState<ComputeMarketSnapshot | null>(null),
    [checkout, setCheckout] = useState<ComputeCheckout | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [quantity, setQuantity] = useState('100'),
    [price, setPrice] = useState(''),
    [clock, setClock] = useState(Date.now),
    [copied, setCopied] = useState(false);
  const active = useRef(true),
    working = useRef(false),
    draft = useRef<{ key: string; id: string } | null>(null);
  const connected = profile.wallet.startsWith('solana:'),
    qualified = !!profile.facility && canTrade(profile.facility);
  const load = useCallback(async () => {
    if (!connected) return;
    const value = await readMarket(profile.wallet);
    if (value.viewer !== profile.wallet)
      throw Error(
        'Your wallet session changed. Reconnect to view your trades.',
      );
    if (active.current) setSnapshot(value);
  }, [connected, profile.wallet, readMarket]);
  useEffect(() => {
    active.current = true;
    void load().catch((e) => {
      if (active.current)
        setError(e instanceof Error ? e.message : 'Unable to load trading.');
    });
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [load]);
  const perform = useCallback(
    async (fn: () => Promise<void>) => {
      if (working.current) return;
      working.current = true;
      setBusy(true);
      setError('');
      try {
        await fn();
        if (active.current) await load();
      } catch (e) {
        if (active.current)
          setError(
            e instanceof Error
              ? e.message
              : 'The trade could not finish. Check its status before trying again.',
          );
      } finally {
        working.current = false;
        if (active.current) setBusy(false);
      }
    },
    [load],
  );
  const display = useCallback(
    (value: ComputeCheckout) => {
      session.setCheckout(value);
      if (active.current) setCheckout(value);
    },
    [session],
  );
  useEffect(() => {
    if (!checkout || !paymentIsPending(checkout.payment.status)) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !working.current)
        void perform(async () => display(await session.check()));
    }, 8000);
    return () => clearInterval(timer);
  }, [checkout, perform, session, display]);
  const buy = (offer: ComputeOffer) =>
    void perform(async () => {
      // Reusing this ID after a network timeout resolves the original reservation.
      const key = 'quote:' + offer.id;
      if (draft.current?.key !== key)
        draft.current = { key, id: crypto.randomUUID() };
      const value = await request<ComputeCheckout>('compute-payment-quote', {
        id: draft.current.id,
        listingId: offer.id,
      });
      display(value);
    });
  const resume = (id: string) =>
    void perform(async () => display(await session.resume(id)));
  const payment = checkout?.payment,
    copy = payment ? paymentCopy(payment.status) : null,
    link = payment ? transactionLink(payment) : null;
  const seconds = payment
    ? Math.min(90, Math.max(0, Math.ceil((payment.expiresAt - clock) / 1000)))
    : 0;
  const displayNetwork = payment?.network ?? snapshot?.network;
  const ticker = displayNetwork === 'devnet' ? 'test tokens' : '$NOOBIUS';
  if (!connected)
    return (
      <section className="compute-trading">
        <div className="compute-trade-intro">
          <Wallet size={30} />
          <h3>Trade your Compute</h3>
          <p>
            Earn Compute by running your data center. When token trading opens,
            you can offer it to other players for $NOOBIUS.
          </p>
          <p>
            Your guest balance stays in practice. Connect a Solana wallet to
            start a saved game.
          </p>
          <Button onClick={onConnect}>
            Connect a wallet <ArrowRight size={16} />
          </Button>
        </div>
      </section>
    );
  return (
    <section className="compute-trading" aria-label="Compute trading">
      <header className="compute-trade-heading">
        <div>
          <h3>Compute exchange</h3>
          <p>Buy from players. Set your own selling price.</p>
        </div>
        <button
          aria-label="Refresh Compute offers"
          disabled={busy}
          onClick={() => void perform(load)}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {displayNetwork === 'devnet' && (
        <p className="compute-test-banner">
          Solana devnet · Test tokens only. No real value.
        </p>
      )}
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
      {!snapshot && !error && <output>Loading offers…</output>}
      {payment && (
        <article
          className={
            'compute-checkout ' +
            (payment.status === 'settled' ? 'complete' : '')
          }
          aria-live="polite"
        >
          <div className="compute-checkout-title">
            {payment.status === 'settled' ? (
              <Check size={24} />
            ) : (
              <Clock size={24} />
            )}
            <h3>{copy!.title}</h3>
          </div>
          <div className="compute-trade-totals">
            <div>
              <span>You receive</span>
              <strong>{payment.compute.toLocaleString()} Compute</strong>
            </div>
            <div>
              <span>You pay</span>
              <strong>
                {formatTokenUnits(payment.amount, payment.decimals)} {ticker}
              </strong>
            </div>
          </div>
          <p>{copy!.body}</p>
          {payment.status === 'quoted' && (
            <>
              <p className="muted-small">
                {seconds > 0
                  ? `Reserved for ${seconds}s.`
                  : 'Reservation expired. Check status to release it.'}{' '}
                Network fees and any token-account setup are paid in SOL; review
                your wallet’s estimate.
              </p>
              <details>
                <summary>Payment details</summary>
                <dl>
                  <dt>Network</dt>
                  <dd>
                    {payment.network === 'devnet'
                      ? 'Solana devnet'
                      : 'Solana mainnet'}
                  </dd>
                  <dt>Token mint</dt>
                  <dd>{payment.mint}</dd>
                  <dt>Seller receives payment at</dt>
                  <dd>{payment.seller}</dd>
                </dl>
              </details>
              {session.hasApproval && (
                <output>
                  Your wallet approval is ready. Retry sending the same
                  approval.
                </output>
              )}
              <div className="compute-trade-actions">
                <Button
                  disabled={busy || (!seconds && !session.hasApproval)}
                  onClick={() =>
                    void perform(async () => display(await session.approve()))
                  }
                >
                  {busy
                    ? 'Waiting…'
                    : session.hasApproval
                      ? 'Retry submission'
                      : 'Approve & pay'}
                  <Wallet size={16} />
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => display(await session.cancel()))
                  }
                >
                  Cancel checkout
                </Button>
              </div>
            </>
          )}
          {(paymentIsPending(payment.status) ||
            (payment.status === 'quoted' && !seconds)) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => display(await session.check()))
              }
            >
              Check payment status <RefreshCw size={16} />
            </Button>
          )}
          {link && (
            <a
              className="compute-transaction-link"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Solana transaction <ExternalLink size={14} />
            </a>
          )}
          {['settled', 'failed', 'expired'].includes(payment.status) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setCheckout(null);
                draft.current = null;
              }}
            >
              Back to offers <ArrowRight size={16} />
            </Button>
          )}
        </article>
      )}
      {!payment &&
        snapshot?.pending.map((p) => (
          <button
            key={p.id}
            className="compute-pending-row"
            disabled={busy}
            onClick={() => resume(p.id)}
          >
            <Clock size={18} />
            <span>
              {p.compute.toLocaleString()} Compute ·{' '}
              {p.status === 'quoted' ? 'Finish checkout' : 'Payment processing'}
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
      {!snapshot?.available && snapshot && (
        <div className="compute-market-empty">
          <h4>Token trading is coming soon</h4>
          <p>{snapshot.message}</p>
          <p>You can still use Compute to build, upgrade and trade parts.</p>
        </div>
      )}
      {snapshot &&
        (snapshot.available || snapshot.listings.some((offer) => offer.mine)) &&
        !payment && (
          <>
            {!qualified && (
              <p className="compute-test-banner">
                Complete your first repair or client job to unlock player
                trading.
              </p>
            )}
            <div className="compute-offers">
              <h4>Player offers</h4>
              {!snapshot.listings.length && (
                <p className="muted-small">
                  No offers yet. Set the first price.
                </p>
              )}
              {snapshot.listings
                .filter((offer) => snapshot.available || offer.mine)
                .map((offer) => (
                  <article key={offer.id} className="compute-offer">
                    <div>
                      <strong>{offer.compute.toLocaleString()} Compute</strong>
                      <span>
                        {offer.mine ? 'Your offer' : offer.name}
                        {offer.status === 'reserved'
                          ? ' · Buyer checking out'
                          : ''}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {offer.currentToken === 0 ||
                        offer.currentToken === false
                          ? 'Previous token setup'
                          : formatTokenUnits(
                              offer.tokenAmount,
                              snapshot.decimals!,
                            ) +
                            ' ' +
                            ticker}
                      </strong>
                      {offer.mine ? (
                        <Button
                          variant="outline"
                          disabled={busy || offer.status !== 'open'}
                          onClick={() =>
                            void perform(async () => {
                              await request('compute-listing-cancel', {
                                id: offer.id,
                              });
                            })
                          }
                        >
                          Cancel offer
                        </Button>
                      ) : (
                        <Button
                          disabled={
                            busy || !qualified || snapshot.pending.length > 0
                          }
                          onClick={() => buy(offer)}
                        >
                          Review <ArrowRight size={14} />
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
            {snapshot.available && (
              <form
                className="compute-sell"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () => {
                    const compute = Number(quantity);
                    if (
                      !/^[1-9]\d*$/.test(quantity) ||
                      !Number.isSafeInteger(compute) ||
                      compute > profile.credits
                    )
                      throw Error(
                        'Choose a whole Compute amount within your available balance.',
                      );
                    const tokenAmount = tokenUnits(price, snapshot.decimals!);
                    const key = JSON.stringify(['sell', compute, tokenAmount]);
                    if (draft.current?.key !== key)
                      draft.current = { key, id: crypto.randomUUID() };
                    await request('compute-listing-create', {
                      id: draft.current.id,
                      compute,
                      tokenAmount,
                    });
                    draft.current = null;
                    setPrice('');
                  });
                }}
              >
                <h4>Sell your Compute</h4>
                <p className="muted-small">
                  {profile.credits.toLocaleString()} available. Listed Compute
                  is held until sold or cancelled. A buyer pays your wallet
                  directly.
                </p>
                <div className="compute-sell-fields">
                  <label>
                    Compute to sell
                    <input
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      maxLength={10}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Total price in {ticker}
                    <input
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Your price"
                      maxLength={40}
                      disabled={busy}
                    />
                  </label>
                </div>
                <Button type="submit" disabled={busy || !qualified || !price}>
                  Create offer <ArrowRight size={16} />
                </Button>
                <p className="muted-small">
                  No guaranteed buyer or fixed exchange rate. Up to 10 open
                  offers.
                </p>
              </form>
            )}
          </>
        )}
      {!payment && !!snapshot?.recent.length && (
        <details className="compute-trade-history">
          <summary>Recent purchases</summary>
          {snapshot.recent.map((p) => (
            <button
              className="compute-pending-row"
              key={p.id}
              onClick={() => resume(p.id)}
              disabled={busy}
            >
              <span>
                {p.compute.toLocaleString()} Compute ·{' '}
                {paymentCopy(p.status).title}
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </details>
      )}
      {!payment && !!snapshot?.sales?.length && (
        <details className="compute-trade-history">
          <summary>Your completed sales</summary>
          {snapshot.sales.map((sale) => {
            const explorer = transactionLink(sale);
            return (
              <div className="compute-pending-row" key={sale.id}>
                <span>
                  <strong>{sale.compute.toLocaleString()} Compute sold</strong>
                  <small> · {formatTokenUnits(sale.amount, sale.decimals)} {sale.network === 'devnet' ? 'devnet test tokens' : ticker} · {new Date(sale.settledAt).toLocaleDateString()}</small>
                </span>
                {explorer && <a href={explorer} target="_blank" rel="noopener noreferrer" aria-label="View completed sale on Solana Explorer"><ExternalLink size={16} /></a>}
              </div>
            );
          })}
        </details>
      )}
      {snapshot?.mint && (
        <button
          className="compute-mint-copy"
          onClick={() => {
            void navigator.clipboard
              .writeText(snapshot.mint!)
              .then(() => setCopied(true))
              .catch(() =>
                setError(
                  'Clipboard unavailable. Copy the mint from payment details.',
                ),
              );
          }}
        >
          <Copy size={13} />
          {copied ? 'Mint copied' : 'Copy token mint'}
        </button>
      )}
    </section>
  );
}
