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
  status: 'eligible' | 'ineligible' | 'unavailable' | 'unconfigured' | 'test';
  allowed: boolean;
  threshold: string;
  checkedAt?: number;
  graceUntil?: number;
  message: string;
};
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
  if (!/^0x[a-f0-9]{40}$/i.test(wallet))
    throw new Error('Unsupported account.');
  let sequence = 0;
  const rpc = async (method: string, params: unknown[]) => {
    const response = await transport(policy.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('Verification service unavailable.');
    const data = (await response.json()) as {
      result?: unknown;
      error?: unknown;
    };
    if (
      data.error ||
      typeof data.result !== 'string' ||
      !/^0x[0-9a-f]*$/i.test(data.result)
    )
      throw new Error('Invalid verification response.');
    return data.result;
  };
  const [chain, head] = await Promise.all([
    rpc('eth_chainId', []),
    rpc('eth_blockNumber', []),
  ]);
  if (BigInt(chain) !== BigInt(policy.chainId))
    throw new Error('Verification network mismatch.');
  const number = BigInt(head) - BigInt(policy.confirmations);
  if (number < BigInt(0)) throw new Error('Verification block unavailable.');
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
    amount === '0x'
  )
    throw new Error('Verification asset mismatch.');
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
  const saved = await db
    .prepare('SELECT * FROM realm_entitlements WHERE wallet=?')
    .bind(wallet)
    .first<Row>();
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
  try {
    const result = await readTokenHolding(policy, wallet, transport);
    const status = result.eligible ? 'eligible' : 'ineligible',
      grace = result.eligible ? now + 300000 : 0;
    await db
      .prepare(
        `INSERT INTO realm_entitlements(wallet,policy,amount,block,status,checked_at,next_check_at,grace_until) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET policy=excluded.policy,amount=excluded.amount,block=excluded.block,status=excluded.status,checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,grace_until=excluded.grace_until WHERE excluded.checked_at>=realm_entitlements.checked_at`,
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
    return winningDecision();
  } catch {
    const grace = same?.grace_until ?? 0;
    await db
      .prepare(
        `INSERT INTO realm_entitlements(wallet,policy,amount,block,status,checked_at,next_check_at,grace_until) VALUES (?,?,?,?,'unavailable',?,?,?) ON CONFLICT(wallet) DO UPDATE SET status='unavailable',next_check_at=excluded.next_check_at WHERE realm_entitlements.policy=excluded.policy AND realm_entitlements.checked_at<=?`,
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
    return winningDecision();
  }
}
