#!/usr/bin/env node
// Owns every writable path and process it creates. Never uses ordinary saves,
// deployed bindings, existing credentials, or a caller-provided test origin.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync, backup } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = [
  'api',
  'migration-reconciliation',
  'onboarding-api',
  'batch-api',
  'client-demand-api',
  'earning-policy-api',
  'signup-protection-api',
  'maintenance-api',
  'facility-api',
  'multiplayer-api',
  'realm-progression-api',
  'commissions-api',
  'room-auth-api',
  'room-coordinator-api',
  'moderation-api',
];
const args = process.argv.slice(2);
let serve = false;
let restoreDrill = false;
let rollbackRef = 'HEAD';
const selected = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--serve') serve = true;
  else if (args[i] === '--restore-drill') restoreDrill = true;
  else if (args[i] === '--rollback-ref' && args[i + 1]) rollbackRef = args[++i];
  else if (args[i] === '--suite' && suites.includes(args[i + 1]))
    selected.push(args[++i]);
  else if (args[i] === '--help') {
    console.log(
      'Usage: node scripts/release-api-tests.mjs [--serve | --restore-drill | --suite NAME ...]\nSuites: ' +
        suites.join(', '),
    );
    process.exit(0);
  } else throw new Error('Unknown release-test argument: ' + args[i]);
}
if (serve && selected.length) throw new Error('--serve does not run suites.');
if (restoreDrill && (serve || selected.length))
  throw new Error('Run restore drill alone.');
if (!restoreDrill && rollbackRef !== 'HEAD')
  throw new Error('--rollback-ref requires --restore-drill.');
// This suite requires enabled protection; ordinary login suites deliberately
// use an unconfigured local app. Run it separately rather than weaken checks.
if (selected.includes('signup-protection-api') && selected.length !== 1)
  throw new Error('Run signup-protection-api as a separate isolated suite.');
if (selected.includes('maintenance-api') && selected.length !== 1)
  throw new Error('Run maintenance-api as a separate isolated suite.');
if (!existsSync(path.join(repo, 'node_modules/.bin/vite')))
  throw new Error('Install the checked-in dependencies with npm ci first.');
if (typeof DatabaseSync.prototype.setAuthorizer !== 'function')
  throw new Error(
    'Isolated release API QA requires native SQLite setAuthorizer; use Node 24.14 or newer, as in CI. General game checks retain the package Node requirement.',
  );

const origin = 'http://127.0.0.1:3003';
const roomOrigin = 'http://127.0.0.1:3004';
const scratch = path.join(repo, '.wrangler/release-qa', randomUUID());
const processes = new Set();
const processGroups = new Map();
let rollbackSource;
const secret = randomBytes(32).toString('hex');
const report = {
  version: 1,
  startedAt: new Date().toISOString(),
  mode: serve ? 'serve' : restoreDrill ? 'restore-drill' : 'tests',
  origin,
  coordinatorOrigin: roomOrigin,
  scratch,
  suites: [],
  runtime: {
    node: process.version,
    ...Object.fromEntries(
      ['vite', 'vinext', 'wrangler', 'miniflare'].map((name) => [
        name,
        JSON.parse(
          readFileSync(
            path.join(repo, 'node_modules', name, 'package.json'),
            'utf8',
          ),
        ).version,
      ]),
    ),
  },
  isolation: {
    fixtureAdapter:
      'exact local Wrangler DB commands via native SQLite preload',
    toolConfigHome: 'runner-owned scratch via child-only Node preload',
    database: 'runner-owned scratch only',
    generatedCredentialsRemoved: false,
  },
};
let stopPromise;
let interrupted = false;
let cleanupFailed = false;
const redact = (value) =>
  String(value).replaceAll(secret, '[REDACTED generated room key]');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reportFile = path.join(scratch, 'report.json');
const runtimePreload = path.join(scratch, 'runtime-preload.mjs');
const writeReport = () =>
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');

async function assertPortFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', (error) => {
        if (
          host === '::1' &&
          ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)
        )
          resolve();
        else
          reject(
            new Error(
              `Release QA refuses occupied/unavailable ${host}:${port}: ${error.code}`,
            ),
          );
      });
      server.listen({ host, port, exclusive: true }, () =>
        server.close(resolve),
      );
    });
  }
}

// Keep application variables, NODE_OPTIONS and credential-bearing environment
// out of child processes. The generated local configs contain the entire setup.
const env = Object.fromEntries(
  [
    'PATH',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
  ]
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);
Object.assign(env, {
  CI: 'true',
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: path.join(scratch, '.wrangler/logs'),
  MINIFLARE_REGISTRY_PATH: path.join(scratch, '.wrangler/registry'),
  NO_UPDATE_NOTIFIER: '1',
  NOOBIUS_TEST_ORIGIN: origin,
  NOOBIUS_RELEASE_QA_ROOT: scratch,
  NOOBIUS_RELEASE_QA_SERVE: serve ? 'true' : 'false',
  NOOBIUS_RELEASE_QA_CONFIG_HOME: path.join(scratch, '.wrangler/tool-home'),
  NODE_OPTIONS:
    '--import=' + JSON.stringify(pathToFileURL(runtimePreload).href),
  NOOBIUS_TEST_LONG_ROOMS: '1',
  XDG_CONFIG_HOME: path.join(scratch, '.wrangler/user-config'),
  XDG_DATA_HOME: path.join(scratch, '.wrangler/user-data'),
  XDG_CACHE_HOME: path.join(scratch, '.wrangler/user-cache'),
  TMPDIR: path.join(scratch, '.wrangler/tmp'),
  TMP: path.join(scratch, '.wrangler/tmp'),
  TEMP: path.join(scratch, '.wrangler/tmp'),
});

function launch(name, executable, commandArgs, timeoutMs = 0, extraEnv = {}) {
  const log = path.join(scratch, name + '.log');
  const nodeArgs = [
    '--import',
    runtimePreload,
    ...(executable === process.execPath
      ? commandArgs
      : [executable, ...commandArgs]),
  ];
  const child = spawn(process.execPath, nodeArgs, {
    cwd: scratch,
    env: { ...env, ...extraEnv },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.add(child);
  if (child.pid) processGroups.set(child.pid, child);
  for (const stream of [child.stdout, child.stderr]) {
    // Buffer full lines so a key split between output chunks is still redacted.
    let pending = '';
    stream.on('data', (chunk) => {
      pending += String(chunk);
      const last = pending.lastIndexOf('\n');
      if (last >= 0) {
        appendFileSync(log, redact(pending.slice(0, last + 1)));
        pending = pending.slice(last + 1);
      }
    });
    stream.on('end', () => {
      if (pending) appendFileSync(log, redact(pending));
    });
  }
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      processes.delete(child);
      // Drop already-gone groups immediately instead of retaining stale PIDs
      // until the end of a long suite; surviving descendants remain registered.
      aliveGroups();
      resolve({ code, signal });
    });
  });
  const timeout = timeoutMs
    ? setTimeout(() => {
        appendFileSync(
          log,
          '\nRunner timeout; terminating owned test process.\n',
        );
        killGroup(child, 'SIGTERM');
        setTimeout(() => killGroup(child, 'SIGKILL'), 3000).unref();
      }, timeoutMs)
    : null;
  done
    .finally(() => {
      if (timeout) clearTimeout(timeout);
    })
    .catch(() => {});
  return { child, done, log };
}
function killGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    // Permission denial cannot establish that an owned group is gone.
    // Keep its ownership record for bounded retries until absence is confirmed.
    if (!['ESRCH', 'EPERM'].includes(error.code)) throw error;
  }
}
function aliveGroups() {
  for (const [pid] of processGroups) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') processGroups.delete(pid);
      else if (error.code !== 'EPERM') throw error;
    }
  }
  return processGroups.size;
}
function stop() {
  return (stopPromise ??= (async () => {
    // A leader can exit while workerd or another owned descendant remains.
    // Keep the group registered until the whole group has actually disappeared.
    try {
      aliveGroups();
      const owned = [...processGroups.values()];
      for (const child of owned) killGroup(child, 'SIGTERM');
      const until = Date.now() + 5000;
      while (aliveGroups() && Date.now() < until) await delay(50);
      for (const child of processGroups.values()) killGroup(child, 'SIGKILL');
      await delay(100);
      report.isolation.ownedProcessGroupsRemaining = aliveGroups();
      if (report.isolation.ownedProcessGroupsRemaining)
        throw new Error('An owned process group could not be stopped.');
    } catch (error) {
      cleanupFailed = true;
      report.status = 'failed';
      report.error = redact('Cleanup failed: ' + error.message);
    } finally {
      // Remove temporary credentials even when process cleanup cannot be proved.
      // This list never expands beyond files created by this runner.
      const files = [
        '.openai/wrangler.local.json',
        '.openai/room.local.json',
        '.wrangler/room-auth-qa.json',
        'browser-fixture.json',
        'browser-fixture.json.tmp',
        'restore-fixture.json',
      ];
      for (const file of files) {
        try {
          rmSync(path.join(scratch, file), { force: true });
        } catch (error) {
          cleanupFailed = true;
          report.status = 'failed';
          report.error = redact('Credential cleanup failed: ' + error.message);
        }
      }
      report.isolation.generatedCredentialsRemoved = files.every(
        (file) => !existsSync(path.join(scratch, file)),
      );
      report.finishedAt = new Date().toISOString();
      writeReport();
    }
  })());
}
const interrupt = () => {
  interrupted = true;
  if (existsSync(scratch)) void stop();
};
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

function databasePath() {
  const directory = path.join(
    scratch,
    '.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
  );
  const names = readdirSync(directory).filter((name) =>
    /^[a-f0-9]{64}\.sqlite$/.test(name),
  );
  if (names.length !== 1)
    throw new Error('Expected exactly one runner-owned local D1 file.');
  const file = realpathSync(path.join(directory, names[0]));
  if (!file.startsWith(realpathSync(scratch) + path.sep))
    throw new Error('D1 escaped runner scratch.');
  return file;
}
function resetFixtures(tables) {
  const db = new DatabaseSync(databasePath());
  try {
    db.exec(
      'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE',
    );
    for (const table of tables) db.exec(`DELETE FROM "${table}"`);
    db.exec('COMMIT; PRAGMA foreign_keys=ON');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}

function fixturePreload() {
  // ESM built-in synchronization lets the unmodified fixtures use this narrowly
  // scoped bridge. Unexpected Wrangler commands fail closed instead of spawning.
  return `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { DatabaseSync, constants } from 'node:sqlite';
import { realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root=${JSON.stringify(scratch)};
if(realpathSync(process.cwd())!==realpathSync(root)||process.env.NOOBIUS_TEST_ORIGIN!==${JSON.stringify(origin)}) throw Error('Fixture bridge requires runner scratch and loopback origin.');
const original=childProcess.execFileSync;
childProcess.execFileSync=function(file,args=[],options={}) {
  const npx=path.basename(String(file))==='npx';
  if(npx&&args[0]!=='wrangler') throw Error('Fixture bridge refuses unknown npx launcher.');
  const wrangler=path.basename(String(file))==='wrangler'||(npx&&args[0]==='wrangler');
  if(!wrangler) return original(file,args,options);
  const command=npx?args.slice(1):args;
  if(command[0]!=='d1'||command[1]!=='execute'||command[2]!=='DB') throw Error('Fixture bridge refuses non-D1 Wrangler command.');
  let local=false,config=null,persist=null,sql=null;
  for(let i=3;i<command.length;i++) {
    const flag=command[i];
    if(flag==='--local') local=true;
    else if(flag==='--json') {}
    else if(flag==='--config') {config=command[++i]; if(config!=='.openai/wrangler.local.json') throw Error('Fixture bridge refuses unknown config.');}
    else if(flag==='--persist-to') {persist=command[++i]; if(!['.wrangler/qa-dispatch','.wrangler/qa-moderation','.wrangler/state'].includes(persist)) throw Error('Fixture bridge refuses unknown persist path.');}
    else if(flag==='--command') sql=command[++i];
    else throw Error('Fixture bridge refuses unknown Wrangler option: '+flag);
  }
  if(!local||config!=='.openai/wrangler.local.json'||!['.wrangler/qa-dispatch','.wrangler/qa-moderation','.wrangler/state'].includes(persist)||typeof sql!=='string'||options.cwd&&realpathSync(options.cwd)!==realpathSync(root)) throw Error('Fixture bridge refuses non-isolated D1 invocation.');
  const directory=path.join(root,persist,'v3/d1/miniflare-D1DatabaseObject');
  const files=readdirSync(directory).filter(name=>/^[a-f0-9]{64}\\.sqlite$/.test(name));
  if(files.length!==1) throw Error('Fixture bridge needs one isolated D1 file.');
  const filePath=realpathSync(path.join(directory,files[0]));
  if(!filePath.startsWith(realpathSync(root)+path.sep)) throw Error('Fixture database escaped scratch.');
  const db=new DatabaseSync(filePath); let results=[];
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY');
    // A fenced main file alone does not prevent ATTACH or VACUUM INTO from
    // opening another database. Authorize only work inside that main database.
    db.setAuthorizer((code, _first, second) =>
      [constants.SQLITE_ATTACH, constants.SQLITE_DETACH, constants.SQLITE_PRAGMA].includes(code) ||
      code===constants.SQLITE_FUNCTION && ['load_extension','readfile','writefile'].includes(String(second).toLowerCase())
        ? constants.SQLITE_DENY : constants.SQLITE_OK);
    if(/^\\s*(SELECT|PRAGMA|WITH)\\b/i.test(sql)) results=db.prepare(sql).all(); else db.exec(sql);
    const output=JSON.stringify([{success:true,results,meta:{changes:db.prepare('SELECT changes() AS n').get().n}}]);
    return options.encoding?output:Buffer.from(output);
  } finally {db.close();}
};
syncBuiltinESMExports();
`;
}

async function waitReady(url, worker) {
  const until = Date.now() + 90000;
  while (!interrupted && Date.now() < until) {
    if (worker.child.exitCode !== null || worker.child.signalCode !== null)
      throw new Error(
        'Local worker stopped before ready; inspect ' + worker.log,
      );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.status < 500) return;
      if (
        selected.includes('maintenance-api') &&
        url === origin + '/api/noobius/profile' &&
        response.status === 503 &&
        (await response.json()).code === 'MAINTENANCE'
      )
        return;
    } catch {}
    await delay(250);
  }
  throw new Error('Local worker did not become ready; inspect ' + worker.log);
}

try {
  await assertPortFree(3003);
  await assertPortFree(3004);
  mkdirSync(path.join(scratch, '.openai'), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(scratch, '.wrangler'), { recursive: true, mode: 0o700 });
  mkdirSync(path.join(scratch, '.wrangler/tmp'), { mode: 0o700 });
  chmodSync(scratch, 0o700);
  mkdirSync(path.join(scratch, '.wrangler/tool-home/.wrangler'), {
    recursive: true,
  });
  writeFileSync(
    runtimePreload,
    `import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { realpathSync } from 'node:fs';
import path from 'node:path';
const root=${JSON.stringify(scratch)};
const home=process.env.NOOBIUS_RELEASE_QA_CONFIG_HOME;
if(process.env.NOOBIUS_RELEASE_QA_ROOT!==root||realpathSync(process.cwd())!==realpathSync(root)||home!==path.join(root,'.wrangler/tool-home')) throw Error('Runtime preload requires runner-owned scratch.');
// Wrangler prefers os.homedir()/.wrangler even when XDG_CONFIG_HOME is set.
// Override only this owned Node process and its inherited Node workers.
os.homedir=()=>home;
syncBuiltinESMExports();
`,
  );
  for (const entry of [
    'app',
    'components',
    'lib',
    'db',
    'hooks',
    'public',
    'node_modules',
    'tsconfig.json',
    'next.config.ts',
    'vite-env.d.ts',
  ])
    symlinkSync(path.join(repo, entry), path.join(scratch, entry));
  writeFileSync(
    path.join(scratch, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  symlinkSync('state', path.join(scratch, '.wrangler/qa-dispatch'));
  symlinkSync('state', path.join(scratch, '.wrangler/qa-moderation'));
  const roomAuth = {
    audience: origin,
    coordinatorOrigin: roomOrigin,
    activeKey: 'release-qa',
    keys: { 'release-qa': secret },
  };
  const vars = {
    NOOBIUS_SITE_ORIGIN: origin,
    NOOBIUS_ROOM_AUTH_ENABLED: 'true',
    NOOBIUS_ROOM_AUTH_CONFIG: JSON.stringify(roomAuth),
    LOCAL_ROOM_DEVELOPMENT: 'true',
    NOOBIUS_LOCAL_REALM_TEST: 'true',
    NOOBIUS_ENABLE_ITEM_MARKET: serve ? 'false' : 'true',
    NOOBIUS_MODERATOR_WALLETS: privateKeyToAccount(
      '0x' + '11'.repeat(32),
    ).address.toLowerCase(),
    ...(selected.includes('maintenance-api')
      ? { NOOBIUS_MAINTENANCE: 'true' }
      : {}),
    ...(selected.includes('signup-protection-api')
      ? {
          NOOBIUS_SIGNUP_PROTECTION: 'turnstile',
          NOOBIUS_TURNSTILE_SITE_KEY: '0xQaPublicKey123456',
          NOOBIUS_TURNSTILE_SECRET_KEY: '0xQaPrivateKey123456',
        }
      : {}),
  };
  const gameConfig = {
    name: 'noobius-release-qa',
    main: 'vinext/server/fetch-handler',
    compatibility_date: '2026-05-15',
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'noobius-release-qa',
        database_id: '00000000-0000-4000-8000-000000000000',
      },
    ],
    vars,
    dev: { port: 3003, ip: '127.0.0.1' },
  };
  const roomConfig = {
    name: 'noobius-release-room-qa',
    main: path.join(repo, 'services/room-coordinator/worker.ts'),
    compatibility_date: '2026-05-15',
    compatibility_flags: ['nodejs_compat'],
    vars,
    durable_objects: {
      bindings: [{ name: 'ROOMS', class_name: 'NeighborhoodRoom' }],
    },
    migrations: [{ tag: 'rooms-v1', new_sqlite_classes: ['NeighborhoodRoom'] }],
    dev: { port: 3004, ip: '127.0.0.1' },
  };
  for (const [file, data] of [
    ['.openai/wrangler.local.json', gameConfig],
    ['.openai/room.local.json', roomConfig],
    ['.wrangler/room-auth-qa.json', roomAuth],
  ])
    writeFileSync(path.join(scratch, file), JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  const migrationDir = path.join(scratch, 'drizzle');
  mkdirSync(migrationDir);
  const journal = JSON.parse(
    readFileSync(path.join(repo, 'drizzle/meta/_journal.json'), 'utf8'),
  );
  const tables = new Set();
  let migrationSql = '';
  for (const entry of journal.entries) {
    if (!/^[a-zA-Z0-9_]+$/.test(entry.tag))
      throw new Error('Invalid canonical migration tag.');
    const file = entry.tag + '.sql';
    copyFileSync(
      path.join(repo, 'drizzle', file),
      path.join(migrationDir, file),
    );
    const sql = readFileSync(path.join(migrationDir, file), 'utf8');
    migrationSql += sql + '\n';
    for (const match of sql.matchAll(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ))
      tables.add(match[1]);
  }
  // The consolidated local schema install also records Wrangler's migration
  // metadata. Keep this outside resetFixtures: health must see the same
  // completed migration history as a normally migrated hosted database.
  migrationSql += `CREATE TABLE IF NOT EXISTS d1_migrations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );\n`;
  for (const entry of journal.entries)
    migrationSql += `INSERT INTO d1_migrations(name) VALUES ('${entry.tag}.sql');\n`;
  writeFileSync(path.join(migrationDir, 'release-schema.sql'), migrationSql);
  report.migrations = journal.entries.map((entry) => entry.tag);
  writeReport();
  const migration = launch(
    'migrations',
    path.join(repo, 'node_modules/.bin/wrangler'),
    [
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      '.openai/wrangler.local.json',
      '--persist-to',
      '.wrangler/state',
      '--file',
      'drizzle/release-schema.sql',
    ],
    90000,
  );
  if ((await migration.done).code !== 0)
    throw new Error('Canonical migrations failed; inspect ' + migration.log);
  const fixture = path.join(scratch, 'fixture-preload.mjs');
  writeFileSync(fixture, fixturePreload());
  let game = launch('game', path.join(repo, 'node_modules/.bin/vite'), [
    '--config',
    path.join(repo, 'scripts/release-vite.config.mjs'),
  ]);
  await waitReady(origin + '/api/noobius/profile', game);
  let room = launch('room', path.join(repo, 'node_modules/.bin/wrangler'), [
    'dev',
    '--local',
    '--config',
    '.openai/room.local.json',
    '--persist-to',
    '.wrangler/room-state',
    '--port',
    '3004',
    '--ip',
    '127.0.0.1',
    '--inspector-port',
    '0',
  ]);
  await waitReady(roomOrigin + '/', room);
  resetFixtures(tables);
  if (restoreDrill) {
    const file = databasePath(),
      snapshot = path.join(scratch, 'recovery-snapshot.sqlite');
    report.recovery = {
      steps: [],
      rollbackRevision: execFileSync(
        'git',
        ['rev-parse', '--verify', rollbackRef + '^{commit}'],
        {
          cwd: repo,
          encoding: 'utf8',
        },
      ).trim(),
      chainBoundary: 'controlled finalized receipt; no broadcasting',
    };
    const phase = async (name) => {
      const worker = launch(
        'restore-' + name,
        process.execPath,
        [path.join(repo, 'tests/recovery-cutover.mjs'), name],
        60000,
        { NOOBIUS_RESTORE_DATABASE_PATH: file },
      );
      if ((await worker.done).code !== 0)
        throw Error(
          'Restore drill failed at ' + name + '; inspect ' + worker.log,
        );
      report.recovery.steps.push(name);
      writeReport();
    };
    const halt = async (worker) => {
      killGroup(worker.child, 'SIGTERM');
      const until = Date.now() + 5000;
      while (processGroups.has(worker.child.pid) && Date.now() < until) {
        aliveGroups();
        await delay(50);
      }
      if (processGroups.has(worker.child.pid)) {
        killGroup(worker.child, 'SIGKILL');
        await delay(100);
        aliveGroups();
      }
      if (processGroups.has(worker.child.pid))
        throw Error('Owned worker did not stop; restore refused.');
    };
    const startGame = async (name) => {
      game = launch(name, path.join(repo, 'node_modules/.bin/vite'), [
        '--config',
        path.join(repo, 'scripts/release-vite.config.mjs'),
      ]);
      await waitReady(origin + '/api/noobius/profile', game);
    };
    await phase('seed');
    const db = new DatabaseSync(file);
    try {
      await backup(db, snapshot);
    } finally {
      db.close();
    }
    chmodSync(snapshot, 0o600);
    await halt(room);
    await halt(game);
    // Damage and replace only this runner's disposable stopped database. The
    // real restore procedure must first pause/drain writes and reconcile chain
    // receipts newer than the snapshot; a database rollback is not a refund.
    const damaged = new DatabaseSync(file);
    damaged.exec('UPDATE players SET credits=0,facility_state=NULL;');
    damaged.close();
    for (const suffix of ['-wal', '-shm'])
      rmSync(file + suffix, { force: true });
    copyFileSync(snapshot, file);
    await startGame('game-restored');
    await phase('restored');
    await phase('reconcile');
    await phase('settled');
    await halt(game);
    // Cloudflare correctly denies serving .wrangler contents. Keep source-only
    // archive outside that private directory; never weaken its deny rules.
    const previous = mkdtempSync(path.join(tmpdir(), 'noobius-rollback-'));
    rollbackSource = previous;
    chmodSync(previous, 0o700);
    symlinkSync(
      path.join(repo, 'node_modules'),
      path.join(previous, 'node_modules'),
    );
    const sourceEntries = [
      'app',
      'components',
      'lib',
      'db',
      'hooks',
      'tsconfig.json',
      'next.config.ts',
      'vite-env.d.ts',
    ];
    const archive = execFileSync(
      'git',
      ['archive', report.recovery.rollbackRevision, ...sourceEntries],
      { cwd: repo, maxBuffer: 32 * 1024 * 1024 },
    );
    execFileSync('tar', ['-x', '-C', previous], { input: archive });
    for (const entry of sourceEntries) {
      rmSync(path.join(scratch, entry));
      symlinkSync(path.join(previous, entry), path.join(scratch, entry));
    }
    await startGame('game-compatible-rollback');
    await phase('settled');
    await phase('rollback-write');
    await halt(game);
    for (const entry of sourceEntries) {
      rmSync(path.join(scratch, entry), { recursive: true });
      symlinkSync(path.join(repo, entry), path.join(scratch, entry));
    }
    await startGame('game-forward-recovery');
    await phase('settled');
    report.status = 'passed';
    writeReport();
    console.log('Restore/cutover/compatible rollback/forward recovery: passed');
  } else if (serve) {
    console.log('Game: ' + origin + '\nScratch: ' + scratch);
    while (!interrupted) {
      if (game.child.exitCode !== null || room.child.exitCode !== null)
        throw new Error('An owned local worker stopped.');
      await delay(250);
    }
    report.status = 'stopped';
  } else {
    console.log('Isolated release API QA: ' + scratch);
    for (const suite of selected.length
      ? selected
      : suites.filter(
          (name) =>
            !['signup-protection-api', 'maintenance-api'].includes(name),
        )) {
      if (interrupted) break;
      resetFixtures(tables);
      const started = Date.now();
      const test = launch(
        suite,
        process.execPath,
        [
          '--import',
          fixture,
          '--test',
          '--test-concurrency=1',
          path.join(repo, 'tests', suite + '.test.mjs'),
        ],
        suite === 'room-coordinator-api' ? 360000 : 300000,
      );
      const outcome = await test.done;
      const record = {
        suite,
        status: outcome.code === 0 ? 'passed' : 'failed',
        exitCode: outcome.code,
        signal: outcome.signal,
        durationMs: Date.now() - started,
        log: path.basename(test.log),
      };
      report.suites.push(record);
      writeReport();
      console.log(
        suite +
          ': ' +
          record.status +
          ' (' +
          Math.round(record.durationMs / 1000) +
          's)',
      );
    }
    report.status = interrupted
      ? 'interrupted'
      : report.suites.every((suite) => suite.status === 'passed')
        ? 'passed'
        : 'failed';
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
} catch (error) {
  if (existsSync(scratch)) {
    report.status = 'failed';
    report.error = redact(error.message);
  }
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  if (existsSync(scratch)) {
    await stop();
    if (cleanupFailed) {
      report.status = 'failed';
      process.exitCode = 1;
      writeReport();
    }
    console.log('Release QA report: ' + reportFile);
  }
  if (rollbackSource) rmSync(rollbackSource, { recursive: true, force: true });
}
