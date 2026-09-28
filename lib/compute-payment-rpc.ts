// Server-only RPC boundary. Never accept an RPC URL or chain-result object from
// the buyer. Credentials in the configured URL must not appear in error text.
import { base58 } from '@scure/base';
import {
  SOLANA_GENESIS,
  SPL_TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  validSolanaAddress,
  type SolanaHoldingPolicy,
} from './solana-holdings.ts';
import {
  verifyPaymentIdentity,
  type ComputePaymentQuote,
} from './solana-payment.ts';
const safeInteger = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const inertMintExtensions = new Set(['metadataPointer', 'tokenMetadata']);
// A negative receipt requires the entire finalized block chain for this quote's
// lifetime. Keep this exceptional history lookup bounded; providers without
// complete/batch history leave the reservation pending for support review.
const HISTORY_BLOCK_LIMIT = 192;
const HISTORY_BATCH_SIZE = 16;
const HISTORY_PROOF_MS = 8000;
const HISTORY_RETRY_MS = 60000;
// Opportunistic backoff across RPC instances in this Worker isolate. Restart or
// eviction only causes another bounded proof attempt, never a weaker proof.
const historyRetryAfter = new Map<string, number>();
function validTransactionSignature(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value))
    return false;
  try {
    return base58.decode(value).length === 64;
  } catch {
    return false;
  }
}
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
  private readonly fallbackUrl?: string;
  constructor(
    policy: SolanaHoldingPolicy,
    fetcher: typeof fetch = fetch,
    fallbackUrl?: string,
  ) {
    let url: URL;
    try {
      url = new URL(policy.rpcUrl);
    } catch {
      throw Error('Payment RPC must use HTTPS.');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw Error('Payment RPC must use HTTPS.');
    if (fallbackUrl) {
      let fallback: URL;
      try {
        fallback = new URL(fallbackUrl);
      } catch {
        throw Error('Fallback payment RPC must be a separate HTTPS endpoint.');
      }
      if (
        fallback.protocol !== 'https:' ||
        fallback.username ||
        fallback.password ||
        fallback.href === url.href
      )
        throw Error('Fallback payment RPC must be a separate HTTPS endpoint.');
      this.fallbackUrl = fallback.href;
    }
    this.policy = policy;
    this.fetcher = fetcher;
  }
  private async call(
    method: string,
    params: unknown[] = [],
    deadline = Infinity,
  ): Promise<unknown> {
    try {
      return await this.request(this.policy.rpcUrl, method, params, deadline);
    } catch {
      if (!this.fallbackUrl)
        throw Error('Payment network is temporarily unavailable.');
      return this.fallbackCall(method, params, deadline);
    }
  }
  private async fallbackCall(
    method: string,
    params: unknown[],
    deadline = Infinity,
  ): Promise<unknown> {
    try {
      // A second URL is not evidence that it points to the same chain. Check
      // its genesis before trusting it for a quote, broadcast or recovery.
      if (
        method !== 'getGenesisHash' &&
        (await this.request(
          this.fallbackUrl!,
          'getGenesisHash',
          [],
          deadline,
        )) !== SOLANA_GENESIS[this.policy.network]
      )
        throw Error('Fallback payment RPC network mismatch.');
      return await this.request(this.fallbackUrl!, method, params, deadline);
    } catch {
      throw Error('Payment network is temporarily unavailable.');
    }
  }
  private async request(
    endpoint: string,
    method: string,
    params: unknown[],
    deadline = Infinity,
  ): Promise<unknown> {
    const remaining = Math.min(10000, deadline - Date.now());
    if (remaining <= 0)
      throw Error('Payment network is temporarily unavailable.');
    const id = crypto.randomUUID();
    const response = await this.fetcher(endpoint, {
      method: 'POST',
      // Workers does not support redirect: 'error'; manual preserves fail-closed behavior.
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(remaining),
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
  private async requestBlockSignatures(
    endpoint: string,
    slots: number[],
    deadline: number,
  ): Promise<unknown[]> {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || !slots.length || slots.length > HISTORY_BATCH_SIZE)
      throw Error('Payment history proof is incomplete.');
    const requests = slots.map((slot) => ({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'getBlock',
      params: [
        slot,
        {
          commitment: 'finalized',
          transactionDetails: 'signatures',
          rewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }));
    const response = await this.fetcher(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(remaining),
    });
    if (!response.ok) throw Error('Payment history proof is incomplete.');
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length !== requests.length)
      throw Error('Payment history proof is incomplete.');
    const byId = new Map<string, unknown>();
    for (const raw of data) {
      const value = object(raw);
      if (
        typeof value.id !== 'string' ||
        !requests.some((request) => request.id === value.id) ||
        byId.has(value.id) ||
        value.jsonrpc !== '2.0' ||
        value.error ||
        !Object.hasOwn(value, 'result')
      )
        throw Error('Payment history proof is incomplete.');
      byId.set(value.id, value.result);
    }
    return requests.map((request) => byId.get(request.id));
  }
  private async finalizedNonexecution(
    quote: ComputePaymentQuote,
    signature: string,
    finalizedSlot: number,
  ) {
    const started = Date.now();
    if ((historyRetryAfter.get(signature) ?? 0) > started) return false;
    historyRetryAfter.delete(signature);
    historyRetryAfter.set(signature, started + HISTORY_RETRY_MS);
    if (historyRetryAfter.size > 128)
      historyRetryAfter.delete(historyRetryAfter.keys().next().value!);
    const deadline = started + HISTORY_PROOF_MS;
    try {
      // Start at the historical quote rather than today's root, so an outage
      // lasting days does not turn recovery into an unbounded ledger scan.
      const candidates = await this.call(
        'getBlocksWithLimit',
        [quote.contextSlot, HISTORY_BLOCK_LIMIT, { commitment: 'finalized' }],
        deadline,
      );
      if (
        !Array.isArray(candidates) ||
        !candidates.length ||
        candidates.length > HISTORY_BLOCK_LIMIT ||
        !candidates.every(
          (slot, index) =>
            safeInteger(slot) &&
            slot >= quote.contextSlot &&
            (index === 0 || slot > candidates[index - 1]),
        )
      )
        return false;
      const slots = candidates
        .filter((slot) => slot <= finalizedSlot)
        .reverse();
      let child:
        | { parentSlot: number; previousBlockhash: string; height: number }
        | undefined;
      for (
        let offset = 0;
        offset < slots.length;
        offset += HISTORY_BATCH_SIZE
      ) {
        const batch = slots.slice(offset, offset + HISTORY_BATCH_SIZE);
        let results: unknown[];
        try {
          results = await this.requestBlockSignatures(
            this.policy.rpcUrl,
            batch,
            deadline,
          );
          if (results.some((result) => result === null))
            throw Error('Missing history');
        } catch {
          if (!this.fallbackUrl || Date.now() >= deadline) return false;
          if (
            (await this.request(
              this.fallbackUrl,
              'getGenesisHash',
              [],
              deadline,
            )) !== SOLANA_GENESIS[this.policy.network]
          )
            return false;
          results = await this.requestBlockSignatures(
            this.fallbackUrl,
            batch,
            deadline,
          );
        }
        for (let index = 0; index < batch.length; index++) {
          if (Date.now() >= deadline) return false;
          const slot = batch[index],
            block = object(results[index]);
          if (
            !safeInteger(block.parentSlot) ||
            block.parentSlot >= slot ||
            !safeInteger(block.blockHeight) ||
            typeof block.blockhash !== 'string' ||
            !validSolanaAddress(block.blockhash) ||
            typeof block.previousBlockhash !== 'string' ||
            !validSolanaAddress(block.previousBlockhash) ||
            !Array.isArray(block.signatures) ||
            !block.signatures.every(validTransactionSignature) ||
            block.signatures.includes(signature)
          )
            return false;
          if (child) {
            // Parent links prove that no intervening canonical block was
            // omitted by getBlocksWithLimit or a pruned history index.
            if (
              child.parentSlot !== slot ||
              child.previousBlockhash !== block.blockhash ||
              child.height !== block.blockHeight + 1
            )
              return false;
          } else if (block.blockHeight <= quote.lastValidBlockHeight)
            return false;
          if (block.blockhash === quote.recentBlockhash) {
            if (block.blockHeight > quote.lastValidBlockHeight) return false;
            historyRetryAfter.delete(signature);
            return true;
          }
          child = {
            parentSlot: block.parentSlot,
            previousBlockhash: block.previousBlockhash,
            height: block.blockHeight,
          };
        }
      }
    } catch {
      // Null history, a provider outage or an unsupported batch is never
      // evidence that a previously broadcastable transfer did not execute.
    }
    return false;
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
    let latest: ReturnType<typeof contextual> | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = contextual(
        await this.call('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      );
      if (candidate.slot >= mint.slot) {
        latest = candidate;
        break;
      }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!latest) throw Error('Stale payment RPC response.');
    const value = object(latest.value);
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
        preflightCommitment: 'confirmed',
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
    const transactionParams = [
      signature,
      {
        encoding: 'base64',
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0,
      },
    ];
    let transaction: unknown;
    let primaryHistoryAvailable = true;
    try {
      transaction = await this.request(
        this.policy.rpcUrl,
        'getTransaction',
        transactionParams,
      );
    } catch {
      primaryHistoryAvailable = false;
      if (!this.fallbackUrl)
        throw Error('Payment network is temporarily unavailable.');
      transaction = await this.fallbackCall(
        'getTransaction',
        transactionParams,
      );
    }
    // A healthy primary may still have incomplete or pruned transaction
    // history. Ask the separate history provider before leaving a paid trade
    // reserved. A second null still cannot prove non-execution.
    if (primaryHistoryAvailable && transaction === null && this.fallbackUrl)
      transaction = await this.fallbackCall(
        'getTransaction',
        transactionParams,
      );
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
    // A null transaction is not proof of non-execution. Check expiry first;
    // a broadcastable transaction additionally needs complete finalized block
    // evidence, while an approval never co-signed cannot land by construction.
    const slot = await this.call('getSlot', [{ commitment: 'finalized' }]);
    // A provider pool can route consecutive requests to nodes a slot apart.
    // A lagging node cannot prove expiry; continue the immutable checkout.
    if (!safeInteger(slot)) throw Error('Invalid finalized payment slot.');
    if (slot < quote.contextSlot) return { status: 'pending' };
    const height = await this.call('getBlockHeight', [
      { commitment: 'finalized' },
    ]);
    if (!safeInteger(height)) throw Error('Invalid finalized payment height.');
    if (height <= quote.lastValidBlockHeight) return { status: 'pending' };
    const valid = contextual(
      await this.call('isBlockhashValid', [
        quote.recentBlockhash,
        { commitment: 'finalized' },
      ]),
      0,
    );
    if (valid.slot < slot || valid.value !== false)
      return { status: 'pending' };
    if (
      !neverAuthorized &&
      !(await this.finalizedNonexecution(quote, signature, valid.slot))
    )
      return { status: 'pending' };
    return { status: 'expired', signature, slot: valid.slot };
  }
}
