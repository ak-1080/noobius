import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { newFacility } from '../lib/facility.ts';
import {
  ensurePublicId,
  joinNeighborhood,
  requireMembership,
} from '../lib/neighborhoods-server.ts';

// These are in-memory SQL regression tests, not evidence of a hosted backup,
// restore, or the deployment runner's transaction/migration bookkeeping.
const journal = JSON.parse(
  readFileSync(
    new URL('../drizzle/meta/_journal.json', import.meta.url),
    'utf8',
  ),
).entries;
const migration = (tag, directory = 'drizzle') =>
  readFileSync(new URL(`../${directory}/${tag}.sql`, import.meta.url), 'utf8');
const upgrade = () => migration('0005_tired_jocasta');
const evm = '0x1234567890abcdef1234567890abcdef12345678';
const solana = 'solana:9xQeWvG816bUx9EP6dkSjjreDzUsN3FH6PzG5tCwGjWR';
const legacy = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const publicIds = ['a'.repeat(32), 'b'.repeat(32)];
const legacyTables = [
  'players',
  'challenges',
  'sessions',
  'shifts',
  'rate_limits',
  'market_listings',
  'crew_messages',
  'crew_presence',
  'campus_rewards',
  'campus_work',
];

function database(t, entries = journal) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  assert.equal(sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  for (const entry of entries) sqlite.exec(migration(entry.tag));
  return sqlite;
}

// Run the real membership SQL against the same upgraded database. Keep batch
// transactions atomic, including a rollback if any later statement fails.
function d1(sqlite) {
  class Prepared {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Prepared(this.sql, args);
    }
    execute() {
      const query = sqlite.prepare(this.sql);
      const results = query.columns().length
        ? query.all(...this.args)
        : (query.run(...this.args), []);
      return {
        success: true,
        results,
        meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n },
      };
    }
    async first() {
      return this.execute().results[0] ?? null;
    }
    async all() {
      return this.execute();
    }
    async run() {
      return this.execute();
    }
  }
  return {
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function seedDeployed(sqlite) {
  for (const [index, wallet] of [evm, solana, legacy].entries()) {
    const facility = {
      ...newFacility(1000),
      version: 17 + index,
      compute: 7381 + index,
      storedCompute: 93 + index,
      inventory: { scrap: 14, wire: 9 },
      bank: { scrap: 87, chip: 5 },
      builds: { rack: 3 },
      craft: { id: 'saved-job', item: 'chip', readyAt: 100000 },
      outfit: 'classic',
      claims: ['already-paid'],
      skills: { salvaging: 425, engineering: 285, operations: 171 },
    };
    sqlite
      .prepare(`INSERT INTO players
      (wallet,name,credits,xp,shifts,best_score,scanner,visor,tracer,created_at,
       facility_state,facility_version,public_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        wallet,
        `Saved player ${index}`,
        812 + index,
        379 + index,
        12,
        908,
        2,
        1,
        3,
        500,
        JSON.stringify(facility),
        facility.version,
        publicIds[index] ?? null,
      );
    sqlite
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(`session-${index}`, wallet, 9000000);
    sqlite
      .prepare('INSERT INTO challenges VALUES (?,?,?,?)')
      .run(
        `challenge-${index}`,
        wallet,
        `Saved challenge for ${wallet}`,
        9000000,
      );
    sqlite
      .prepare('INSERT INTO shifts VALUES (?,?,?,?,?,?,?)')
      .run(
        `shift-${index}`,
        wallet,
        '{"score":142,"tasks":["repair"]}',
        8,
        `mutation-${index}`,
        501,
        index === 0 ? null : 800,
      );
    sqlite
      .prepare(
        'INSERT INTO crew_presence(wallet,x,z,updated_at,room) VALUES (?,?,?,?,?)',
      )
      .run(
        wallet,
        13 + index,
        -8 - index,
        890,
        index === 1 ? `home-${publicIds[1]}` : 'campus-1',
      );
    sqlite
      .prepare('INSERT INTO crew_messages VALUES (?,?,?,?)')
      .run(`message-${index}`, wallet, 'Saved crew message', 810);
    sqlite
      .prepare('INSERT INTO campus_rewards VALUES (?,?,?)')
      .run(`reward-${index}`, wallet, 830);
    sqlite
      .prepare('INSERT INTO campus_work VALUES (?,?,?,?,?,?,?)')
      .run(`work-${index}`, 'campus-1', 42, 'power', wallet, 820, 825);
  }
  sqlite
    .prepare('INSERT INTO rate_limits VALUES (?,?,?)')
    .run('saved-limit', 4, 200000);
  // Existing escrow is the listing row; migration must neither refund it nor
  // deduct the already-escrowed inventory again.
  sqlite
    .prepare('INSERT INTO market_listings VALUES (?,?,?,?,?,?,?,?)')
    .run('open-escrow', solana, 'scrap', 6, 150, 'open', null, 850);
  sqlite
    .prepare('INSERT INTO market_listings VALUES (?,?,?,?,?,?,?,?)')
    .run('sold-escrow', evm, 'wire', 2, 45, 'sold', solana, 860);
}

function snapshot(sqlite) {
  return Object.fromEntries(
    legacyTables.map((table) => {
      const columns = sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => r.name);
      return [
        table,
        {
          columns,
          rows: sqlite
            .prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY 1`)
            .all(),
        },
      ];
    }),
  );
}

function assertPreserved(sqlite, before) {
  for (const [table, { columns, rows }] of Object.entries(before)) {
    assert.deepEqual(
      sqlite
        .prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY 1`)
        .all(),
      rows,
      `Migration must preserve every deployed ${table} value`,
    );
  }
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
}

test('the canonical journal installs a fresh database in deployed migration order', (t) => {
  assert.deepEqual(
    journal.map((entry) => entry.tag),
    [
      '0000_spicy_the_watchers',
      '0001_calm_mister_fear',
      '0002_fancy_master_mold',
      '0003_confused_wolfsbane',
      '0004_odd_blackheart',
      '0005_tired_jocasta',
      '0006_handy_polaris',
      '0007_nappy_red_wolf',
      '0008_foamy_sersi',
      '0009_bouncy_lilith',
    ],
  );
  assert.ok(
    journal.every(
      (entry, i) => entry.idx === i && (!i || entry.when > journal[i - 1].when),
    ),
  );
  const sqlite = database(t);
  for (const table of [
    'players',
    'neighborhoods',
    'cluster_projects',
    'cluster_contributions',
    'cluster_claims',
    'realm_entitlements',
    'social_preferences',
    'recent_neighbors',
    'player_reports',
    'room_tickets',
    'room_grants',
    'room_service_nonces',
  ]) {
    assert.ok(
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table),
    );
  }
  const presenceColumns = sqlite
    .prepare('PRAGMA table_info(crew_presence)')
    .all();
  for (const column of [
    'neighborhood_id',
    'slot',
    'client_id',
    'generation',
    'sequence',
    'lease_until',
  ])
    assert.ok(
      presenceColumns.some((entry) => entry.name === column),
      column,
    );
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('upgrading populated deployed 0000–0004 preserves both chain identities and all saved state', (t) => {
  const sqlite = database(t, journal.slice(0, 5));
  seedDeployed(sqlite);
  const before = snapshot(sqlite);
  sqlite.exec(upgrade());
  assertPreserved(sqlite, before);
  assert.equal(
    sqlite.prepare('SELECT wallet FROM players WHERE wallet=?').get(solana)
      .wallet,
    solana,
  );
  assert.equal(
    sqlite
      .prepare('SELECT wallet FROM players WHERE wallet=?')
      .get(solana.toLowerCase()),
    undefined,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        'SELECT public_id FROM players WHERE wallet IN (?,?) ORDER BY wallet',
      )
      .all(evm, solana)
      .map((r) => r.public_id),
    publicIds,
  );
  for (const row of sqlite.prepare('SELECT * FROM crew_presence').all()) {
    assert.equal(row.neighborhood_id, null);
    assert.equal(row.slot, null);
    assert.equal(row.client_id, null);
    assert.equal(row.generation, 0);
    assert.equal(row.sequence, 0);
    assert.equal(row.lease_until, 0);
  }
  assert.ok(
    sqlite
      .prepare('SELECT recipient_wallet FROM market_listings')
      .all()
      .every((r) => r.recipient_wallet === null),
  );
  assert.ok(
    sqlite
      .prepare('SELECT neighborhood_id FROM crew_messages')
      .all()
      .every((r) => r.neighborhood_id === null),
  );
});

test('migrated accounts reconnect into five valid slots without changing their centers or identities', async (t) => {
  const sqlite = database(t, journal.slice(0, 5));
  seedDeployed(sqlite);
  sqlite.exec(upgrade());
  const db = d1(sqlite);
  const saved = sqlite
    .prepare('SELECT * FROM players WHERE wallet IN (?,?) ORDER BY wallet')
    .all(evm, solana);
  assert.equal(await ensurePublicId(db, evm), publicIds[0]);
  assert.equal(await ensurePublicId(db, solana), publicIds[1]);
  const assigned = await ensurePublicId(db, legacy);
  assert.match(assigned, /^[a-f0-9]{32}$/);
  assert.equal(await ensurePublicId(db, legacy), assigned);
  const wallets = [evm, solana, legacy];
  for (let i = 0; i < 3; i++) {
    const wallet = `0x${String(i + 1).padStart(40, '0')}`;
    sqlite
      .prepare('INSERT INTO players(wallet,name,created_at) VALUES (?,?,?)')
      .run(wallet, `New player ${i}`, 1000);
    wallets.push(wallet);
  }
  const joined = [];
  for (const wallet of wallets.slice(0, 5)) {
    const clientId = crypto.randomUUID();
    const membership = await joinNeighborhood(
      db,
      wallet,
      'commons',
      0,
      clientId,
      joined.length ? { target: joined[0].neighborhoodId } : {},
      1000,
    );
    const current = await requireMembership(
      db,
      wallet,
      { clientId, generation: membership.generation },
      1000,
    );
    assert.equal(current.wallet, wallet);
    assert.equal(current.room, 'commons');
    assert.ok(current.lease_until > 1000);
    joined.push(membership);
  }
  assert.deepEqual(joined.map((m) => m.slot).sort(), [0, 1, 2, 3, 4]);
  assert.equal(new Set(joined.map((m) => m.neighborhoodId)).size, 1);
  await assert.rejects(
    joinNeighborhood(
      db,
      wallets[5],
      'commons',
      0,
      crypto.randomUUID(),
      { target: joined[0].neighborhoodId },
      1000,
    ),
    /full or unavailable/,
  );
  assert.deepEqual(
    sqlite
      .prepare('SELECT * FROM players WHERE wallet IN (?,?) ORDER BY wallet')
      .all(evm, solana),
    saved,
  );
  // The database enforces these even if an application admission check regresses.
  const update = sqlite.prepare(
    'UPDATE crew_presence SET slot=? WHERE wallet=?',
  );
  for (const invalid of [-1, 5])
    assert.throws(() => update.run(invalid, evm), /CHECK constraint failed/);
  assert.throws(
    () => update.run(joined[1].slot, evm),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () =>
      sqlite
        .prepare('UPDATE crew_presence SET neighborhood_id=? WHERE wallet=?')
        .run('missing-neighborhood', evm),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      sqlite
        .prepare('UPDATE crew_presence SET wallet=? WHERE wallet=?')
        .run('missing-player', evm),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      sqlite
        .prepare('UPDATE market_listings SET recipient_wallet=? WHERE id=?')
        .run('missing-player', 'open-escrow'),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      sqlite
        .prepare('UPDATE players SET public_id=? WHERE wallet=?')
        .run(publicIds[1], evm),
    /UNIQUE constraint failed/,
  );
  const credits = sqlite
    .prepare('SELECT credits FROM players WHERE wallet=?')
    .get(evm).credits;
  await assert.rejects(
    db.batch([
      db
        .prepare('UPDATE players SET credits=credits-100 WHERE wallet=?')
        .bind(evm),
      db
        .prepare('UPDATE crew_presence SET slot=? WHERE wallet=?')
        .bind(joined[1].slot, evm),
    ]),
    /UNIQUE constraint failed/,
  );
  assert.equal(
    sqlite.prepare('SELECT credits FROM players WHERE wallet=?').get(evm)
      .credits,
    credits,
  );
  assert.equal(
    sqlite.prepare('SELECT slot FROM crew_presence WHERE wallet=?').get(evm)
      .slot,
    joined[0].slot,
  );
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('a failed local upgrade transaction restores the pre-upgrade schema and populated state', (t) => {
  const sqlite = database(t, journal.slice(0, 5));
  seedDeployed(sqlite);
  const before = snapshot(sqlite);
  sqlite.exec('BEGIN');
  try {
    sqlite.exec(upgrade());
    sqlite.prepare('UPDATE players SET credits=0 WHERE wallet=?').run(evm);
    assert.throws(
      () =>
        sqlite
          .prepare('UPDATE crew_presence SET slot=5 WHERE wallet=?')
          .run(evm),
      /CHECK constraint failed/,
    );
  } finally {
    sqlite.exec('ROLLBACK');
  }
  assertPreserved(sqlite, before);
  assert.equal(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE name='neighborhoods'")
      .get(),
    undefined,
  );
  assert.ok(
    !sqlite
      .prepare('PRAGMA table_info(crew_presence)')
      .all()
      .some((r) => r.name === 'slot'),
  );
  sqlite.exec(upgrade());
  assertPreserved(sqlite, before);
});

function schemaSemantics(sqlite) {
  return sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      columns: sqlite
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map(({ cid, ...column }) => ({
          ...column,
          type: column.type.toLowerCase(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      foreignKeys: sqlite
        .prepare(`PRAGMA foreign_key_list(${name})`)
        .all()
        .map(({ id, seq, ...foreignKey }) => foreignKey)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      indexes: sqlite
        .prepare(`PRAGMA index_list(${name})`)
        .all()
        .map((index) => {
          const sql =
            sqlite
              .prepare('SELECT sql FROM sqlite_master WHERE name=?')
              .get(index.name)?.sql ?? '';
          return {
            name: index.name,
            unique: index.unique,
            origin: index.origin,
            partial: index.partial,
            columns: sqlite
              .prepare(`PRAGMA index_info(${index.name})`)
              .all()
              .map((r) => r.name),
            predicate: (sql.match(/\bWHERE\s+([\s\S]*)/i)?.[1] ?? '')
              .replace(/["`]/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase(),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

test('reconciliation retains the archived upgrade schema and index/FK semantics', (t) => {
  const canonical = database(t, journal.slice(0, 6));
  const experimental = database(t, journal.slice(0, 4));
  const directory = 'docs/migration-history/pre-reconciliation-4385554';
  for (const tag of [
    '0004_typical_puck',
    '0005_careful_reavers',
    '0006_daffy_changeling',
    '0007_oval_malcolm_colcord',
    '0008_jazzy_marten_broadcloak',
    '0009_sharp_malice',
  ])
    experimental.exec(migration(tag, directory));
  assert.deepEqual(schemaSemantics(canonical), schemaSemantics(experimental));
});

test('dispatch migration preserves populated project terms and makes no retrospective benefit grants', (t) => {
  const sqlite = database(
    t,
    journal.filter((e) => e.idx < 7),
  );
  sqlite
    .prepare(
      "INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES ('migration-room','gpu',0,1)",
    )
    .run();
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  sqlite
    .prepare(
      "INSERT INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,version,created_at) VALUES (?,'migration-room','gpu-launch','open',1,'{\"workload\":2}','{\"workload\":1}',1,1000)",
    )
    .run(id);
  const before = sqlite
    .prepare('SELECT * FROM cluster_projects WHERE id=?')
    .get(id);
  sqlite.exec(migration('0007_nappy_red_wolf'));
  const { benefit_json, ...after } = sqlite
    .prepare('SELECT * FROM cluster_projects WHERE id=?')
    .get(id);
  assert.equal(benefit_json, null);
  assert.deepEqual({ ...before }, after);
});

test('room authentication migration adds empty credentials without touching saved players or economy', (t) => {
  const sqlite = database(t, journal.slice(0, 5));
  seedDeployed(sqlite);
  for (const entry of journal.slice(5, 9)) sqlite.exec(migration(entry.tag));
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
  const before = Object.fromEntries(
    tables.map((name) => [
      name,
      sqlite.prepare(`SELECT * FROM ${name} ORDER BY 1`).all(),
    ]),
  );
  sqlite.exec(migration('0009_bouncy_lilith'));
  for (const name of tables)
    assert.deepEqual(
      sqlite.prepare(`SELECT * FROM ${name} ORDER BY 1`).all(),
      before[name],
      name,
    );
  for (const name of ['room_tickets', 'room_grants', 'room_service_nonces'])
    assert.equal(
      sqlite.prepare(`SELECT count(*) AS n FROM ${name}`).get().n,
      0,
    );
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});
