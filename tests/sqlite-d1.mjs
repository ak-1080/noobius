import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of [
    '0000_spicy_the_watchers',
    '0001_calm_mister_fear',
    '0002_fancy_master_mold',
    '0003_confused_wolfsbane',
    '0004_typical_puck',
    '0005_careful_reavers',
    '0006_daffy_changeling',
  ])
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'),
    );
  class Prepared {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Prepared(this.sql, args);
    }
    execute() {
      const q = sqlite.prepare(this.sql);
      const results = q.columns().length
        ? q.all(...this.args)
        : (q.run(...this.args), []);
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
    sqlite,
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((q) => q.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
