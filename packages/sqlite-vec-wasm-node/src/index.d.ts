/**
 * SQLite WASM with sqlite-vec for Node.js
 *
 * @packageDocumentation
 */

/**
 * SQLite error class
 */
export class SQLite3Error extends Error {
  name: 'SQLite3Error';
}

/**
 * Prepared statement
 */
export class Statement {
  /** The database this statement belongs to */
  readonly database: Database;

  /** Whether this statement has been finalized */
  readonly isFinalized: boolean;

  /**
   * Execute the statement and return metadata
   * @param values - Parameter values to bind
   */
  run(values?: unknown[] | Record<string, unknown>): { changes: number; lastInsertRowid: number | bigint };

  /**
   * Execute the statement and return all rows
   * @param values - Parameter values to bind
   */
  all<T = Record<string, unknown>>(values?: unknown[] | Record<string, unknown>): T[];

  /**
   * Execute the statement and return the first row
   * @param values - Parameter values to bind
   */
  get<T = Record<string, unknown>>(values?: unknown[] | Record<string, unknown>): T | null;

  /**
   * Execute the statement and return an iterator of rows
   * @param values - Parameter values to bind
   */
  iterate<T = Record<string, unknown>>(values?: unknown[] | Record<string, unknown>): IterableIterator<T>;

  /**
   * Finalize the statement and free resources
   */
  finalize(): void;
}

/**
 * Database connection options
 */
export interface DatabaseOptions {
  /** Throw error if database file doesn't exist */
  fileMustExist?: boolean;
  /** Open database in read-only mode */
  readOnly?: boolean;
}

/**
 * SQLite database connection
 *
 * Important: You must call close() when done to avoid memory leaks.
 */
export class Database {
  /** Whether the database is currently open */
  readonly isOpen: boolean;

  /** Whether a transaction is currently active */
  readonly inTransaction: boolean;

  /**
   * Create a new database connection
   * @param filename - Path to the database file (':memory:' for in-memory)
   * @param options - Connection options
   */
  constructor(filename: string, options?: DatabaseOptions);

  /**
   * Execute SQL statements
   * @param sql - SQL statements to execute
   */
  exec(sql: string): void;

  /**
   * Create a prepared statement
   * @param sql - SQL statement
   */
  prepare(sql: string): Statement;

  /**
   * Execute a statement and return metadata
   * @param sql - SQL statement
   * @param values - Parameter values to bind
   */
  run(sql: string, values?: unknown[] | Record<string, unknown>): { changes: number; lastInsertRowid: number | bigint };

  /**
   * Execute a query and return all rows
   * @param sql - SQL query
   * @param values - Parameter values to bind
   */
  all<T = Record<string, unknown>>(sql: string, values?: unknown[] | Record<string, unknown>): T[];

  /**
   * Execute a query and return the first row
   * @param sql - SQL query
   * @param values - Parameter values to bind
   */
  get<T = Record<string, unknown>>(sql: string, values?: unknown[] | Record<string, unknown>): T | null;

  /**
   * Register a custom SQL function
   * @param name - Function name
   * @param func - Function implementation
   * @param options - Function options
   */
  function(name: string, func: (...args: unknown[]) => unknown, options?: { deterministic?: boolean }): this;

  /**
   * Create a transaction function that wraps the given function in a transaction.
   * The transaction is automatically committed if the function completes successfully,
   * or rolled back if an error is thrown.
   *
   * @param fn - The function to wrap in a transaction
   * @returns A wrapped function that executes within a transaction
   *
   * @example
   * const insertMany = db.transaction((items) => {
   *   for (const item of items) {
   *     db.run('INSERT INTO table (col) VALUES (?)', [item]);
   *   }
   * });
   * insertMany([1, 2, 3]); // All inserts happen in a single transaction
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T;

  /**
   * Close the database connection
   *
   * Important: You must call this to avoid memory leaks.
   */
  close(): void;
}
