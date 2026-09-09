import {
  emitOperationalEvent,
  type OperationalEvent,
} from './operational-events.ts';
class VerificationFailure extends Error {
  readonly reason: OperationalEvent['reason'];
  readonly status?: number;
  constructor(
    message: string,
    reason: OperationalEvent['reason'],
    status?: number,
  ) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}
export type TokenPolicy = {
  chainId: number;
  contract: string;
  decimals: number;
  threshold: string;
  confirmations: number;
  rpcUrl: string;
  key: string;
};
export type RealmAccess = {
  status:
    | 'eligible'
    | 'ineligible'
    | 'unavailable'
    | 'unconfigured'
    | 'unsupported'
    | 'test';
  allowed: boolean;
  threshold: string;
  checkedAt?: number;
  graceUntil?: number;
  message: string;
};
const supportsHoldingAccount = (wallet: string) =>
  /^0x[a-f0-9]{40}$/i.test(wallet);
export function tokenPolicy(
  values: Record<string, unknown>,
): TokenPolicy | null {
  const chainId = Number(values.NOOBIUS_TOKEN_CHAIN_ID),
    contract = String(values.NOOBIUS_TOKEN_CONTRACT ?? '').toLowerCase(),
    decimals = Number(values.NOOBIUS_TOKEN_DECIMALS),
    threshold = String(values.NOOBIUS_TOKEN_THRESHOLD ?? '888'),
    confirmations = Number(values.NOOBIUS_TOKEN_CONFIRMATIONS ?? 12),
    rpcUrl = String(values.NOOBIUS_TOKEN_RPC_URL ?? '');
  if (
    !Number.isSafeInteger(chainId) ||
    chainId < 1 ||
    !/^0x[a-f0-9]{40}$/.test(contract) ||
    !/^(0|[1-9]\d*)$/.test(String(values.NOOBIUS_TOKEN_DECIMALS ?? '')) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^[1-9]\d{0,17}$/.test(threshold) ||
    !Number.isInteger(confirmations) ||
    confirmations < 1 ||
    confirmations > 10000
  )
    return null;
  try {
    if (new URL(rpcUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return {
    chainId,
    contract,
    decimals,
    threshold,
    confirmations,
    rpcUrl,
    key: [chainId, contract, decimals, threshold, confirmations].join(':'),
  };
}
export async function readTokenHolding(
  policy: TokenPolicy,
  wallet: string,
  transport: typeof fetch = fetch,
) {
  if (!supportsHoldingAccount(wallet))
    throw new Error(
      'GPU holder verification currently supports Ethereum/EVM accounts only.',
    );
  let sequence = 0;
  const rpc = async (method: string, params: unknown[]) => {
    let response: Response;
    try {
      response = await transport(policy.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++sequence,
          method,
          params,
        }),
        signal: AbortSignal.timeout(7000),
      });
    } catch (error) {
      throw new VerificationFailure(
        'Verification service unavailable.',
        error instanceof Error &&
          ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'timeout'
          : 'network',
      );
    }
    if (!response.ok)
      throw new VerificationFailure(
        'Verification service unavailable.',
        'http',
        response.status,
      );
    let data: {
      result?: unknown;
      error?: unknown;
    };
    try {
      data = await response.json();
    } catch (error) {
      throw new VerificationFailure(
        'Invalid verification response.',
        error instanceof Error &&
          ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'timeout'
          : 'json',
      );
    }
    if (!data || typeof data !== 'object')
      throw new VerificationFailure(
        'Invalid verification response.',
        'invalid-result',
      );
    if (
      data.error ||
      typeof data.result !== 'string' ||
      !/^0x[0-9a-f]*$/i.test(data.result)
    )
      throw new VerificationFailure(
        'Invalid verification response.',
        data.error ? 'rpc' : 'invalid-result',
      );
    if (data.result === '0x' && method !== 'eth_getCode')
      throw new VerificationFailure(
        'Invalid verification response.',
        'invalid-result',
      );
    return data.result;
  };
  const [chain, head] = await Promise.all([
    rpc('eth_chainId', []),
    rpc('eth_blockNumber', []),
  ]);
  if (BigInt(chain) !== BigInt(policy.chainId))
    throw new VerificationFailure(
      'Verification network mismatch.',
      'network-mismatch',
    );
  const number = BigInt(head) - BigInt(policy.confirmations);
  if (number < BigInt(0))
    throw new VerificationFailure(
      'Verification block unavailable.',
      'block-unavailable',
    );
  const block = '0x' + number.toString(16);
  const [code, decimals, amount] = await Promise.all([
    rpc('eth_getCode', [policy.contract, block]),
    rpc('eth_call', [{ to: policy.contract, data: '0x313ce567' }, block]),
    rpc('eth_call', [
      {
        to: policy.contract,
        data: '0x70a08231' + wallet.slice(2).toLowerCase().padStart(64, '0'),
      },
      block,
    ]),
  ]);
  if (
    code === '0x' ||
    BigInt(decimals) !== BigInt(policy.decimals) ||
    amount === '0x' ||
    amount.length > 66 ||
    decimals.length > 66
  )
    throw new VerificationFailure(
      'Verification asset mismatch.',
      'asset-mismatch',
    );
  const balance = BigInt(amount),
    required = BigInt(policy.threshold) * BigInt(10) ** BigInt(policy.decimals);
  return { block, amount: balance.toString(), eligible: balance >= required };
}
export async function realmAccess(
  db: D1Database,
  wallet: string,
  values: Record<string, unknown>,
  localTest: boolean,
  now = Date.now(),
  transport: typeof fetch = fetch,
): Promise<RealmAccess> {
  const policy = tokenPolicy(values);
  // The live adapter only verifies EVM holdings. A Solana account cannot reuse
  // a cached allowance or another wallet's holdings; free gameplay is separate.
  // Preserve the explicit local-only test mode when no real policy is set.
  if (!supportsHoldingAccount(wallet) && !(localTest && !policy))
    return {
      status: 'unsupported',
      allowed: false,
      threshold: policy?.threshold ?? '888',
      message:
        'GPU holder access currently supports Ethereum/EVM accounts only. Your saved game stays separate and your free center remains playable.',
    };
  if (!policy)
    return localTest
      ? {
          status: 'test',
          allowed: true,
          threshold: '888',
          message:
            'Local test access. No live token holdings are being checked.',
        }
      : {
          status: 'unconfigured',
          allowed: false,
          threshold: '888',
          message:
            'Holder access is not available yet. Your free center remains playable.',
        };
  type Row = {
    policy: string;
    amount: string;
    block: string;
    status: string;
    checked_at: number;
    next_check_at: number;
    grace_until: number;
  };
  const started = Date.now();
  const recoveryId = crypto.randomUUID();
  let saved: Row | null;
  try {
    saved = await db
      .prepare('SELECT * FROM realm_entitlements WHERE wallet=?')
      .bind(wallet)
      .first<Row>();
  } catch (error) {
    emitOperationalEvent({
      event: 'holder-storage-failed',
      recoveryId,
      phase: 'storage',
      reason: 'storage',
      durationMs: Date.now() - started,
    });
    throw error;
  }
  const same = saved?.policy === policy.key ? saved : null;
  const present = (
    status: RealmAccess['status'],
    allowed: boolean,
    checkedAt?: number,
    graceUntil?: number,
  ): RealmAccess => ({
    status,
    allowed,
    threshold: policy.threshold,
    checkedAt,
    graceUntil,
    message:
      status === 'eligible'
        ? 'Holdings verified. No tokens are spent.'
        : status === 'ineligible'
          ? 'Hold ' +
            policy.threshold +
            ' $NOOBIUS to enter. Your center and earned rewards remain yours.'
          : allowed
            ? 'Verification is temporarily unavailable. Your recent access remains valid briefly.'
            : 'We could not verify holdings. Try again shortly; your progress is safe.',
  });
  const winningDecision = async () => {
    const latest = await db
      .prepare('SELECT * FROM realm_entitlements WHERE wallet=?')
      .bind(wallet)
      .first<Row>();
    if (!latest || latest.policy !== policy.key)
      return present('unavailable', false);
    return present(
      latest.status as RealmAccess['status'],
      latest.status === 'eligible' ||
        (latest.status === 'unavailable' && latest.grace_until > now),
      latest.checked_at,
      latest.grace_until,
    );
  };
  if (same && same.next_check_at > now)
    return present(
      same.status as RealmAccess['status'],
      same.status === 'eligible' ||
        (same.status === 'unavailable' && same.grace_until > now),
      same.checked_at,
      same.grace_until,
    );
  const report = (decision: RealmAccess, failure?: VerificationFailure) =>
    emitOperationalEvent({
      event: 'holder-verification',
      recoveryId,
      phase: 'verification',
      durationMs: Date.now() - started,
      outcome:
        decision.status === 'eligible'
          ? 'eligible'
          : decision.status === 'ineligible'
            ? 'ineligible'
            : decision.allowed
              ? 'grace'
              : 'unavailable',
      ...(failure ? { reason: failure.reason, status: failure.status } : {}),
    });
  let verified = false;
  try {
    const result = await readTokenHolding(policy, wallet, transport);
    verified = true;
    const status = result.eligible ? 'eligible' : 'ineligible',
      grace = result.eligible ? now + 300000 : 0;
    await db
      .prepare(
        `INSERT INTO realm_entitlements(wallet,policy,amount,block,status,checked_at,next_check_at,grace_until) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET policy=excluded.policy,amount=excluded.amount,block=excluded.block,status=excluded.status,checked_at=MAX(realm_entitlements.checked_at,excluded.checked_at),next_check_at=excluded.next_check_at,grace_until=excluded.grace_until WHERE
          (excluded.policy<>realm_entitlements.policy AND excluded.checked_at>realm_entitlements.checked_at) OR
          (excluded.policy=realm_entitlements.policy AND (
            length(excluded.block)>length(realm_entitlements.block) OR
            (length(excluded.block)=length(realm_entitlements.block) AND excluded.block>realm_entitlements.block) OR
            (excluded.block=realm_entitlements.block AND (excluded.status='ineligible' OR
              (realm_entitlements.status<>'ineligible' AND excluded.checked_at>realm_entitlements.checked_at)))))`,
      )
      .bind(
        wallet,
        policy.key,
        result.amount,
        result.block,
        status,
        now,
        now + 60000,
        grace,
      )
      .run();
    const decision = await winningDecision();
    report(decision);
    return decision;
  } catch (error) {
    if (verified) {
      emitOperationalEvent({
        event: 'holder-storage-failed',
        recoveryId,
        phase: 'storage',
        reason: 'storage',
        durationMs: Date.now() - started,
      });
      throw error;
    }
    const failure =
      error instanceof VerificationFailure
        ? error
        : new VerificationFailure('Verification unavailable.', 'unknown');
    const grace = same?.grace_until ?? 0;
    try {
      await db
        .prepare(
          `INSERT INTO realm_entitlements(wallet,policy,amount,block,status,checked_at,next_check_at,grace_until) VALUES (?,?,?,?,'unavailable',?,?,?) ON CONFLICT(wallet) DO UPDATE SET status=CASE WHEN realm_entitlements.status='ineligible' THEN 'ineligible' ELSE 'unavailable' END,next_check_at=excluded.next_check_at WHERE realm_entitlements.policy=excluded.policy AND realm_entitlements.checked_at<=?`,
        )
        .bind(
          wallet,
          policy.key,
          same?.amount ?? '0',
          same?.block ?? '0x0',
          same?.checked_at ?? now,
          now + 15000,
          grace,
          same?.checked_at ?? now,
        )
        .run();
      const decision = await winningDecision();
      report(decision, failure);
      return decision;
    } catch (storageError) {
      emitOperationalEvent({
        event: 'holder-verification',
        recoveryId,
        phase: 'verification',
        reason: failure.reason,
        status: failure.status,
        durationMs: Date.now() - started,
      });
      emitOperationalEvent({
        event: 'holder-storage-failed',
        recoveryId,
        phase: 'storage',
        reason: 'storage',
      });
      throw storageError;
    }
  }
}
