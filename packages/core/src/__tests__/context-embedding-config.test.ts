/**
 * Integration Tests for Context Embedding Configuration
 *
 * Tests embedding dimension and batch size configuration
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Context } from '../context';
import { SqliteVecVectorDatabase } from '../vectordb/sqlite-vec-vectordb';
import { MockEmbeddingProvider, MOCK_EMBEDDING_DIMENSION, mockEmbedWithDimension } from '../test-helpers/mock-embedding';
import { Embedding, EmbeddingVector } from '../embedding';

/**
 * Mock Embedding Provider that simulates an unknown model (returns 0 from getDimension)
 */
class MockEmbeddingProviderWithUnknownDimension extends Embedding {
    protected maxTokens: number = 8000;

    async embed(text: string): Promise<EmbeddingVector> {
        const vector = mockEmbedWithDimension(text, MOCK_EMBEDDING_DIMENSION);
        return {
            vector,
            dimension: vector.length
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        return Promise.all(texts.map(text => this.embed(text)));
    }

    async detectDimension(_testText?: string): Promise<number> {
        return 0;
    }

    getDimension(): number {
        return 0; // Simulates unknown model
    }

    getProvider(): string {
        return 'mock-unknown';
    }
}

// Jest globals
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
declare const xit: (name: string, fn: () => void | Promise<void>, timeout?: number) => void;
declare const expect: (value: any) => any;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;

describe('Context Embedding Configuration Integration Tests', () => {
    let db: SqliteVecVectorDatabase;
    let testCodebasePath: string;
    const TEST_TIMEOUT = 60000;

    beforeAll(() => {
        // Set test environment
        process.env.NODE_ENV = 'test';
    });

    beforeEach(() => {
        // Use temp directory for each test
        testCodebasePath = path.join(os.tmpdir(), `code-context-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        fs.mkdirSync(testCodebasePath, { recursive: true });
        db = new SqliteVecVectorDatabase({});

        // Clear embedding config env vars
        delete process.env.EMBEDDING_DIMENSION;
        delete process.env.EMBEDDING_BATCH_SIZE;
    });

    afterEach(() => {
        // Cleanup
        db.close();
        if (fs.existsSync(testCodebasePath)) {
            fs.rmSync(testCodebasePath, { recursive: true, force: true });
        }
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('embeddingDimension configuration', () => {
        test('uses embeddingDimension from config', async () => {
            const customDimension = 768;
            const embedding = new MockEmbeddingProvider(customDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: customDimension
            });

            // Create a simple test file
            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            expect(result.totalChunks).toBeGreaterThan(0);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('EMBEDDING_DIMENSION env var provides dimension', async () => {
            const envDimension = 1024;
            process.env.EMBEDDING_DIMENSION = envDimension.toString();

            const embedding = new MockEmbeddingProvider(envDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db
                // Note: dimension comes from EMBEDDING_DIMENSION env var
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('config embeddingDimension takes priority over env var', async () => {
            const configDimension = 512;
            const envDimension = 1024;
            process.env.EMBEDDING_DIMENSION = envDimension.toString();

            const embedding = new MockEmbeddingProvider(configDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: configDimension
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('invalid EMBEDDING_DIMENSION with unknown model throws error during indexing - dimension is required', async () => {
            process.env.EMBEDDING_DIMENSION = 'invalid';

            // Use a mock that returns 0 from getDimension() to simulate unknown model
            const embedding = new MockEmbeddingProviderWithUnknownDimension();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            // Without explicit embeddingDimension and with invalid env var and unknown model, should throw during indexing
            await expect(context.indexCodebase(testCodebasePath)).rejects.toThrow('Embedding dimension is required');
        }, TEST_TIMEOUT);

        test('zero EMBEDDING_DIMENSION with unknown model throws error during indexing - dimension is required', async () => {
            process.env.EMBEDDING_DIMENSION = '0';

            // Use a mock that returns 0 from getDimension() to simulate unknown model
            const embedding = new MockEmbeddingProviderWithUnknownDimension();
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            // Without explicit embeddingDimension and with zero env var and unknown model, should throw during indexing
            await expect(context.indexCodebase(testCodebasePath)).rejects.toThrow('Embedding dimension is required');
        }, TEST_TIMEOUT);

        test('known model dimension is used when EMBEDDING_DIMENSION is invalid', async () => {
            process.env.EMBEDDING_DIMENSION = 'invalid';

            // Use a standard mock that returns a known dimension
            const embedding = new MockEmbeddingProvider(MOCK_EMBEDDING_DIMENSION);
            const context = new Context({
                embedding,
                vectorDatabase: db
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            // Should succeed using the known model dimension (1536)
            const result = await context.indexCodebase(testCodebasePath);
            expect(result.indexedFiles).toBe(1);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);
    });

    describe('embeddingBatchSize configuration', () => {
        test('uses embeddingBatchSize from config', async () => {
            const customBatchSize = 10;
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION,
                embeddingBatchSize: customBatchSize
            });

            // Create multiple test files to trigger batching
            for (let i = 0; i < 5; i++) {
                fs.writeFileSync(
                    path.join(testCodebasePath, `test${i}.ts`),
                    `function test${i}() { return ${i}; }`
                );
            }

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(5);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('EMBEDDING_BATCH_SIZE env var changes batch processing', async () => {
            process.env.EMBEDDING_BATCH_SIZE = '5';

            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION
            });

            for (let i = 0; i < 3; i++) {
                fs.writeFileSync(
                    path.join(testCodebasePath, `test${i}.ts`),
                    `function test${i}() { return ${i}; }`
                );
            }

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(3);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('config embeddingBatchSize takes priority over env var', async () => {
            const configBatchSize = 15;
            process.env.EMBEDDING_BATCH_SIZE = '50';

            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION,
                embeddingBatchSize: configBatchSize
            });

            for (let i = 0; i < 3; i++) {
                fs.writeFileSync(
                    path.join(testCodebasePath, `test${i}.ts`),
                    `function test${i}() { return ${i}; }`
                );
            }

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(3);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('invalid EMBEDDING_BATCH_SIZE uses default with explicit dimension', async () => {
            process.env.EMBEDDING_BATCH_SIZE = 'invalid';

            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            // Context silently falls back to default batch size without warning
        }, TEST_TIMEOUT);

        test('negative EMBEDDING_BATCH_SIZE uses default with explicit dimension', async () => {
            process.env.EMBEDDING_BATCH_SIZE = '-10';

            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            // Context silently falls back to default batch size without warning
        }, TEST_TIMEOUT);
    });

    describe('combined configuration', () => {
        test('both dimension and batch size from config work together', async () => {
            const customDimension = 768;
            const customBatchSize = 5;

            const embedding = new MockEmbeddingProvider(customDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: customDimension,
                embeddingBatchSize: customBatchSize
            });

            for (let i = 0; i < 3; i++) {
                fs.writeFileSync(
                    path.join(testCodebasePath, `test${i}.ts`),
                    `function test${i}() { return ${i}; }`
                );
            }

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(3);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        // Skip this test due to mock background sync timing issues between tests
        // The semantic search functionality is tested in e2e tests
        // eslint-disable-next-line jest/no-disabled-tests
        xit('semantic search works with custom dimension', async () => {
            const customDimension = 512;

            const embedding = new MockEmbeddingProvider(customDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: customDimension
            });

            fs.mkdirSync(path.join(testCodebasePath, 'src'), { recursive: true });
            fs.writeFileSync(
                path.join(testCodebasePath, 'src', 'parser.ts'),
                'function parseCode() { return true; }'
            );

            await context.indexCodebase(testCodebasePath);

            const results = await context.semanticSearch(testCodebasePath, 'parse code');

            expect(results.length).toBeGreaterThan(0);
        }, TEST_TIMEOUT);
    });

    describe('edge cases', () => {
        test('works with very small batch size', async () => {
            const embedding = new MockEmbeddingProvider();
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: MOCK_EMBEDDING_DIMENSION,
                embeddingBatchSize: 1
            });

            for (let i = 0; i < 3; i++) {
                fs.writeFileSync(
                    path.join(testCodebasePath, `test${i}.ts`),
                    `function test${i}() { return ${i}; }`
                );
            }

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(3);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('works with large dimension', async () => {
            const largeDimension = 4096;

            const embedding = new MockEmbeddingProvider(largeDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: largeDimension
            });

            fs.writeFileSync(
                path.join(testCodebasePath, 'test.ts'),
                'function test() { return 1; }'
            );

            const result = await context.indexCodebase(testCodebasePath);

            expect(result.indexedFiles).toBe(1);
            expect(result.status).toBe('completed');
        }, TEST_TIMEOUT);

        test('reindexing works with custom dimension', async () => {
            const customDimension = 768;

            const embedding = new MockEmbeddingProvider(customDimension);
            const context = new Context({
                embedding,
                vectorDatabase: db,
                embeddingDimension: customDimension
            });

            const testFilePath = path.join(testCodebasePath, 'test.ts');
            fs.writeFileSync(testFilePath, 'function test() { return 1; }');

            // First index
            const result1 = await context.indexCodebase(testCodebasePath);
            expect(result1.indexedFiles).toBe(1);

            // Wait a bit to ensure file modification time is different
            await new Promise(resolve => setTimeout(resolve, 100));

            // Modify file
            fs.writeFileSync(testFilePath, 'function test() { return 2; }');

            // Force a reindex by running indexCodebase again with forceReindex
            const result2 = await context.indexCodebase(testCodebasePath, undefined, true);
            expect(result2.indexedFiles).toBe(1);
        }, TEST_TIMEOUT);
    });
});
