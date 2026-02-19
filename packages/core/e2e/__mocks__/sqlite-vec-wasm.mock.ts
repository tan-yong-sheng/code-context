/**
 * Mock for @tan-yong-sheng/sqlite-vec-wasm-node
 * Used in Jest tests to avoid loading WASM module
 */

// In-memory storage for mock database
const mockDatabases = new Map<string, Map<string, any[]>>();

function getOrCreateTable(dbPath: string, tableName: string): any[] {
    if (!mockDatabases.has(dbPath)) {
        mockDatabases.set(dbPath, new Map());
    }
    const db = mockDatabases.get(dbPath)!;
    if (!db.has(tableName)) {
        db.set(tableName, []);
    }
    return db.get(tableName)!;
}

export class MockStatement {
    private sql: string;
    private db: MockDatabase;

    constructor(db: MockDatabase, sql: string) {
        this.db = db;
        this.sql = sql;
    }

    run(values?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
        // Simple mock implementation
        return { changes: 1, lastInsertRowid: this.db.lastRowid++ };
    }

    all(values?: unknown[]): Record<string, unknown>[] {
        return [];
    }

    get(values?: unknown[]): Record<string, unknown> | null {
        return null;
    }

    finalize(): void {}
}

export class MockDatabase {
    private closed = false;
    private tables = new Map<string, any[]>();
    lastRowid = 0;

    constructor(filename: string, options?: { fileMustExist?: boolean; readOnly?: boolean }) {}

    get isOpen(): boolean {
        return !this.closed;
    }

    get inTransaction(): boolean {
        return false;
    }

    exec(sql: string): void {}

    prepare(sql: string): MockStatement {
        return new MockStatement(this, sql);
    }

    run(sql: string, values?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
        return { changes: 1, lastInsertRowid: ++this.lastRowid };
    }

    all(sql: string, values?: unknown[]): Record<string, unknown>[] {
        return [];
    }

    get(sql: string, values?: unknown[]): Record<string, unknown> | null {
        return null;
    }

    function(name: string, func: (...args: unknown[]) => unknown, options?: { deterministic?: boolean }): this {
        return this;
    }

    transaction<T extends (...args: any[]) => any>(fn: T): T {
        const wrapped = (...args: any[]) => {
            try {
                const result = fn(...args);
                return result;
            } catch (err) {
                throw err;
            }
        };
        return wrapped as T;
    }

    close(): void {
        this.closed = true;
    }
}

export const Database = MockDatabase;
export { MockDatabase as SQLite3Error };
