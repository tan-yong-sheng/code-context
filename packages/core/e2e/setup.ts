/**
 * E2E Test Setup
 *
 * Configuration and utilities for E2E tests
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { mockEmbed, MOCK_EMBEDDING_DIMENSION } from './helpers/mock-embedding';

// Set test environment
process.env.NODE_ENV = 'test';

// Use temp directory for test databases
const TEST_DB_DIR = path.join(os.tmpdir(), 'code-context-e2e-test');
process.env.VECTOR_DB_PATH = TEST_DB_DIR;

// Global test utilities
export const TEST_TIMEOUT = 60000;
export { mockEmbed, MOCK_EMBEDDING_DIMENSION };

/**
 * Get path to test fixture
 */
export function getFixturePath(name: string): string {
    return path.join(__dirname, 'fixtures', name);
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Timeout waiting for condition');
}

/**
 * Create a temporary test directory
 */
export function createTempDir(): string {
    const tempDir = path.join(os.tmpdir(), `claude-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
}

/**
 * Clean up a directory
 */
export function cleanupDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

/**
 * Setup before all tests
 */
export function setupTests(): void {
    // Clean up test database directory
    if (fs.existsSync(TEST_DB_DIR)) {
        fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
}

/**
 * Teardown after all tests
 */
export function teardownTests(): void {
    // Clean up test database directory
    if (fs.existsSync(TEST_DB_DIR)) {
        fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
}
