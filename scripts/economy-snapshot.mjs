// Aggregate, read-only staging telemetry. Never prints wallet, browser,
// network, cookie, signature, transaction or individual profile fields.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const config = 'deploy/cloudflare/staging-game.json';
const target = JSON.parse(readFileSync(config, 'utf8'));
if (
  process.argv.slice(2).join(' ') !== '--staging' ||
  target.name !== 'noobius-game-staging' ||
  target.d1_databases?.[0]?.database_id !==
    'c996298e-b0ee-4edb-9684-33e44c22d5d8' ||
  target.vars?.NOOBIUS_SOLANA_NETWORK !== 'devnet'
)
  throw Error('Use --staging with the pinned isolated devnet database.');
const queries = {
  balances:
    'SELECT COUNT(*) AS saved_accounts,COALESCE(SUM(credits),0) AS spendable_compute FROM players',
  escrow:
    'SELECT status,COUNT(*) AS offers,COALESCE(SUM(compute),0) AS compute FROM compute_listings GROUP BY status',
  payments:
    'SELECT status,COUNT(*) AS checkouts FROM compute_payments GROUP BY status',
  allowanceCharges24h:
    "SELECT source,COUNT(*) AS actions,COALESCE(SUM(compute),0) AS booked_compute_allowance,COALESCE(SUM(materials),0) AS charged_material_points FROM earning_events WHERE created_at>CAST(strftime('%s','now') AS INTEGER)*1000-86400000 GROUP BY source",
  signup24h:
    "SELECT COUNT(*) AS new_accounts,COUNT(DISTINCT browser_key) AS enrolled_pools FROM earning_accounts WHERE new_account=1 AND created_at>CAST(strftime('%s','now') AS INTEGER)*1000-86400000",
  sharedPools:
    'SELECT COUNT(*) AS pools_with_multiple_wallets FROM (SELECT browser_key FROM earning_accounts GROUP BY browser_key HAVING COUNT(*)>1)',
};
const beganAt = new Date().toISOString(),
  data = {};
for (const [name, sql] of Object.entries(queries)) {
  const output = execFileSync(
    './node_modules/.bin/wrangler',
    [
      'd1',
      'execute',
      'DB',
      '--remote',
      '--config',
      config,
      '--command',
      sql,
      '--json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 },
  );
  const result = JSON.parse(output);
  if (!result.every((row) => row.success))
    throw Error('Staging aggregate query failed.');
  data[name] = result.flatMap((row) => row.results);
}
console.log(
  JSON.stringify(
    {
      version: 1,
      environment: 'isolated devnet staging',
      beganAt,
      finishedAt: new Date().toISOString(),
      ...data,
      limits: [
        'Sequential snapshots are not one atomic observation.',
        'Staging includes generated QA balances; this is not organic player activity.',
        'Allowance charges include promised work, not only collected payouts.',
        'No complete historical spend ledger exists; balance deltas are not gross issuance or spending.',
        'Sold-offer Compute is transferred, not minted.',
      ],
    },
    null,
    2,
  ),
);
