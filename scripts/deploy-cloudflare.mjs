// Deploy only the owner-account game. The coming-soon Worker is a separate project.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const target = JSON.parse(readFileSync('deploy/cloudflare/game.json', 'utf8'));
if (
  target.name !== 'noobius-game' ||
  target.d1_databases[0].database_name !== 'noobius-game-production'
)
  throw Error('Unexpected deployment destination');
run('npm', ['test']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'build:cloudflare']);
const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
if (
  built.name !== target.name ||
  built.d1_databases[0].database_id !== target.d1_databases[0].database_id
)
  throw Error('Build does not target the production database');
run('./node_modules/.bin/wrangler', [
  'd1',
  'migrations',
  'apply',
  'DB',
  '--remote',
  '--config',
  'deploy/cloudflare/game.json',
]);
run('./node_modules/.bin/wrangler', [
  'deploy',
  '--config',
  'dist/server/wrangler.json',
]);
run('./node_modules/.bin/wrangler', [
  'deploy',
  '--config',
  'deploy/cloudflare/rooms.json',
]);
run('./node_modules/.bin/wrangler', [
  'deploy',
  '--config',
  'deploy/cloudflare/payments.json',
]);
const r = await fetch('https://play.noobius.io/api/health');
if (!r.ok || (await r.json()).status !== 'ok')
  throw Error(
    'Post-deploy health check failed; inspect the current deployment before retrying',
  );
console.log(
  'Deployed game, room service and payment recovery; production health check passed.',
);
