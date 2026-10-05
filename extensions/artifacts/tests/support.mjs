import { DatabaseSync } from 'node:sqlite';

// Real SQLite exercises the application-owned migration and triggers behind
// the small D1 interface. Test identity is never part of the shipped Worker.
export class SqliteD1 {
  constructor(sql) { this.db = new DatabaseSync(':memory:'); this.db.exec(sql); }
  prepare(sql) {
    const db = this.db; let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    }; return statement;
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
