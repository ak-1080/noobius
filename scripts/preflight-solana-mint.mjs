// Read-only launch check for the exact Solana mint intended for Compute trades.
// Set NOOBIUS_TOKEN_MINT, NOOBIUS_SOLANA_NETWORK, and NOOBIUS_TOKEN_RPC_URL.
// An optional NOOBIUS_TOKEN_RPC_FALLBACK_URL is checked against the same mint.
import { SOLANA_GENESIS, solanaHoldingPolicy, validSolanaAddress } from '../lib/solana-holdings.ts';
import { ComputePaymentRpc } from '../lib/compute-payment-rpc.ts';

const mint = process.env.NOOBIUS_TOKEN_MINT;
const network = process.env.NOOBIUS_SOLANA_NETWORK;
const rpcUrl = process.env.NOOBIUS_TOKEN_RPC_URL;
const fallbackUrl = process.env.NOOBIUS_TOKEN_RPC_FALLBACK_URL;
if (!validSolanaAddress(mint ?? '') || !Object.hasOwn(SOLANA_GENESIS, network ?? ''))
  throw Error('Set a valid NOOBIUS_TOKEN_MINT and NOOBIUS_SOLANA_NETWORK (devnet or mainnet-beta).');
let parsedUrl;
try {
  parsedUrl = new URL(rpcUrl);
} catch {
  throw Error('Set NOOBIUS_TOKEN_RPC_URL to the trusted HTTPS Solana RPC endpoint.');
}
if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password)
  throw Error('The Solana RPC must use HTTPS without URL credentials.');

async function rpc(method, params = []) {
  const id = crypto.randomUUID();
  const response = await fetch(parsedUrl, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error('Solana RPC unavailable for ' + method + '.');
  const data = await response.json();
  if (data?.id !== id || data?.error || !Object.hasOwn(data ?? {}, 'result'))
    throw Error('Solana RPC returned an error for ' + method + '.');
  return data.result;
}

const genesis = await rpc('getGenesisHash');
if (genesis !== SOLANA_GENESIS[network])
  throw Error('RPC network does not match NOOBIUS_SOLANA_NETWORK.');
const result = await rpc('getAccountInfo', [mint, {
  encoding: 'jsonParsed', commitment: 'finalized',
}]);
const account = result?.value;
const info = account?.data?.parsed?.info;
const program = account?.owner;
const decimals = info?.decimals;
if (
  !Number.isSafeInteger(result?.context?.slot) ||
  !account || account.executable !== false ||
  account.data?.parsed?.type !== 'mint' ||
  info?.isInitialized !== true ||
  !Number.isSafeInteger(decimals)
)
  throw Error('The address is not a finalized, initialized Solana token mint.');
const policy = solanaHoldingPolicy({
  NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
  NOOBIUS_SOLANA_NETWORK: network,
  NOOBIUS_TOKEN_MINT: mint,
  NOOBIUS_TOKEN_PROGRAM: program,
  NOOBIUS_TOKEN_DECIMALS: String(decimals),
  NOOBIUS_TOKEN_RPC_URL: rpcUrl,
});
if (!policy)
  throw Error('Mint program or precision is not supported by Noobius.');
// Reuse the checkout's real extension and finalized-blockhash validation.
await new ComputePaymentRpc(policy).quoteLifetime();
if (fallbackUrl) {
  // Force the secondary endpoint through the full genesis/mint/blockhash check
  // even when the primary is healthy. No signed transaction is sent.
  await new ComputePaymentRpc({ ...policy, rpcUrl: fallbackUrl }).quoteLifetime();
  new ComputePaymentRpc(policy, fetch, fallbackUrl);
}
console.log(JSON.stringify({
  ok: true,
  network,
  mint,
  program,
  decimals,
  extensions: info.extensions ?? [],
  finalizedSlot: result.context.slot,
  fallbackChecked: Boolean(fallbackUrl),
  result: 'Mint accepted by the current Noobius checkout rules; no trade has been made.',
}, null, 2));
