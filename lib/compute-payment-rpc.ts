// Server-only RPC boundary. Never accept an RPC URL or chain-result object from
// the buyer. Credentials in the configured URL must not appear in error text.
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  type SolanaHoldingPolicy,
} from './solana-holdings.ts';
import {
  verifyPaymentIdentity,
  type ComputePaymentQuote,
} from './solana-payment.ts';
const safeInteger = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const inertMintExtensions = new Set(['metadataPointer', 'tokenMetadata']);
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Malformed payment RPC response.');
  return v as Record<string, unknown>;
}
function contextual(v: unknown, minimum = 0) {
  const value = object(v),
    context = object(value.context);
  if (
    !safeInteger(context.slot) ||
    context.slot < minimum ||
    !Object.hasOwn(value, 'value')
  )
    throw Error('Stale payment RPC response.');
  return { slot: context.slot, value: value.value };
}
export type PaymentObservation =
  | { status: 'pending' }
  | { status: 'settled'; transaction: unknown }
  | { status: 'failed' | 'expired'; signature: string; slot: number };
export class ComputePaymentRpc {
  readonly policy: SolanaHoldingPolicy;
  private readonly fetcher: typeof fetch;
  constructor(policy: SolanaHoldingPolicy, fetcher: typeof fetch = fetch) {
    const url = new URL(policy.rpcUrl);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw Error('Payment RPC must use HTTPS.');
    this.policy = policy;
    this.fetcher = fetcher;
  }
  private async call(method: string, params: unknown[] = []): Promise<unknown> {
    try {
      return await this.request(method, params);
    } catch {
      throw Error('Payment network is temporarily unavailable.');
    }
  }
  private async request(method: string, params: unknown[]): Promise<unknown> {
    const id = crypto.randomUUID();
    const response = await this.fetcher(this.policy.rpcUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error('Payment network is temporarily unavailable.');
    const data = object(await response.json());
    if (
      data.id !== id ||
      data.jsonrpc !== '2.0' ||
      data.error ||
      !Object.hasOwn(data, 'result')
    )
      throw Error('Payment network could not complete the request.');
    return data.result;
  }
  async verifyNetwork() {
    if (
      (await this.call('getGenesisHash')) !==
      SOLANA_GENESIS[this.policy.network]
    )
      throw Error('Payment RPC network mismatch.');
  }
  async quoteLifetime() {
    await this.verifyNetwork();
    const mint = contextual(
      await this.call('getAccountInfo', [
        this.policy.contract,
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ]),
    );
    const account = object(mint.value),
      parsed = object(object(account.data).parsed),
      info = object(parsed.info);
    if (
      account.owner !== this.policy.tokenProgram ||
      account.executable !== false ||
      parsed.type !== 'mint' ||
      info.isInitialized !== true ||
      info.decimals !== this.policy.decimals
    )
      throw Error('Unsupported payment mint or token precision.');
    if (this.policy.tokenProgram === TOKEN_2022_PROGRAM) {
      // A transfer-fee mint credits the seller less than the quoted amount.
      // Other behavior-changing extensions need a separately reviewed checkout.
      if (
        (info.extensions !== undefined && !Array.isArray(info.extensions)) ||
        !(info.extensions ?? []).every((extension: unknown) => {
          if (!extension || typeof extension !== 'object') return false;
          const name = (extension as Record<string, unknown>).extension;
          return typeof name === 'string' && inertMintExtensions.has(name);
        })
      )
        throw Error('This token has unsupported payment extensions.');
    } else if (this.policy.tokenProgram !== SPL_TOKEN_PROGRAM) {
      throw Error('Unsupported payment token program.');
    }
    const latest = contextual(
        await this.call('getLatestBlockhash', [
          { commitment: 'finalized', minContextSlot: mint.slot },
        ]),
        mint.slot,
      ),
      value = object(latest.value);
    if (
      typeof value.blockhash !== 'string' ||
      !safeInteger(value.lastValidBlockHeight) ||
      value.lastValidBlockHeight < 1
    )
      throw Error('Invalid payment blockhash.');
    return {
      recentBlockhash: value.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight,
      contextSlot: latest.slot,
    };
  }
  async broadcast(
    transactionBase64: string,
    signature: string,
    contextSlot: number,
  ) {
    await this.verifyNetwork();
    const result = await this.call('sendTransaction', [
      transactionBase64,
      {
        encoding: 'base64',
        skipPreflight: false,
        preflightCommitment: 'finalized',
        maxRetries: 2,
        minContextSlot: contextSlot,
      },
    ]);
    if (result !== signature)
      throw Error('Payment submission result is uncertain.');
  }
  async observe(
    quote: ComputePaymentQuote,
    signature: string,
    neverAuthorized = false,
  ): Promise<PaymentObservation> {
    if (
      quote.network !== this.policy.network ||
      quote.mint !== this.policy.contract ||
      quote.decimals !== this.policy.decimals ||
      (quote.tokenProgram ?? SPL_TOKEN_PROGRAM) !== this.policy.tokenProgram
    )
      throw Error(
        'Payment configuration changed; retain the original network configuration for recovery.',
      );
    await this.verifyNetwork();
    const transaction = await this.call('getTransaction', [
      signature,
      {
        encoding: 'base64',
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (transaction !== null) {
      const verified = await verifyPaymentIdentity(
        quote,
        signature,
        transaction,
      );
      return verified.error === null
        ? { status: 'settled', transaction }
        : { status: 'failed', signature, slot: verified.slot };
    }
    // A null transaction is not proof of non-execution: the node may not have
    // transaction history even when its local ledger covers the quote slot.
    // A recorded buyer-only signature cannot land because the server Memo
    // signature has never been persisted or exposed. Only that state can be
    // released after the finalized blockhash lifetime has ended.
    if (!neverAuthorized) return { status: 'pending' };
    const slot = await this.call('getSlot', [
      { commitment: 'finalized', minContextSlot: quote.contextSlot },
    ]);
    if (!safeInteger(slot) || slot < quote.contextSlot)
      throw Error('Stale finalized payment slot.');
    const height = await this.call('getBlockHeight', [
      { commitment: 'finalized', minContextSlot: slot },
    ]);
    if (!safeInteger(height)) throw Error('Invalid finalized payment height.');
    if (height <= quote.lastValidBlockHeight) return { status: 'pending' };
    const valid = contextual(
      await this.call('isBlockhashValid', [
        quote.recentBlockhash,
        { commitment: 'finalized', minContextSlot: slot },
      ]),
      slot,
    );
    if (valid.value !== false) return { status: 'pending' };
    return { status: 'expired', signature, slot: valid.slot };
  }
}
