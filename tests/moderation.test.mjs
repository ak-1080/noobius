import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { database } from './sqlite-d1.mjs';
import {
  moderatorAccounts,
  reportQueue,
  reviewReport,
} from '../lib/moderation-server.ts';
const moderator = '0x' + 'ab'.repeat(20),
  reporter = '0x' + 'cd'.repeat(20),
  author = '0x' + 'ef'.repeat(20);
const solana = 'solana:9xQeWvG816bUx9EP6dkSjjreDzUsN3FH6PzG5tCwGjWR';
const config = { NOOBIUS_MODERATOR_WALLETS: moderator + ',' + solana };
function fixture(t, count = 1) {
  const db = database();
  t.after(() => db.sqlite.close());
  db.sqlite.exec('PRAGMA foreign_keys=ON');
  for (const [i, wallet] of [moderator, reporter, author, solana].entries())
    db.sqlite
      .prepare(
        'INSERT INTO players(wallet,public_id,name,created_at) VALUES (?,?,?,?)',
      )
      .run(wallet, String(i + 1).repeat(32), 'Player ' + i, 1);
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID(),
      messageId = crypto.randomUUID();
    db.sqlite
      .prepare(
        'INSERT INTO crew_messages(id,wallet,message,created_at) VALUES (?,?,?,?)',
      )
      .run(messageId, author, 'Reported message ' + i, 10);
    db.sqlite
      .prepare(
        'INSERT INTO player_reports(id,wallet,target_wallet,message_id,message,reason,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        id,
        reporter,
        author,
        messageId,
        'Reported message ' + i,
        'Spam',
        10,
      );
    ids.push({ id, messageId });
  }
  return { db, ids };
}
test('moderator configuration is explicit, validates every entry and preserves Solana case', () => {
  assert.deepEqual([...moderatorAccounts({})], []);
  assert.equal(moderatorAccounts(config).size, 2);
  assert.ok(
    moderatorAccounts({
      NOOBIUS_MODERATOR_WALLETS: '0x' + 'AB'.repeat(20),
    }).has(moderator),
  );
  assert.ok(moderatorAccounts(config).has(solana));
  assert.ok(!moderatorAccounts(config).has(solana.toLowerCase()));
  for (const value of [
    '*',
    'admin',
    moderator + ',',
    moderator + ',wrong',
    true,
    moderator + ',solana:not-a-key',
  ])
    assert.equal(
      moderatorAccounts({ NOOBIUS_MODERATOR_WALLETS: value }).size,
      0,
    );
});
test('only current authorized sessions can inspect or decide reports', async (t) => {
  const {
    db,
    ids: [report],
  } = fixture(t);
  for (const [wallet, values, status] of [
    [null, config, 401],
    [reporter, config, 403],
    [moderator, {}, 403],
    [moderator, { NOOBIUS_MODERATOR_WALLETS: solana }, 403],
    [solana.toLowerCase(), config, 403],
  ]) {
    await assert.rejects(
      reportQueue(db, wallet, values, new URLSearchParams()),
      (err) => err.status === status,
    );
    await assert.rejects(
      reviewReport(db, wallet, values, {
        ...report,
        decision: 'removed',
        note: 'Spam confirmed',
      }),
      (err) => err.status === status,
    );
  }
  assert.equal(
    (await reportQueue(db, solana, config, new URLSearchParams())).reports
      .length,
    1,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) n FROM crew_messages').get().n,
    1,
  );
});
test('queue uses stable keyset pages with tied timestamps and returns no other account keys', async (t) => {
  const { db, ids } = fixture(t, 54);
  let cursor = '';
  const seen = [];
  do {
    const page = await reportQueue(
      db,
      moderator,
      config,
      new URLSearchParams({ cursor }),
    );
    assert.ok(page.reports.length <= 25);
    seen.push(...page.reports.map((r) => r.id));
    const json = JSON.stringify(page);
    for (const key of [moderator, author, reporter, solana])
      assert.ok(!json.includes(key));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(seen).size, 54);
  assert.deepEqual(
    seen,
    ids
      .map((r) => r.id)
      .sort()
      .reverse(),
  );
  for (const params of [
    { status: 'anything' },
    { cursor: '100:bad' },
    { cursor: '9999999999999999:' + ids[0].id },
  ])
    await assert.rejects(
      reportQueue(db, moderator, config, new URLSearchParams(params)),
      (err) => err.status === 400,
    );
});
test('dismissal preserves chat; removal deletes exactly one message and retains review evidence', async (t) => {
  const {
    db,
    ids: [a, b, c],
  } = fixture(t, 3);
  await reviewReport(
    db,
    moderator,
    config,
    { id: a.id, decision: 'dismissed', note: '  No violation found  ' },
    100,
  );
  await reviewReport(
    db,
    solana,
    config,
    { id: b.id, decision: 'removed', note: 'Repeated spam' },
    101,
  );
  assert.deepEqual(
    db.sqlite
      .prepare('SELECT id FROM crew_messages ORDER BY id')
      .all()
      .map((r) => r.id),
    [a.messageId, c.messageId].sort(),
  );
  const rows = db.sqlite
    .prepare(
      'SELECT id,status,reviewed_by,reviewed_at,review_note,message FROM player_reports WHERE status<>? ORDER BY reviewed_at',
    )
    .all('open');
  assert.equal(rows[0].reviewed_by, '1'.repeat(32));
  assert.equal(rows[0].review_note, 'No violation found');
  assert.equal(rows[1].reviewed_by, '4'.repeat(32));
  assert.equal(rows[1].reviewed_at, 101);
  assert.equal(rows[1].message, 'Reported message 1');
  await assert.rejects(
    reviewReport(db, moderator, config, {
      id: a.id,
      decision: 'removed',
      note: 'Changing a decided report',
    }),
    (err) => err.status === 409,
  );
  assert.ok(
    db.sqlite
      .prepare('SELECT id FROM crew_messages WHERE id=?')
      .get(a.messageId),
  );
  const removed = await reportQueue(
    db,
    moderator,
    config,
    new URLSearchParams({ status: 'removed' }),
  );
  assert.equal(removed.reports[0].id, b.id);
});
test('invalid decisions and notes cannot change reports', async (t) => {
  const {
    db,
    ids: [report],
  } = fixture(t);
  for (const input of [
    { decision: 'open', note: 'note' },
    { decision: ['removed'], note: 'note' },
    { decision: 'removed', note: ' ' },
    { decision: 'removed', note: 'a'.repeat(501) },
    { decision: 'removed', note: 'a\u0000b' },
  ])
    await assert.rejects(
      reviewReport(db, moderator, config, { id: report.id, ...input }),
      (err) => err.status === 400,
    );
  await assert.rejects(
    reviewReport(db, moderator, config, {
      id: crypto.randomUUID(),
      decision: 'removed',
      note: 'Not found',
    }),
    (err) => err.status === 409,
  );
  assert.equal(
    db.sqlite.prepare('SELECT status FROM player_reports').get().status,
    'open',
  );
});
test('concurrent decisions have one winner and deletion matches that decision', async (t) => {
  for (const first of ['dismissed', 'removed']) {
    const {
      db,
      ids: [report],
    } = fixture(t);
    const results = await Promise.allSettled(
      [first, first === 'removed' ? 'dismissed' : 'removed'].map((decision) =>
        reviewReport(db, moderator, config, {
          id: report.id,
          decision,
          note: 'Reviewed the message',
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const status = db.sqlite
      .prepare('SELECT status FROM player_reports')
      .get().status;
    assert.equal(status, first);
    assert.equal(
      db.sqlite.prepare('SELECT COUNT(*) n FROM crew_messages').get().n,
      first === 'removed' ? 0 : 1,
    );
  }
});
test('failed removal rolls back the decision and leaves its message available for retry', async (t) => {
  const {
    db,
    ids: [report],
  } = fixture(t);
  db.sqlite.exec(
    "CREATE TRIGGER removal_failure BEFORE DELETE ON crew_messages BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
  );
  const input = { id: report.id, decision: 'removed', note: 'Spam confirmed' };
  await assert.rejects(
    reviewReport(db, moderator, config, input),
    /injected failure/,
  );
  const row = db.sqlite
    .prepare(
      'SELECT status,reviewed_by,reviewed_at,review_note FROM player_reports',
    )
    .get();
  assert.deepEqual(
    { ...row },
    { status: 'open', reviewed_by: null, reviewed_at: null, review_note: null },
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) n FROM crew_messages').get().n,
    1,
  );
  db.sqlite.exec('DROP TRIGGER removal_failure');
  await reviewReport(db, moderator, config, input);
});
test('reviewing an expired chat message still preserves and decides the saved report', async (t) => {
  const {
    db,
    ids: [report],
  } = fixture(t);
  db.sqlite
    .prepare('DELETE FROM crew_messages WHERE id=?')
    .run(report.messageId);
  await reviewReport(db, moderator, config, {
    id: report.id,
    decision: 'removed',
    note: 'Spam confirmed from snapshot',
  });
  assert.equal(
    db.sqlite.prepare('SELECT status FROM player_reports').get().status,
    'removed',
  );
});
test('moderation migration preserves existing reports and account/escrow records', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const journal = JSON.parse(
    readFileSync(
      new URL('../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  );
  const sql = (entry) =>
    readFileSync(
      new URL('../drizzle/' + entry.tag + '.sql', import.meta.url),
      'utf8',
    );
  for (const entry of journal.entries.slice(0, 6)) db.exec(sql(entry));
  db.prepare(
    'INSERT INTO players(wallet,public_id,name,credits,created_at) VALUES (?,?,?,?,?)',
  ).run(moderator, '1'.repeat(32), 'Saved player', 781, 10);
  db.prepare(
    'INSERT INTO market_listings(id,wallet,item,quantity,price,created_at) VALUES (?,?,?,?,?,?)',
  ).run('saved-offer', moderator, 'scrap', 2, 10, 10);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
    'saved-session',
    moderator,
    99999999,
  );
  db.prepare(
    'INSERT INTO player_reports(id,wallet,target_wallet,message_id,message,reason,created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    crypto.randomUUID(),
    moderator,
    moderator,
    'old-message',
    'Preserved report',
    'Other',
    11,
  );
  const tables = ['players', 'sessions', 'market_listings', 'player_reports'];
  const before = Object.fromEntries(
    tables.map((table) => [table, db.prepare('SELECT * FROM ' + table).all()]),
  );
  db.exec(sql(journal.entries[6]));
  for (const table of tables) {
    const columns = Object.keys(before[table][0]);
    assert.deepEqual(
      db.prepare('SELECT ' + columns.join(',') + ' FROM ' + table).all(),
      before[table],
    );
  }
  assert.equal(
    db.prepare('SELECT reviewed_at FROM player_reports').get().reviewed_at,
    null,
  );
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
