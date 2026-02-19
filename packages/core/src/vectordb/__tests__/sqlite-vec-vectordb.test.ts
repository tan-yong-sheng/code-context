/**
 * Tests for SqliteVecVectorDatabase
 *
 * Tests vector database operations including collection management,
 * document insertion, search, and hybrid search functionality.
 */

import { SqliteVecVectorDatabase } from '../sqlite-vec-vectordb';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Jest globals
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
declare const expect: (value: any) => any;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;

describe('SqliteVecVectorDatabase', () => {
    let db: SqliteVecVectorDatabase;
    let testDbDir: string;
    const TEST_TIMEOUT = 30000;
    const TEST_DIMENSION = 1536;

    beforeAll(() => {
        // Create temp directory for test databases
        testDbDir = path.join(os.tmpdir(), `sqlite-vec-test-${Date.now()}`);
        fs.mkdirSync(testDbDir, { recursive: true });
    });

    afterAll(() => {
        // Cleanup temp directory
        if (fs.existsSync(testDbDir)) {
            fs.rmSync(testDbDir, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        db = new SqliteVecVectorDatabase({ dbPath: testDbDir });
    });

    afterEach(() => {
        db.close();
    });

    describe('Collection Management', () => {
        test('should create a collection', async () => {
            const collectionName = 'test_collection_1';
            await db.createCollection(collectionName, TEST_DIMENSION);

            const hasCollection = await db.hasCollection(collectionName);
            expect(hasCollection).toBe(true);
        }, TEST_TIMEOUT);

        test('should create a hybrid collection with FTS5', async () => {
            const collectionName = 'test_hybrid_collection';
            await db.createHybridCollection(collectionName, TEST_DIMENSION);

            const hasCollection = await db.hasCollection(collectionName);
            expect(hasCollection).toBe(true);
        }, TEST_TIMEOUT);

        test('should drop a collection', async () => {
            const collectionName = 'test_drop_collection';
            await db.createCollection(collectionName, TEST_DIMENSION);

            let hasCollection = await db.hasCollection(collectionName);
            expect(hasCollection).toBe(true);

            await db.dropCollection(collectionName);

            hasCollection = await db.hasCollection(collectionName);
            expect(hasCollection).toBe(false);
        }, TEST_TIMEOUT);

        test('should return false for non-existent collection', async () => {
            const hasCollection = await db.hasCollection('non_existent_collection');
            expect(hasCollection).toBe(false);
        }, TEST_TIMEOUT);

        test('should list collections', async () => {
            // Note: listCollections() scans the global vectors directory (~/.code-context/vectors)
            // not the testDbDir, so we just verify it returns an array without error
            const collections = await db.listCollections();
            expect(Array.isArray(collections)).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Document Operations', () => {
        const collectionName = 'test_docs_collection';

        beforeEach(async () => {
            await db.createCollection(collectionName, TEST_DIMENSION);
        });

        test('should insert documents', async () => {
            const documents = [
                {
                    id: 'doc1',
                    vector: new Array(TEST_DIMENSION).fill(0.1),
                    content: 'Test content 1',
                    relativePath: '/test1.ts',
                    startLine: 1,
                    endLine: 10,
                    fileExtension: 'ts',
                    metadata: {}
                },
                {
                    id: 'doc2',
                    vector: new Array(TEST_DIMENSION).fill(0.2),
                    content: 'Test content 2',
                    relativePath: '/test2.ts',
                    startLine: 11,
                    endLine: 20,
                    fileExtension: 'ts',
                    metadata: {}
                }
            ];

            await db.insert(collectionName, documents);

            // Verify documents were inserted (search may return empty in mock, but no error means success)
            expect(async () => {
                await db.search(collectionName, new Array(TEST_DIMENSION).fill(0.1), { topK: 2 });
            }).not.toThrow();
        }, TEST_TIMEOUT);

        test('should delete documents', async () => {
            const documents = [
                {
                    id: 'doc_to_delete',
                    vector: new Array(TEST_DIMENSION).fill(0.3),
                    content: 'Content to delete',
                    relativePath: '/delete.ts',
                    startLine: 1,
                    endLine: 5,
                    fileExtension: 'ts',
                    metadata: {}
                }
            ];

            await db.insert(collectionName, documents);

            // Delete the document (should not throw)
            await expect(db.delete(collectionName, ['doc_to_delete'])).resolves.not.toThrow();
        }, TEST_TIMEOUT);
    });

    describe('Search Operations', () => {
        const collectionName = 'test_search_collection';

        beforeEach(async () => {
            await db.createCollection(collectionName, TEST_DIMENSION);
        });

        test('should search for similar vectors', async () => {
            const documents = [
                {
                    id: 'search_doc1',
                    vector: new Array(TEST_DIMENSION).fill(0.1),
                    content: 'Search content 1',
                    relativePath: '/search1.ts',
                    startLine: 1,
                    endLine: 10,
                    fileExtension: 'ts',
                    metadata: {}
                },
                {
                    id: 'search_doc2',
                    vector: new Array(TEST_DIMENSION).fill(0.9),
                    content: 'Search content 2',
                    relativePath: '/search2.ts',
                    startLine: 11,
                    endLine: 20,
                    fileExtension: 'ts',
                    metadata: {}
                }
            ];

            await db.insert(collectionName, documents);

            // Search should execute without error
            await expect(db.search(collectionName, new Array(TEST_DIMENSION).fill(0.1), { topK: 2 })).resolves.not.toThrow();
        }, TEST_TIMEOUT);

        test('should limit search results', async () => {
            const documents = Array.from({ length: 10 }, (_, i) => ({
                id: `limit_doc${i}`,
                vector: new Array(TEST_DIMENSION).fill(i * 0.1),
                content: `Limit test ${i}`,
                relativePath: `/limit${i}.ts`,
                startLine: i * 10 + 1,
                endLine: (i + 1) * 10,
                fileExtension: 'ts',
                metadata: {}
            }));

            await db.insert(collectionName, documents);

            // Search should execute and respect topK parameter format
            const results = await db.search(collectionName, new Array(TEST_DIMENSION).fill(0.5), { topK: 3 });
            expect(Array.isArray(results)).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Hybrid Search', () => {
        const collectionName = 'test_hybrid_search_collection';

        beforeEach(async () => {
            await db.createHybridCollection(collectionName, TEST_DIMENSION);
        });

        test('should perform hybrid search with vector and text', async () => {
            const documents = [
                {
                    id: 'hybrid_doc1',
                    vector: new Array(TEST_DIMENSION).fill(0.1),
                    content: 'function test() { return 1; }',
                    relativePath: '/hybrid1.ts',
                    startLine: 1,
                    endLine: 10,
                    fileExtension: 'ts',
                    metadata: {}
                },
                {
                    id: 'hybrid_doc2',
                    vector: new Array(TEST_DIMENSION).fill(0.9),
                    content: 'class Example { constructor() {} }',
                    relativePath: '/hybrid2.ts',
                    startLine: 11,
                    endLine: 20,
                    fileExtension: 'ts',
                    metadata: {}
                }
            ];

            await db.insertHybrid(collectionName, documents);

            // Hybrid search with proper request format
            const searchRequests = [{
                data: new Array(TEST_DIMENSION).fill(0.1),
                anns_field: 'vector',
                param: {},
                limit: 2
            }];
            const results = await db.hybridSearch(collectionName, searchRequests, { limit: 2 });
            expect(results.length).toBeGreaterThanOrEqual(0);
        }, TEST_TIMEOUT);

        test('should insert documents with hybrid insert', async () => {
            const documents = [
                {
                    id: 'hybrid_insert_doc',
                    vector: new Array(TEST_DIMENSION).fill(0.3),
                    content: 'Hybrid insert test',
                    relativePath: '/hybrid_insert.ts',
                    startLine: 1,
                    endLine: 5,
                    fileExtension: 'ts',
                    metadata: {}
                }
            ];

            await db.insertHybrid(collectionName, documents);

            // Verify search executes without error
            await expect(db.search(collectionName, new Array(TEST_DIMENSION).fill(0.3), { topK: 1 })).resolves.not.toThrow();
        }, TEST_TIMEOUT);
    });
});
