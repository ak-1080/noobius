import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deployProduction } from '../scripts/deploy-cloudflare.mjs';
import { assertEmptyPaymentDrain } from '../scripts/check-payment-drain.mjs';

function fixture() {
  const paths = [
    'deploy/cloudflare/game.json',
    'deploy/cloudflare/rooms.json',
    'deploy/cloudflare/payments.json',
  ];
  const config = Object.fromEntries(
    paths.map((path) => [
      path,
      JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8')),
    ]),
  );
  config['dist/server/wrangler.json'] = structuredClone(config[paths[0]]);
  const events = [];
  return {
    config,
    events,
    dependencies: {
      read(path) {
        return structuredClone(config[path]);
      },
      execute: (command, args) => {
        events.push([command, ...args]);
      },
      paymentDrain(path, label) {
        events.push(['payment-drain', path, label]);
        return assertEmptyPaymentDrain(
          '[{"success":true,"results":[{"count":0}]}]',
          label,
        );
      },
      async fetchHealth(url) {
        events.push(['health', url]);
        return Response.json({ status: 'ok' });
      },
      report() {},
    },
  };
}

function productionWrites(events) {
  return events.filter(
    ([command]) => command === './node_modules/.bin/wrangler',
  );
}

void test('production migration and every deployment follow validated targets, built binding and current ledger proof', async () => {
  const f = fixture();
  await deployProduction(f.dependencies);
  assert.deepEqual(
    f.events.map(([command, operation, subcommand]) => [
      command,
      operation,
      subcommand,
    ]),
    [
      ['npm', 'test', undefined],
      ['npm', 'run', 'typecheck'],
      ['npm', 'run', 'test:release-api'],
      ['npm', 'run', 'build:cloudflare'],
      ['payment-drain', 'deploy/cloudflare/game.json', 'Production'],
      ['./node_modules/.bin/wrangler', 'd1', 'migrations'],
      ['./node_modules/.bin/wrangler', 'deploy', '--config'],
      ['./node_modules/.bin/wrangler', 'deploy', '--config'],
      ['./node_modules/.bin/wrangler', 'deploy', '--config'],
      ['health', 'https://play.noobius.io/api/health', undefined],
    ],
  );
  assert.deepEqual(productionWrites(f.events)[0], [
    './node_modules/.bin/wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--remote',
    '--config',
    'deploy/cloudflare/game.json',
  ]);
});

void test('missing or mismatched production targets fail before build, migration or deploy', async () => {
  const gamePath = 'deploy/cloudflare/game.json';
  const roomPath = 'deploy/cloudflare/rooms.json';
  const recoveryPath = 'deploy/cloudflare/payments.json';
  for (const change of [
    (c) => {
      delete c[gamePath];
    },
    (c) => {
      delete c[roomPath];
    },
    (c) => {
      delete c[recoveryPath];
    },
    (c) => {
      c[gamePath].d1_databases = [];
    },
    (c) => {
      c[gamePath].d1_databases[0].binding = 'OTHER';
    },
    (c) => {
      c[gamePath].d1_databases[0].database_id = c[
        recoveryPath
      ].d1_databases[0].database_id = 'wrong-database';
    },
    (c) => {
      c[gamePath].account_id =
        c[roomPath].account_id =
        c[recoveryPath].account_id =
          'wrong-account';
    },
    ...[gamePath, roomPath, recoveryPath].flatMap((target) => [
      (c) => {
        c[target].routes = [{ pattern: 'noobius.io', custom_domain: true }];
      },
      (c) => {
        c[target].route = 'noobius.io/*';
      },
      (c) => {
        c[target].routes = [];
      },
    ]),
    (c) => {
      c[gamePath].vars.NOOBIUS_SOLANA_NETWORK = 'devnet';
    },
    (c) => {
      delete c[gamePath].vars.NOOBIUS_PAYMENTS_ENABLED;
    },
    (c) => {
      c[gamePath].vars.NOOBIUS_PAYMENTS_ENABLED = 'true';
    },
    (c) => {
      c[gamePath].vars.NOOBIUS_MAX_PLAYERS = '100';
    },
    (c) => {
      delete c[gamePath].vars.NOOBIUS_MAX_PLAYERS;
    },
    (c) => {
      c[gamePath].workers_dev = true;
    },
    (c) => {
      c[gamePath].vars.NOOBIUS_SITE_ORIGIN = 'https://staging.example';
    },
    (c) => {
      c[gamePath].d1_databases[0].migrations_dir =
        '../../docs/migration-history';
    },
    (c) => {
      c[roomPath].services[0].service = 'noobius-game-staging';
    },
    (c) => {
      c[roomPath].services[0].binding = 'OTHER';
    },
    (c) => {
      c[roomPath].services[0].environment = 'staging';
    },
    (c) => {
      c[roomPath].durable_objects.bindings[0].script_name =
        'noobius-rooms-staging';
    },
    (c) => {
      c[roomPath].services.push({
        binding: 'OTHER',
        service: 'noobius-game-staging',
      });
    },
    (c) => {
      c[roomPath].durable_objects.bindings[0].class_name = 'WrongRoom';
    },
    (c) => {
      c[recoveryPath].d1_databases[0].database_id = 'wrong-database';
    },
    (c) => {
      c[recoveryPath].vars.NOOBIUS_PAYMENTS_ENABLED = 'true';
    },
  ]) {
    const f = fixture();
    change(f.config);
    await assert.rejects(
      deployProduction(f.dependencies),
      /Unexpected production/,
    );
    assert.deepEqual(f.events, []);
  }
});

void test('missing or unsafe built configuration cannot reach current-ledger checks or production writes', async () => {
  const builtPath = 'dist/server/wrangler.json';
  for (const change of [
    (c) => {
      delete c[builtPath];
    },
    (c) => {
      c[builtPath].routes = [{ pattern: 'noobius.io', custom_domain: true }];
    },
    (c) => {
      c[builtPath].route = 'noobius.io/*';
    },
    (c) => {
      c[builtPath].d1_databases[0].database_id = 'wrong-database';
    },
    (c) => {
      c[builtPath].d1_databases[0].binding = 'OTHER';
    },
    (c) => {
      delete c[builtPath].vars.NOOBIUS_PAYMENTS_ENABLED;
    },
    (c) => {
      c[builtPath].vars.NOOBIUS_PAYMENTS_ENABLED = 'true';
    },
    (c) => {
      c[builtPath].vars.NOOBIUS_SOLANA_NETWORK = 'devnet';
    },
    (c) => {
      c[builtPath].vars.NOOBIUS_MAX_PLAYERS = '100';
    },
  ]) {
    const f = fixture();
    change(f.config);
    await assert.rejects(deployProduction(f.dependencies), /Built game/);
    assert.equal(f.events.length, 4);
    assert.deepEqual(productionWrites(f.events), []);
  }
});

void test('current source configuration is rechecked after building, before remote mutation', async () => {
  const f = fixture();
  const execute = f.dependencies.execute;
  f.dependencies.execute = (command, args) => {
    execute(command, args);
    if (args.includes('build:cloudflare'))
      f.config['deploy/cloudflare/game.json'].vars.NOOBIUS_MAX_PLAYERS = '40';
  };
  await assert.rejects(deployProduction(f.dependencies), /Built game/);
  assert.deepEqual(productionWrites(f.events), []);
});

void test('absent, malformed or unsettled payment proof blocks every migration and deployment', async () => {
  for (const proof of [undefined, null, false, 0, 'true']) {
    const f = fixture();
    f.dependencies.paymentDrain = () => proof;
    await assert.rejects(
      deployProduction(f.dependencies),
      /payment drain was not verified/,
    );
    assert.deepEqual(productionWrites(f.events), []);
  }
  for (const reply of [
    '',
    '{}',
    '[{"success":false,"results":[{"count":0}]}]',
    '[{"success":true,"results":[{"count":"0"}]}]',
    '[{"success":true,"results":[{"count":2}]}]',
  ]) {
    const f = fixture();
    f.dependencies.paymentDrain = () =>
      assertEmptyPaymentDrain(reply, 'Production');
    await assert.rejects(
      deployProduction(f.dependencies),
      /refusing to deploy|unsettled payment/,
    );
    assert.deepEqual(productionWrites(f.events), []);
  }
  const f = fixture();
  f.dependencies.paymentDrain = () => {
    throw Error('Current payment table unavailable.');
  };
  await assert.rejects(
    deployProduction(f.dependencies),
    /payment table unavailable/,
  );
  assert.deepEqual(productionWrites(f.events), []);
});

void test('unsafe configuration errors disclose no configuration values', async () => {
  const f = fixture();
  const privateValue = 'private-endpoint-credential';
  f.config['deploy/cloudflare/game.json'].vars.NOOBIUS_SITE_ORIGIN =
    privateValue;
  await assert.rejects(
    deployProduction(f.dependencies),
    (error) => !error.message.includes(privateValue),
  );
  assert.deepEqual(productionWrites(f.events), []);
});

void test('a failed required check or migration prevents subsequent production deployments', async () => {
  for (const stage of ['test:release-api', 'build:cloudflare', 'migrations']) {
    const f = fixture();
    const execute = f.dependencies.execute;
    f.dependencies.execute = (command, args) => {
      execute(command, args);
      if (args.includes(stage)) throw Error('Required step failed.');
    };
    await assert.rejects(
      deployProduction(f.dependencies),
      /Required step failed/,
    );
    assert.equal(
      productionWrites(f.events).some((event) => event.includes('deploy')),
      false,
    );
    assert.equal(
      f.events.some(([event]) => event === 'health'),
      false,
    );
  }
});
