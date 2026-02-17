/**
 * sqlite-vec Vector Database Implementation
 *
 * SQLite-based vector database using sqlite-vec extension.
 * Stores 1 codebase = 1 SQLite file in ~/.code-context/vectors/
 *
 * Features:
 * - Dense vector storage with vec0 virtual tables
 * - Cosine similarity search
 * - Metadata filtering via SQL WHERE clauses
 * - Hybrid search with FTS5 text search + RRF merging
 */

import * as sqliteVec from 'sqlite-vec';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import {
    VectorDatabase,
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult
} from './types';

export interface SqliteVecConfig {
    /** Optional custom database path. If not provided, uses default ~/.code-context/vectors/ */
    dbPath?: string;
}

/**
 * Get the storage directory for vector databases
 */
function getVectorDbDir(): string {
    return process.env.VECTOR_DB_PATH || path.join(os.homedir(), '.code-context', 'vectors');
}

/**
 * Get database path from a collection name or codebase path.
 * For hashed collection names like 'hybrid_code_chunks_66d4e57c', extracts the hash and uses it directly.
 * For regular paths, computes the hash of the path.
 */
function getDbPathFromCollection(collectionName: string): string {
    const vectorDbDir = getVectorDbDir();

    // Ensure directory exists
    if (!fs.existsSync(vectorDbDir)) {
        fs.mkdirSync(vectorDbDir, { recursive: true });
    }

    // Check if collectionName looks like a hashed collection name (e.g., 'hybrid_code_chunks_66d4e57c' or 'code_chunks_66d4e57c')
    const hashMatch = collectionName.match(/^(?:hybrid_)?code_chunks_([a-f0-9]{8})$/);
    if (hashMatch) {
        // Use the hash directly as the filename
        const hash = hashMatch[1];
        return path.join(vectorDbDir, `${hash}.db`);
    }

    // For regular paths (temp directories, etc.), hash the entire collection name
    const hash = crypto.createHash('md5').update(collectionName).digest('hex').substring(0, 16);
    return path.join(vectorDbDir, `${hash}.db`);
}

/**
 * sqlite-vec Vector Database Implementation
 */
export class SqliteVecVectorDatabase implements VectorDatabase {
    private db: Database.Database | null = null;
    private currentCodebasePath: string | null = null;
    private dimension: number = 0;

    constructor(private config: SqliteVecConfig = {}) {}

    /**
     * Initialize database connection for a codebase
     */
    private initializeDb(codebasePath: string): Database.Database {
        if (this.db && this.currentCodebasePath === codebasePath) {
            return this.db;
        }

        // Close existing connection if switching codebases
        if (this.db) {
            this.db.close();
        }

        const dbPath = this.config.dbPath || getDbPathFromCollection(codebasePath);

        // Ensure parent directory exists
        const db = new Database(dbPath);
        db.exec('PRAGMA journal_mode=WAL;');
        sqliteVec.load(db);

        this.db = db;
        this.currentCodebasePath = codebasePath;

        return db;
    }

    /**
     * Get table name for a collection
     * In sqlite-vec, we use a single table per database
     */
    private getTableName(_collectionName: string): string {
        return 'documents';
    }

    /**
     * Convert Milvus-style filterExpr to SQL WHERE clause
     * Supports: field IN [val1, val2], field = value, AND, OR
     */
    private convertFilterExpr(filterExpr: string): string {
        // Replace Milvus IN syntax: field IN ["val1", "val2"] -> field IN ('val1', 'val2')
        let sql = filterExpr.replace(
            /(\w+)\s+in\s+\[([^\]]+)\]/gi,
            (match, field, values) => {
                const valueList = values
                    .split(',')
                    .map((v: string) => v.trim().replace(/"/g, "'"))
                    .join(', ');
                return `${field} IN (${valueList})`;
            }
        );

        // Replace = for string comparisons (Milvus uses = for both)
        // SQLite TEXT fields work fine with =

        return sql;
    }

    async createCollection(collectionName: string, dimension: number, _description?: string): Promise<void> {
        const db = this.initializeDb(collectionName);
        this.dimension = dimension;

        const tableName = this.getTableName(collectionName);

        // Drop existing table if present
        db.exec(`DROP TABLE IF EXISTS ${tableName}`);

        // Create vec0 virtual table for vector storage
        // Note: Using TEXT for startLine/endLine to avoid sqlite-vec's strict integer type checking
        db.exec(`
            CREATE VIRTUAL TABLE ${tableName} USING vec0(
                id TEXT PRIMARY KEY,
                vector float[${dimension}],
                content TEXT,
                relativePath TEXT,
                startLine TEXT,
                endLine TEXT,
                fileExtension TEXT,
                metadata TEXT
            )
        `);

        console.log(`[SqliteVecDB] Created collection '${collectionName}' with dimension ${dimension}`);
    }

    async createHybridCollection(collectionName: string, dimension: number, _description?: string): Promise<void> {
        const db = this.initializeDb(collectionName);
        this.dimension = dimension;

        const tableName = this.getTableName(collectionName);

        // Drop existing tables
        db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        db.exec(`DROP TABLE IF EXISTS ${tableName}_fts`);

        // Create vec0 virtual table for vectors
        // Note: Using TEXT for startLine/endLine to avoid sqlite-vec's strict type checking
        db.exec(`
            CREATE VIRTUAL TABLE ${tableName} USING vec0(
                id TEXT PRIMARY KEY,
                vector float[${dimension}],
                content TEXT,
                relativePath TEXT,
                startLine TEXT,
                endLine TEXT,
                fileExtension TEXT,
                metadata TEXT
            )
        `);

        // Create FTS5 table for text search
        // Note: vec0 is a virtual table, so we can't use triggers. We manually sync instead.
        db.exec(`
            CREATE VIRTUAL TABLE ${tableName}_fts USING fts5(
                id UNINDEXED,
                content,
                relativePath,
                fileExtension
            )
        `);

        console.log(`[SqliteVecDB] Created hybrid collection '${collectionName}' with FTS5`);
    }

    async dropCollection(collectionName: string): Promise<void> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        db.exec(`DROP TABLE IF EXISTS ${tableName}_fts`);

        console.log(`[SqliteVecDB] Dropped collection '${collectionName}'`);
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        try {
            const db = this.initializeDb(collectionName);
            const tableName = this.getTableName(collectionName);

            const result = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
            ).get(tableName);

            return !!result;
        } catch {
            return false;
        }
    }

    async listCollections(): Promise<string[]> {
        // List all .db files in the vectors directory
        const { listAllVectorDbs } = await import('../utils/vector-paths');
        const dbs = listAllVectorDbs();

        // Return collection names in the format expected by sync logic
        // Each db file represents a codebase, return as hybrid_code_chunks_<hash>
        return dbs.map(db => `hybrid_code_chunks_${db.hash}`).filter(Boolean) as string[];
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        // For vec0 virtual table, we need to delete first then insert (REPLACE doesn't work well)
        const deleteStmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);
        const insertStmt = db.prepare(`
            INSERT INTO ${tableName} (id, vector, content, relativePath, startLine, endLine, fileExtension, metadata)
            VALUES (?, vec_f32(?), ?, ?, ?, ?, ?, ?)
        `);

        // Use individual operations instead of transaction for vec0 compatibility
        for (const doc of documents) {
            try {
                // Delete existing document first (REPLACE doesn't work well with vec0)
                deleteStmt.run(doc.id);
                // Then insert the new document
                // Note: startLine and endLine are TEXT type to avoid sqlite-vec's strict type checking
                insertStmt.run(
                    doc.id,
                    JSON.stringify(doc.vector),
                    doc.content,
                    doc.relativePath,
                    String(doc.startLine),
                    String(doc.endLine),
                    doc.fileExtension,
                    JSON.stringify(doc.metadata)
                );
            } catch (error: any) {
                console.error(`[SqliteVecDB] Failed to insert document ${doc.id}:`, error?.message || error);
                throw error;
            }
        }

        console.log(`[SqliteVecDB] Inserted ${documents.length} documents into '${collectionName}'`);
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        // First insert into the main table
        await this.insert(collectionName, documents);

        // Then manually insert into FTS5 (triggers don't work on virtual tables)
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        const insertFtsStmt = db.prepare(`
            INSERT OR REPLACE INTO ${tableName}_fts (id, content, relativePath, fileExtension)
            VALUES (?, ?, ?, ?)
        `);

        try {
            const insertFtsMany = db.transaction((docs: VectorDocument[]) => {
                for (const doc of docs) {
                    insertFtsStmt.run(
                        doc.id,
                        doc.content,
                        doc.relativePath,
                        doc.fileExtension
                    );
                }
            });

            insertFtsMany(documents);
            console.log(`[SqliteVecDB] Inserted ${documents.length} documents into FTS5 for '${collectionName}'`);
        } catch (error: any) {
            console.error(`[SqliteVecDB] Failed to insert into FTS5 for '${collectionName}':`, error?.message || error);
            // Don't throw - FTS5 is optional for hybrid search
        }
    }

    async search(
        collectionName: string,
        queryVector: number[],
        options?: SearchOptions
    ): Promise<VectorSearchResult[]> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        const topK = options?.topK || 10;

        // Debug: Check document count
        const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as any;
        console.log(`[SqliteVecDB] Search in '${collectionName}': ${countResult.count} documents, topK=${topK}`);

        let sql = `
            SELECT
                id, content, relativePath, startLine, endLine, fileExtension, metadata,
                vec_distance_cosine(vector, vec_f32(?)) AS score
            FROM ${tableName}
        `;

        const params: any[] = [JSON.stringify(queryVector)];

        // Apply filter if provided
        if (options?.filterExpr) {
            sql += ` WHERE ${this.convertFilterExpr(options.filterExpr)}`;
        }

        sql += ` ORDER BY score LIMIT ?`;
        params.push(topK);

        const rows = db.prepare(sql).all(...params) as any[];
        console.log(`[SqliteVecDB] Search returned ${rows.length} results`);

        return rows.map(row => ({
            document: {
                id: row.id,
                vector: queryVector, // Return query vector (not stored in results)
                content: row.content,
                relativePath: row.relativePath,
                startLine: row.startLine,
                endLine: row.endLine,
                fileExtension: row.fileExtension,
                metadata: JSON.parse(row.metadata || '{}')
            },
            score: row.score
        }));
    }

    async hybridSearch(
        collectionName: string,
        searchRequests: HybridSearchRequest[],
        options?: HybridSearchOptions
    ): Promise<HybridSearchResult[]> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        // Extract requests
        const vectorRequest = searchRequests.find(r => r.anns_field === 'vector');
        const textRequest = searchRequests.find(r => r.anns_field === 'sparse_vector');

        if (!vectorRequest) {
            throw new Error('Hybrid search requires a vector request');
        }

        const limit = options?.limit || vectorRequest.limit || 10;
        const queryVector = vectorRequest.data as number[];
        const queryText = textRequest?.data as string || '';

        // 1. Vector search results
        const vectorResults = await this.search(collectionName, queryVector, {
            topK: 50,
            filterExpr: options?.filterExpr
        });

        // 2. Text search results (if FTS5 available and text query provided)
        let textResults: Array<{ id: string; score: number }> = [];

        if (queryText && textRequest) {
            try {
                const ftsSql = `
                    SELECT id, rank AS score
                    FROM ${tableName}_fts
                    WHERE ${tableName}_fts MATCH ?
                    ORDER BY rank
                    LIMIT 50
                `;
                textResults = db.prepare(ftsSql).all(queryText) as any[];
            } catch (error) {
                // FTS5 might not be available or table doesn't exist
                console.warn('[SqliteVecDB] FTS5 search failed, using vector-only:', error);
            }
        }

        // 3. RRF (Reciprocal Rank Fusion)
        const k = 60;
        const scores = new Map<string, number>();

        // Add vector scores
        vectorResults.forEach((result, index) => {
            const current = scores.get(result.document.id) || 0;
            scores.set(result.document.id, current + 1.0 / (k + index + 1));
        });

        // Add text scores
        textResults.forEach((result, index) => {
            const current = scores.get(result.id) || 0;
            scores.set(result.id, current + 1.0 / (k + index + 1));
        });

        // 4. Get full documents for top results
        const sortedIds = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => id);

        if (sortedIds.length === 0) {
            return [];
        }

        // Fetch full documents
        const placeholders = sortedIds.map(() => '?').join(',');
        const docSql = `
            SELECT id, content, relativePath, startLine, endLine, fileExtension, metadata
            FROM ${tableName}
            WHERE id IN (${placeholders})
        `;
        const docs = db.prepare(docSql).all(...sortedIds) as any[];

        // Create document map for ordering
        const docMap = new Map(docs.map(d => [d.id, d]));

        return sortedIds.map(id => {
            const doc = docMap.get(id);
            return {
                document: {
                    id: doc.id,
                    vector: [],
                    content: doc.content,
                    relativePath: doc.relativePath,
                    startLine: doc.startLine,
                    endLine: doc.endLine,
                    fileExtension: doc.fileExtension,
                    metadata: JSON.parse(doc.metadata || '{}')
                },
                score: scores.get(id) || 0
            };
        });
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        const placeholders = ids.map(() => '?').join(',');

        // Delete from FTS5 first (if table exists)
        try {
            const ftsSql = `DELETE FROM ${tableName}_fts WHERE id IN (${placeholders})`;
            db.prepare(ftsSql).run(...ids);
        } catch {
            // FTS5 table might not exist, ignore
        }

        // Delete from main table
        const sql = `DELETE FROM ${tableName} WHERE id IN (${placeholders})`;
        db.prepare(sql).run(...ids);

        console.log(`[SqliteVecDB] Deleted ${ids.length} documents from '${collectionName}'`);
    }

    async query(
        collectionName: string,
        filter: string,
        outputFields: string[],
        limit?: number
    ): Promise<Record<string, any>[]> {
        const db = this.initializeDb(collectionName);
        const tableName = this.getTableName(collectionName);

        const fields = outputFields.join(', ');
        let sql = `SELECT ${fields} FROM ${tableName}`;

        if (filter && filter.trim()) {
            sql += ` WHERE ${this.convertFilterExpr(filter)}`;
        }

        if (limit) {
            sql += ` LIMIT ${limit}`;
        }

        return db.prepare(sql).all() as Record<string, any>[];
    }

    async checkCollectionLimit(): Promise<boolean> {
        // SQLite has no practical collection limit
        // Each codebase gets its own file
        return true;
    }

    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.currentCodebasePath = null;
        }
    }
}
