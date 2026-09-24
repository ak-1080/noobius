import { existsSync, readFileSync } from 'node:fs';

export const DEVNET_RPC_FILE = '.wrangler/noobius-devnet-rpc-url';

export function validatePrivateDevnetRpcUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { /* validated below */ }
  if (parsed?.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.hostname === 'api.devnet.solana.com')
    throw Error('Use a private HTTPS Solana devnet RPC URL, not the blocked public endpoint.');
  return parsed.href;
}

export function configuredDevnetRpcUrl() {
  const value = process.env.NOOBIUS_DEVNET_RPC_URL ||
    (existsSync(DEVNET_RPC_FILE) ? readFileSync(DEVNET_RPC_FILE, 'utf8').trim() : '');
  if (!value)
    throw Error('Save a private devnet RPC URL with npm run configure:devnet-rpc.');
  return validatePrivateDevnetRpcUrl(value);
}
