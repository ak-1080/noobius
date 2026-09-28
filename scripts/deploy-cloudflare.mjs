// Deploy only the owner-account game. The coming-soon Worker is a separate project.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertPaymentDrain } from './check-payment-drain.mjs';
import {
  assertProductionTargets,
  assertProductionBuild,
} from './production-deploy-preflight.mjs';
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0)
    throw Error(`${command} did not finish successfully.`);
};
function readConfig(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw Error('Cannot read required production deployment configuration.');
  }
}

// Dependencies are injectable so the actual release order can be checked without
// a Cloudflare login, a network request, migration, or deployment.
export async function deployProduction({
  read = readConfig,
  execute = run,
  paymentDrain = assertPaymentDrain,
  fetchHealth = fetch,
  report = console.log,
} = {}) {
  const configurations = () => ({
    game: read('deploy/cloudflare/game.json'),
    rooms: read('deploy/cloudflare/rooms.json'),
    recovery: read('deploy/cloudflare/payments.json'),
  });
  assertProductionTargets(configurations());
  execute('npm', ['test']);
  execute('npm', ['run', 'typecheck']);
  execute('npm', ['run', 'test:release-api']);
  execute('npm', ['run', 'build:cloudflare']);
  const current = configurations();
  assertProductionTargets(current);
  assertProductionBuild(read('dist/server/wrangler.json'), current.game);
  // Read the current hosted ledger before the first production mutation. Missing
  // tables, errors and a missing proof all fail closed; do not migrate to bypass it.
  if (paymentDrain('deploy/cloudflare/game.json', 'Production') !== true)
    throw Error(
      'Production payment drain was not verified; refusing to deploy.',
    );
  execute('./node_modules/.bin/wrangler', [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--remote',
    '--config',
    'deploy/cloudflare/game.json',
  ]);
  execute('./node_modules/.bin/wrangler', [
    'deploy',
    '--config',
    'dist/server/wrangler.json',
  ]);
  execute('./node_modules/.bin/wrangler', [
    'deploy',
    '--config',
    'deploy/cloudflare/rooms.json',
  ]);
  execute('./node_modules/.bin/wrangler', [
    'deploy',
    '--config',
    'deploy/cloudflare/payments.json',
  ]);
  const r = await fetchHealth('https://play.noobius.io/api/health');
  if (!r.ok || (await r.json()).status !== 'ok')
    throw Error(
      'Post-deploy health check failed; inspect the current deployment before retrying',
    );
  report(
    'Deployed game, room service and payment recovery; production health check passed.',
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await deployProduction();
