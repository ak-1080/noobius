// Manual, isolated devnet trial only. Never targets play.noobius.io or mainnet.
// Requires a finalized devnet proof from smoke-solana-devnet.mjs first.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createKeyPairFromBytes, getAddressFromPublicKey } from '@solana/kit';
import { assertPaymentDrain } from './check-payment-drain.mjs';
import { configuredDevnetRpcUrl, validatePrivateDevnetRpcUrl } from './devnet-rpc-config.mjs';
import {
  SOLANA_GENESIS, SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM,
} from '../lib/solana-holdings.ts';

const rpcUrl = configuredDevnetRpcUrl();
const fallbackRpcUrl = process.env.NOOBIUS_DEVNET_RPC_FALLBACK_URL;
if (fallbackRpcUrl &&
    validatePrivateDevnetRpcUrl(fallbackRpcUrl) === rpcUrl)
  throw Error('Fallback devnet RPC must be a separate endpoint.');
const source = JSON.parse(readFileSync('deploy/cloudflare/staging-game.json', 'utf8'));
const recovery = JSON.parse(readFileSync('deploy/cloudflare/staging-payments.json', 'utf8'));
if (
  process.env.NOOBIUS_STAGE_DEVNET_PAYMENTS !== '1' ||
  source.name !== 'noobius-game-staging' ||
  recovery.name !== 'noobius-payment-recovery-staging' ||
  source.d1_databases?.[0]?.database_id !== 'c996298e-b0ee-4edb-9684-33e44c22d5d8' ||
  recovery.d1_databases?.[0]?.database_id !== source.d1_databases[0].database_id ||
  source.vars?.NOOBIUS_SOLANA_NETWORK !== 'devnet' ||
  recovery.vars?.NOOBIUS_SOLANA_NETWORK !== 'devnet' ||
  source.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false' ||
  recovery.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false'
) throw Error('Refusing a non-staging or implicit devnet payment deployment.');

if (!existsSync('.wrangler/noobius-devnet-proof.json') ||
    !existsSync('.wrangler/noobius-devnet-wallets.json'))
  throw Error('No finalized devnet test-token proof and generated keys exist. Staging token checkout remains disabled.');
const proof = JSON.parse(readFileSync('.wrangler/noobius-devnet-proof.json', 'utf8'));
const saved = JSON.parse(readFileSync('.wrangler/noobius-devnet-wallets.json', 'utf8'));
if (
  proof.network !== 'devnet' || saved.network !== 'devnet' ||
  ![SPL_TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(proof.tokenProgram) ||
  proof.apiCheckout?.status !== 'settled' ||
  proof.apiCheckout?.computeDelivered !== 250 ||
  proof.apiCheckout?.tokenTransferred !== '1' ||
  proof.tokenTransferred !== '1' ||
  proof.duplicateDeliveryPrevented !== true ||
  typeof proof.signature !== 'string' ||
  typeof proof.apiCheckout?.signature !== 'string' ||
  proof.mint !== saved[proof.tokenProgram === TOKEN_2022_PROGRAM ? 'mint2022' : 'mint']?.address ||
  !saved.authorization?.address || !saved.authorization?.secret
) throw Error('A matching finalized devnet test-token checkout proof is required.');
const signer = await createKeyPairFromBytes(Buffer.from(saved.authorization.secret, 'base64'));
assert.equal(await getAddressFromPublicKey(signer.publicKey), saved.authorization.address);

async function rpc(method, params = []) {
  const id = crypto.randomUUID();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error('Devnet RPC unavailable.');
  const data = await response.json();
  if (data?.id !== id || data.error || !Object.hasOwn(data, 'result'))
    throw Error('Devnet RPC returned an error.');
  return data.result;
}
if (await rpc('getGenesisHash') !== SOLANA_GENESIS.devnet)
  throw Error('Refusing a non-devnet RPC.');
for (const signature of [proof.signature, proof.apiCheckout.signature]) {
  const transaction = await rpc('getTransaction', [signature, {
    encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0,
  }]);
  if (!transaction || transaction.meta?.err !== null)
    throw Error('The devnet test payment is not finalized successfully.');
}

// A provider that works locally can still fail from Cloudflare's egress IP.
// Verify the actual hosted runtime before enabling trading on either Worker.
const hostedProbe = spawnSync('npm', ['run', 'probe:hosted:solana-rpc'], {
  stdio: 'inherit',
  env: { ...process.env, NOOBIUS_DEVNET_RPC_URL: rpcUrl },
});
if (hostedProbe.status !== 0)
  throw Error('The configured devnet RPC did not pass the read-only hosted Cloudflare probe. Staging trading remains disabled.');

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw Error(`${command} did not finish successfully.`);
}
const tokenVars = {
  NOOBIUS_TOKEN_ECOSYSTEM: 'solana',
  NOOBIUS_SOLANA_NETWORK: 'devnet',
  NOOBIUS_TOKEN_MINT: proof.mint,
  NOOBIUS_TOKEN_PROGRAM: proof.tokenProgram,
  NOOBIUS_TOKEN_DECIMALS: '6',
  NOOBIUS_PAYMENT_SIGNER: saved.authorization.address,
  NOOBIUS_PAYMENTS_ENABLED: 'true',
};
const rpcSecrets = {
  NOOBIUS_TOKEN_RPC_URL: rpcUrl,
  ...(fallbackRpcUrl ? { NOOBIUS_TOKEN_RPC_FALLBACK_URL: fallbackRpcUrl } : {}),
};
run('npm', ['run', 'preflight:solana-mint'], {
  ...tokenVars,
  ...rpcSecrets,
});
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'build:staging']);
const gamePath = 'dist/server/wrangler.json';
const built = JSON.parse(readFileSync(gamePath, 'utf8'));
if (
  built.name !== source.name ||
  built.d1_databases?.[0]?.database_id !== source.d1_databases[0].database_id ||
  built.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false'
) throw Error('The generated game Worker does not target disabled staging.');
assertPaymentDrain('deploy/cloudflare/staging-game.json', 'Staging');

// The generated files are ignored or removed. The application key never enters
// committed configuration or a command-line argument.
mkdirSync('.wrangler', { recursive: true });
const secretsPath = '.wrangler/staging-payment-secrets.json';
const recoveryPath = 'deploy/cloudflare/.staging-payments-enabled.json';
try {
  writeFileSync(secretsPath, JSON.stringify({
    ...rpcSecrets,
    NOOBIUS_PAYMENT_KEYS: JSON.stringify({
      [saved.authorization.address]: saved.authorization.secret,
    }),
  }), { mode: 0o600 });
  writeFileSync(gamePath, JSON.stringify({
    ...built,
    vars: { ...built.vars, ...tokenVars, NOOBIUS_TOKEN_THRESHOLD: '1' },
  }, null, 2));
  writeFileSync(recoveryPath, JSON.stringify({
    ...recovery,
    vars: { ...recovery.vars, ...tokenVars },
  }, null, 2));
  // Recovery must be ready before the game can issue its first signed quote.
  run('./node_modules/.bin/wrangler', [
    'deploy', '--config', recoveryPath, '--secrets-file', secretsPath,
  ]);
  run('./node_modules/.bin/wrangler', [
    'deploy', '--config', gamePath, '--secrets-file', secretsPath,
  ]);
  run('npm', ['run', 'smoke:staging'], {
    NOOBIUS_EXPECT_STAGING_TRADING: '1',
  });
  console.log('Isolated devnet test-token marketplace configured on staging only.');
} finally {
  rmSync(secretsPath, { force: true });
  rmSync(recoveryPath, { force: true });
}
