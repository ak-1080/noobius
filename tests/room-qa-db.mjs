// Generated test accounts only. Never seed the ordinary player database.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const qaOrigin = process.env.NOOBIUS_TEST_ORIGIN;
if (qaOrigin !== 'http://127.0.0.1:3003')
  throw new Error('Room QA requires the isolated economy on port3003.');

export const sqlQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
export function withQaDb(operation) {
  const directory = '.wrangler/qa-dispatch/v3/d1/miniflare-D1DatabaseObject';
  const files = readdirSync(directory).filter((name) =>
    /^[a-f0-9]{64}\.sqlite$/.test(name),
  );
  assert.equal(files.length, 1, 'Choose one isolated QA D1 file');
  const db = new DatabaseSync(directory + '/' + files[0]);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    return operation(db);
  } finally {
    db.close();
  }
}
export const qaSql = (command) => withQaDb((db) => db.exec(command));
