import { base58 } from '@scure/base';
export const SOLANA_GENESIS = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
} as const;
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export type SupportedTokenProgram =
  | typeof SPL_TOKEN_PROGRAM
  | typeof TOKEN_2022_PROGRAM;
export type SolanaHoldingPolicy = {
  ecosystem: 'solana';
  network: keyof typeof SOLANA_GENESIS;
  contract: string;
  tokenProgram: SupportedTokenProgram;
  decimals: number;
  threshold: string;
  rpcUrl: string;
  key: string;
};
export function validSolanaAddress(value: string) {
  try {
    return base58.decode(value).length === 32;
  } catch {
    return false;
  }
}
export const tokenSetting = (value: unknown, fallback = ''): string =>
  value == null
    ? fallback
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
export function solanaHoldingPolicy(
  values: Record<string, unknown>,
): SolanaHoldingPolicy | null {
  const network = tokenSetting(values.NOOBIUS_SOLANA_NETWORK, 'mainnet-beta');
  const contract = tokenSetting(values.NOOBIUS_TOKEN_MINT);
  const tokenProgram = tokenSetting(
    values.NOOBIUS_TOKEN_PROGRAM,
    SPL_TOKEN_PROGRAM,
  );
  const rawDecimals = tokenSetting(values.NOOBIUS_TOKEN_DECIMALS);
  const decimals = Number(rawDecimals);
  const threshold = tokenSetting(values.NOOBIUS_TOKEN_THRESHOLD, '888');
  const rpcUrl = tokenSetting(values.NOOBIUS_TOKEN_RPC_URL);
  if (
    !(network === 'mainnet-beta' || network === 'devnet') ||
    !validSolanaAddress(contract) ||
    ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(tokenProgram) ||
    !/^(0|[1-9]\d*)$/.test(rawDecimals) ||
    decimals > 18 ||
    !/^[1-9]\d{0,17}$/.test(threshold)
  )
    return null;
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch {
    return null;
  }
  return {
    ecosystem: 'solana',
    network,
    contract,
    tokenProgram: tokenProgram as SupportedTokenProgram,
    decimals,
    threshold,
    rpcUrl,
    key: [
      'solana',
      SOLANA_GENESIS[network],
      contract,
      tokenProgram,
      decimals,
      threshold,
      'finalized',
    ].join(':'),
  };
}
// Reject inconsistent/malformed RPC data rather than converting it into zero holdings.
export async function readSolanaHolding(
  policy: SolanaHoldingPolicy,
  wallet: string,
  transport: typeof fetch = fetch,
) {
  const owner = wallet.startsWith('solana:') ? wallet.slice(7) : '';
  if (!validSolanaAddress(owner))
    throw Error('Holder verification requires a Solana account.');
  let id = 0;
  const rpc = async (method: string, params: unknown[]) => {
    const requestId = ++id;
    const response = await transport(policy.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
      signal: AbortSignal.timeout(7000),
      // Workers supports manual redirects; non-2xx responses fail below.
      redirect: 'manual',
    });
    if (!response.ok) throw Error('Solana verification unavailable.');
    const data = (await response.json()) as {
      id?: unknown;
      error?: unknown;
      result?: unknown;
    };
    if (
      !data ||
      data.id !== requestId ||
      data.error ||
      data.result === undefined
    )
      throw Error('Invalid Solana verification response.');
    return data.result;
  };
  if ((await rpc('getGenesisHash', [])) !== SOLANA_GENESIS[policy.network])
    throw Error('Solana verification network mismatch.');
  type ParsedAccount = {
    owner?: string;
    executable?: boolean;
    data?: { parsed?: { type?: string; info?: Record<string, unknown> } };
  };
  const mint = (await rpc('getAccountInfo', [
    policy.contract,
    { encoding: 'jsonParsed', commitment: 'finalized' },
  ])) as { context?: { slot?: number }; value?: ParsedAccount };
  const slot = mint?.context?.slot;
  const program = mint?.value?.owner;
  const mintInfo = mint?.value?.data?.parsed;
  if (
    !Number.isSafeInteger(slot) ||
    Number(slot) < 0 ||
    program !== policy.tokenProgram ||
    mint.value?.executable !== false ||
    mintInfo?.type !== 'mint' ||
    mintInfo.info?.decimals !== policy.decimals ||
    mintInfo.info?.isInitialized !== true
  )
    throw Error('Solana mint mismatch.');
  const holdings = (await rpc('getTokenAccountsByOwner', [
    owner,
    { mint: policy.contract },
    { encoding: 'jsonParsed', commitment: 'finalized', minContextSlot: slot },
  ])) as {
    context?: { slot?: number };
    value?: { pubkey?: string; account?: ParsedAccount }[];
  };
  const holdingSlot = holdings?.context?.slot;
  if (
    !Number.isSafeInteger(holdingSlot) ||
    Number(holdingSlot) < Number(slot) ||
    !Array.isArray(holdings.value)
  )
    throw Error('Invalid Solana holdings context.');
  let balance = BigInt(0);
  const seen = new Set<string>();
  for (const row of holdings.value) {
    const parsed = row.account?.data?.parsed;
    const info = parsed?.info;
    const amount = info?.tokenAmount as
      | { amount?: unknown; decimals?: unknown }
      | undefined;
    if (
      !row.pubkey ||
      !validSolanaAddress(row.pubkey) ||
      seen.has(row.pubkey) ||
      row.account?.owner !== program ||
      row.account?.executable !== false ||
      parsed?.type !== 'account' ||
      info?.owner !== owner ||
      info?.mint !== policy.contract ||
      !['initialized', 'frozen'].includes(String(info?.state)) ||
      amount?.decimals !== policy.decimals ||
      typeof amount?.amount !== 'string' ||
      !/^(0|[1-9]\d{0,19})$/.test(amount.amount) ||
      BigInt(amount.amount) > BigInt('18446744073709551615')
    )
      throw Error('Invalid Solana token account.');
    seen.add(row.pubkey);
    balance += BigInt(amount.amount);
  }
  return {
    block: '0x' + BigInt(holdingSlot!).toString(16),
    amount: balance.toString(),
    eligible:
      balance >=
      BigInt(policy.threshold) * BigInt(10) ** BigInt(policy.decimals),
  };
}
