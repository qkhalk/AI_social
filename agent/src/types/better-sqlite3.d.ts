/**
 * Type declarations for better-sqlite3
 *
 * Minimal declarations covering the API surface used in secrets-store.ts.
 */
declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    pragma(pragma: string): unknown;
    exec(sql: string): Database;
    prepare(sql: string): Statement;
    close(): void;
  }

  export = Database;
}
