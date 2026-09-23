// A paused deployment must not discard the configuration needed to finish a
// buyer's already-signed token transaction. Call after applying migrations.
import { spawnSync } from 'node:child_process';

export function assertEmptyPaymentDrain(output, label) {
  let count;
  try {
    const parsed = JSON.parse(output);
    if (parsed?.[0]?.success === true)
      count = parsed[0]?.results?.[0]?.count;
  } catch {
    // Malformed or missing Cloudflare output is not proof of an empty ledger.
  }
  if (!Number.isSafeInteger(count) || count < 0)
    throw Error(`Cannot read ${label} unsettled-payment count; refusing to deploy.`);
  if (count !== 0)
    throw Error(`${label} has ${count} unsettled payment(s). Keep the existing mint, network, RPC and signer configuration and reconcile them before deploying this paused configuration.`);
}

export function assertPaymentDrain(configPath, label) {
  const result = spawnSync('./node_modules/.bin/wrangler', [
    'd1', 'execute', 'DB', '--remote', '--config', configPath,
    '--command',
    "SELECT COUNT(*) AS count FROM compute_payments WHERE status IN ('quoted','recorded','submitted')",
    '--json',
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0)
    throw Error(`Cannot verify ${label} payment drain; refusing to deploy a paused token configuration.`);
  assertEmptyPaymentDrain(result.stdout, label);
  console.log(`${label} payment drain verified: 0 unsettled.`);
}
