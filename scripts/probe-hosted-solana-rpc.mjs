// Read-only probe from Cloudflare's remote Workers runtime. This does not
// deploy the game, enable payments, sign, or send a transaction.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { validSolanaAddress } from '../lib/solana-holdings.ts';
import { configuredDevnetRpcUrl } from './devnet-rpc-config.mjs';

const rpcUrl = process.env.NOOBIUS_PROBE_PUBLIC_RPC === '1'
  ? 'https://api.devnet.solana.com'
  : configuredDevnetRpcUrl();
let parsed;
try { parsed = new URL(rpcUrl); } catch { /* validated below */ }
if (parsed?.protocol !== 'https:' || parsed.username || parsed.password)
  throw Error('Set NOOBIUS_DEVNET_RPC_URL to an HTTPS devnet RPC endpoint.');
const proofPath = '.wrangler/noobius-devnet-proof.json';
if (!existsSync(proofPath)) throw Error('Generated devnet proof is missing.');
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
if (proof.network !== 'devnet' || !validSolanaAddress(proof.mint) ||
    typeof proof.signature !== 'string')
  throw Error('Generated devnet proof is invalid.');

mkdirSync('.wrangler', { recursive: true });
const envPath = 'services/rpc-probe/.dev.vars';
writeFileSync(envPath, [
  `NOOBIUS_RPC_URL=${JSON.stringify(rpcUrl)}`,
  `NOOBIUS_MINT=${JSON.stringify(proof.mint)}`,
  `NOOBIUS_SIGNATURE=${JSON.stringify(proof.signature)}`,
  '',
].join('\n'), { mode: 0o600 });
const port = 18800 + Math.floor(Math.random() * 1000);
const child = spawn('./node_modules/.bin/wrangler', [
  'dev', '--remote', '--config', 'services/rpc-probe/wrangler.jsonc',
  '--port', String(port), '--show-interactive-dev-session=false',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let exited = false;
child.stdout.resume();
child.stderr.resume();
child.on('exit', () => { exited = true; });
const cleanup = () => {
  child.kill('SIGTERM');
  rmSync(envPath, { force: true });
};
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });
try {
  let result;
  for (let i = 0; i < 75; i++) {
    if (exited) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(2000),
      });
      result = await response.json();
      break;
    } catch {
      await delay(800);
    }
  }
  if (!result) {
    // Never print Wrangler's raw output: it might include a credential URL.
    throw Error(`Remote Cloudflare probe could not start${exited ? ' (Wrangler exited)' : ' (timed out)'}.`);
  }
  if (result.checks?.genesis?.network === 'wrong-network')
    throw Error('The configured RPC is not Solana devnet.');
  console.log(JSON.stringify({
    provider: parsed.hostname,
    network: 'devnet',
    ...result,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  cleanup();
}
