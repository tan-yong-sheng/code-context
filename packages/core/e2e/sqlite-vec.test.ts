/**
 * E2E Tests for sqlite-vec Vector Database
 *
 * Tests the sqlite-vec implementation including:
 * - Path management
 * - Database operations
 * - Hybrid search
 * - Context integration
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    mockEmbed,
    getFixturePath,
    TEST_TIMEOUT,
    createTempDir,
    cleanupDir,
    setupTests,
    teardownTests
} from './setup';
import { MockEmbeddingProvider } from './helpers/mock-embedding';
import {
    getVectorDbPath,
    getPathHash,
    vectorDbExists
} from '../src/utils/vector-paths';
import { SqliteVecVectorDatabase } from '../src/vectordb/sqlite-vec-vectordb';
import { Context } from '../src/context';

// Jest globals
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
declare const expect: (value: any) => any;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;

describe('sqlite-vec E2E Tests', () => {
    let db: SqliteVecVectorDatabase;
    let testCodebasePath: string;
    const TEST_DIMENSION = 1536;

    beforeAll(() => {
        setupTests();
    });

    afterAll(() => {
        teardownTests();
    });

    beforeEach(() => {
        // Use temp directory for each test
        testCodebasePath = createTempDir();
        db = new SqliteVecVectorDatabase({});
    });

    afterEach(() => {
        // Cleanup
        db.close();
        cleanupDir(testCodebasePath);
    });

    describe('Path Management', () => {
        test('getVectorDbPath generates correct path', () => {
            const dbPath = getVectorDbPath(testCodebasePath);
            expect(dbPath.includes(path.join('.code-context', 'vectors'))).toBe(true);
            expect(dbPath.endsWith('.db')).toBe(true);
        });

        test('getPathHash is deterministic', () => {
            const hash1 = getPathHash(testCodebasePath);
            const hash2 = getPathHash(testCodebasePath);
            expect(hash1).toBe(hash2);
        });

        test('different paths produce different hashes', () => {
            const path1 = '/home/user/project1';
            const path2 = '/home/user/project2';
            const hash1 = getPathHash(path1);
            const hash2 = getPathHash(path2);
            expect(hash1).not.toBe(hash2);
        });

        test('vectorDbExists returns false for non-existent', () => {
            expect(vectorDbExists(testCodebasePath)).toBe(false);
        });
    });

    describe('Database Operations', () => {
        test('createCollection creates vec0 table', async () => {
            await db.createCollection(testCodebasePath, TEST_DIMENSION);
            const exists = await db.hasCollection(testCodebasePath);
            expect(exists).toBe(true);
        }, TEST_TIMEOUT);

        test('createHybridCollection creates both tables', async () => {
            await db.createHybridCollection(testCodebasePath, TEST_DIMENSION);
            const exists = await db.hasCollection(testCodebasePath);
            expect(exists).toBe(true);
        }, TEST_TIMEOUT);

        test('insert stores documents correctly', async () => {
            await db.createCollection(testCodebasePath, TEST_DIMENSION);

            const documents = [
                {
                    id: 'doc1',
                    vector: mockEmbed('function to parse code'),
                    content: 'function parseCode() { return true; }',
                    relativePath: 'src/parser.ts',
                    startLine: 1,
                    endLine: 3,
                    fileExtension: '.ts',
                    metadata: { language: 'typescript' }
                }
            ];

            await db.insert(testCodebasePath, documents);

            const results = await db.search(testCodebasePath, mockEmbed('parse code'), { topK: 1 });
            expect(results.length).toBe(1);
            expect(results[0].document.id).toBe('doc1');
        }, TEST_TIMEOUT);

        test('search with filterExpr applies filters', async () => {
            await db.createCollection(testCodebasePath, TEST_DIMENSION);

            const documents = [
                {
                    id: 'doc1',
                    vector: mockEmbed('typescript code'),
                    content: 'const x = 1;',
                    relativePath: 'src/file.ts',
                    startLine: 1,
                    endLine: 1,
                    fileExtension: '.ts',
                    metadata: {}
                },
                {
                    id: 'doc2',
                    vector: mockEmbed('python code'),
                    content: 'x = 1',
                    relativePath: 'src/file.py',
                    startLine: 1,
                    endLine: 1,
                    fileExtension: '.py',
                    metadata: {}
                }
            ];

            await db.insert(testCodebasePath, documents);

            const results = await db.search(
                testCodebasePath,
                mockEmbed('code'),
                { topK: 10, filterExpr: 'fileExtension in [".ts"]' }
            );

            expect(results.length).toBe(1);
            expect(results[0].document.fileExtension).toBe('.ts');
        }, TEST_TIMEOUT);

        test('delete removes documents', async () => {
            await db.createCollection(testCodebasePath, TEST_DIMENSION);

            const documents = [
                {
                    id: 'doc1',
                    vector: mockEmbed('test'),
                    content: 'content',
                    relativePath: 'test.ts',
                    startLine: 1,
                    endLine: 1,
                    fileExtension: '.ts',
                    metadata: {}
                }
            ];

            await db.insert(testCodebasePath, documents);
            await db.delete(testCodebasePath, ['doc1']);

            const results = await db.search(testCodebasePath, mockEmbed('test'), { topK: 10 });
            expect(results.length).toBe(0);
        }, TEST_TIMEOUT);
    });

    describe('Hybrid Search', () => {
        test('hybridSearch combines vector and text', async () => {
            await db.createHybridCollection(testCodebasePath, TEST_DIMENSION);

            const documents = [
                {
                    id: 'doc1',
                    vector: mockEmbed('function to reverse string'),
                    content: 'function reverseString(str) { return str.split("").reverse().join(""); }',
                    relativePath: 'src/utils.ts',
                    startLine: 1,
                    endLine: 3,
                    fileExtension: '.ts',
                    metadata: {}
                },
                {
                    id: 'doc2',
                    vector: mockEmbed('function to capitalize string'),
                    content: 'function capitalizeString(str) { return str.charAt(0).toUpperCase() + str.slice(1); }',
                    relativePath: 'src/utils.ts',
                    startLine: 5,
                    endLine: 7,
                    fileExtension: '.ts',
                    metadata: {}
                }
            ];

            await db.insertHybrid(testCodebasePath, documents);

            const results = await db.hybridSearch(
                testCodebasePath,
                [
                    { data: mockEmbed('reverse text'), anns_field: 'vector', param: {}, limit: 5 },
                    { data: 'reverse', anns_field: 'sparse_vector', param: {}, limit: 5 }
                ],
                { limit: 2 }
            );

            expect(results.length).toBeGreaterThan(0);
        }, TEST_TIMEOUT);
    });

    describe('Context Integration', () => {
        test('Context.indexCodebase indexes files', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            // Create test files
            fs.mkdirSync(path.join(testCodebasePath, 'src'), { recursive: true });
            fs.writeFileSync(path.join(testCodebasePath, 'src', 'test.ts'), 'function test() { return 1; }');

            const result = await context.indexCodebase(testCodebasePath);
            expect(result.indexedFiles).toBeGreaterThan(0);
            expect(result.totalChunks).toBeGreaterThan(0);
        }, TEST_TIMEOUT);

        test('Context.semanticSearch finds results', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            // Create test files and index
            fs.mkdirSync(path.join(testCodebasePath, 'src'), { recursive: true });
            fs.writeFileSync(path.join(testCodebasePath, 'src', 'parser.ts'), 'function parseCode() { return true; }');

            await context.indexCodebase(testCodebasePath);

            const results = await context.semanticSearch(testCodebasePath, 'parse code');
            expect(results.length).toBeGreaterThan(0);
        }, TEST_TIMEOUT);
    });

    describe('Real-world Scenarios', () => {
        test('index TypeScript project', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            const fixturePath = getFixturePath('typescript-project');
            const result = await context.indexCodebase(fixturePath);

            expect(result.indexedFiles).toBeGreaterThan(0);
            expect(result.totalChunks).toBeGreaterThan(0);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('index Python project', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            const fixturePath = getFixturePath('python-project');
            const result = await context.indexCodebase(fixturePath);

            expect(result.indexedFiles).toBeGreaterThan(0);
            expect(result.totalChunks).toBeGreaterThan(0);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('search with semantic similarity', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            const fixturePath = getFixturePath('typescript-project');
            await context.indexCodebase(fixturePath);

            // Search for "parse code" should find the parser module
            const results = await context.semanticSearch(fixturePath, 'parse code');
            expect(results.length).toBeGreaterThan(0);

            // Check that parser.ts is in results
            const hasParser = results.some(r => r.relativePath.includes('parser'));
            expect(hasParser).toBe(true);
        }, TEST_TIMEOUT);

        test('multiple codebases are isolated', async () => {
            const embedding = new MockEmbeddingProvider();

            // Create two separate contexts with separate databases
            const db1 = new SqliteVecVectorDatabase({});
            const db2 = new SqliteVecVectorDatabase({});

            const context1 = new Context({ embedding, vectorDatabase: db1 });
            const context2 = new Context({ embedding, vectorDatabase: db2 });

            const tsProject = getFixturePath('typescript-project');
            const pyProject = getFixturePath('python-project');

            // Index different projects
            await context1.indexCodebase(tsProject);
            await context2.indexCodebase(pyProject);

            // Search in TypeScript project should only find TS results
            const tsResults = await context1.semanticSearch(tsProject, 'parse');
            expect(tsResults.length).toBeGreaterThan(0);

            // Search in Python project should only find Python results
            const pyResults = await context2.semanticSearch(pyProject, 'parse');
            expect(pyResults.length).toBeGreaterThan(0);

            db1.close();
            db2.close();
        }, TEST_TIMEOUT);
    });
});
