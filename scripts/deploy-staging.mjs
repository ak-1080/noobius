// Isolated devnet staging: never point this script at production D1.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertPaymentDrain } from './check-payment-drain.mjs';

const target = JSON.parse(
  readFileSync('deploy/cloudflare/staging-game.json', 'utf8'),
);
const recovery = JSON.parse(
  readFileSync('deploy/cloudflare/staging-payments.json', 'utf8'),
);
if (
  target.name !== 'noobius-game-staging' ||
  target.d1_databases?.[0]?.database_id !==
    'c996298e-b0ee-4edb-9684-33e44c22d5d8' ||
  target.vars?.NOOBIUS_SOLANA_NETWORK !== 'devnet' ||
  target.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false'
)
  throw Error('Unexpected staging deployment destination or token settings.');
if (
  recovery.name !== 'noobius-payment-recovery-staging' ||
  recovery.d1_databases?.[0]?.database_id !==
    target.d1_databases[0].database_id ||
  recovery.vars?.NOOBIUS_SOLANA_NETWORK !== 'devnet' ||
  recovery.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false'
)
  throw Error('Unexpected staging payment recovery destination.');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['test']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'build:staging']);
const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
if (
  built.name !== target.name ||
  built.d1_databases?.[0]?.database_id !== target.d1_databases[0].database_id ||
  built.vars?.NOOBIUS_PAYMENTS_ENABLED !== 'false'
)
  throw Error('Built game does not target isolated staging.');
run('./node_modules/.bin/wrangler', [
  'd1',
  'migrations',
  'apply',
  'DB',
  '--remote',
  '--config',
  'deploy/cloudflare/staging-game.json',
]);
assertPaymentDrain('deploy/cloudflare/staging-game.json', 'Staging');
run('./node_modules/.bin/wrangler', [
  'deploy',
  '--config',
  'dist/server/wrangler.json',
]);
run('./node_modules/.bin/wrangler', [
  'deploy',
  '--config',
  'deploy/cloudflare/staging-payments.json',
]);
