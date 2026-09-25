import type { ComputePaymentQuote } from './solana-payment.ts';
export type ComputeReceipt = {
  id: string;
  listingId: string;
  status:
    | 'quoted'
    | 'recorded'
    | 'submitted'
    | 'settled'
    | 'failed'
    | 'expired';
  signature: string | null;
  network: 'devnet' | 'mainnet-beta';
  amount: string;
  mint: string;
  decimals: number;
  compute: number;
  seller: string;
  expiresAt: number;
};
export type ComputeOffer = {
  id: string;
  compute: number;
  tokenAmount: string;
  status: string;
  name: string;
  mine: boolean | number;
  currentToken?: boolean | number;
};
export type ComputeMarketSnapshot = {
  available: boolean;
  network: 'devnet' | 'mainnet-beta' | null;
  mint: string | null;
  decimals: number | null;
  listings: ComputeOffer[];
  pending: ComputeReceipt[];
  recent: ComputeReceipt[];
  sales: (ComputeReceipt & { settledAt: number })[];
  message: string;
};
export type ComputeCheckout = {
  payment: ComputeReceipt;
  quote?: ComputePaymentQuote | null;
};
export function tokenUnits(text: string, decimals: number) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(text)
  )
    throw Error('Enter a token price using numbers and a decimal point.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals)
    throw Error('This token supports at most ' + decimals + ' decimal places.');
  const raw = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (raw < BigInt(1) || raw > BigInt('18446744073709551615'))
    throw Error('Choose a positive token price within the supported range.');
  return raw.toString();
}
export function formatTokenUnits(raw: string, decimals: number) {
  if (
    !/^\d+$/.test(raw) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18
  )
    return '—';
  const s = raw.padStart(decimals + 1, '0'),
    whole = decimals ? s.slice(0, -decimals) : s,
    fraction = decimals ? s.slice(-decimals).replace(/0+$/, '') : '';
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fraction ? '.' + fraction : '')
  );
}
export const paymentIsPending = (status: ComputeReceipt['status']) =>
  status === 'recorded' || status === 'submitted';
export function paymentCopy(status: ComputeReceipt['status']) {
  switch (status) {
    case 'quoted':
      return {
        title: 'Review your purchase',
        body: 'Check the amount and price, then approve this purchase in your wallet.',
      };
    case 'recorded':
    case 'submitted':
      return {
        title: 'Payment is processing',
        body: 'Your approval is saved. You can close this screen. We’ll check the payment and deliver your Compute automatically. Don’t send a second payment.',
      };
    case 'settled':
      return {
        title: 'Compute delivered',
        body: 'Your payment is confirmed and the Compute is in your game balance.',
      };
    case 'expired':
      return {
        title: 'Checkout closed',
        body: 'This checkout can no longer take payment. Your token purchase did not complete. The offer can be reserved again if it is still available.',
      };
    case 'failed':
      return {
        title: 'Payment did not complete',
        body: 'The token transfer failed, so no Compute was delivered. A Solana network fee may still apply. You can choose another offer.',
      };
  }
}
export const transactionLink = (receipt: ComputeReceipt) =>
  receipt.signature
    ? 'https://explorer.solana.com/tx/' +
      encodeURIComponent(receipt.signature) +
      (receipt.network === 'devnet' ? '?cluster=devnet' : '')
    : null;
// Retain the exact signed approval across uncertain sends. This object never
// signs automatically and never creates a replacement quote while one is pending.
export class ComputeCheckoutSession {
  readonly wallet: string;
  checkout: ComputeCheckout | null = null;
  private approved: string | null = null;
  private inFlight = false;
  private request: (
    action: string,
    body: Record<string, unknown>,
  ) => Promise<ComputeCheckout>;
  private sign: (quote: ComputePaymentQuote) => Promise<string>;
  constructor(
    wallet: string,
    request: (
      action: string,
      body: Record<string, unknown>,
    ) => Promise<ComputeCheckout>,
    sign: (quote: ComputePaymentQuote) => Promise<string>,
  ) {
    this.wallet = wallet;
    this.request = request;
    this.sign = sign;
  }
  async resume(id: string) {
    if (this.inFlight)
      throw Error('A checkout request is already in progress.');
    this.inFlight = true;
    try {
      this.setCheckout(await this.request('compute-payment-status', { id }));
      return this.checkout!;
    } finally {
      this.inFlight = false;
    }
  }
  setCheckout(value: ComputeCheckout) {
    const q = value.quote,
      p = value.payment;
    if (
      q &&
      (q.quoteId !== p.id ||
        q.buyer !== this.wallet.slice(7) ||
        q.amount !== p.amount ||
        q.network !== p.network ||
        q.mint !== p.mint ||
        q.decimals !== p.decimals ||
        q.seller !== p.seller)
    )
      throw Error(
        'Checkout details do not match the payment approval. Refresh the trade.',
      );
    if (this.checkout?.payment.id !== value.payment.id) this.approved = null;
    this.checkout = value;
  }
  async approve() {
    if (this.inFlight)
      throw Error('A checkout request is already in progress.');
    const checkout = this.checkout;
    if (!checkout) throw Error('Choose an offer first.');
    this.inFlight = true;
    try {
      // Once an approval exists, retry only those bytes, even if the quote appears
      // expired locally. The server decides whether it was already recorded.
      if (!this.approved) {
        if (checkout.payment.status !== 'quoted' || !checkout.quote)
          throw Error('This checkout is already processing or closed.');
        if (checkout.payment.expiresAt <= Date.now())
          throw Error(
            'The offer reservation expired. Check its status before trying again.',
          );
        this.approved = await this.sign(checkout.quote);
      }
      const result = await this.request('compute-payment-submit', {
        id: checkout.payment.id,
        transaction: this.approved,
      });
      this.checkout = result;
      return result;
    } finally {
      this.inFlight = false;
    }
  }
  async check() {
    if (!this.checkout) throw Error('No checkout is selected.');
    if (this.inFlight) return this.checkout;
    this.inFlight = true;
    try {
      this.checkout = await this.request('compute-payment-status', {
        id: this.checkout.payment.id,
      });
      return this.checkout;
    } finally {
      this.inFlight = false;
    }
  }
  async cancel() {
    if (!this.checkout || this.inFlight)
      throw Error('Wait for the current checkout request.');
    this.inFlight = true;
    try {
      this.checkout = await this.request('compute-payment-cancel', {
        id: this.checkout.payment.id,
      });
      return this.checkout;
    } finally {
      this.inFlight = false;
    }
  }
  get hasApproval() {
    return this.approved !== null;
  }
}
