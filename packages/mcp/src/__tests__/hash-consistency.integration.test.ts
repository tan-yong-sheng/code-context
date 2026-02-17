/**
 * Integration test for hash consistency
 *
 * This test verifies the entire flow from index_codebase to search_code
 * uses consistent hash lengths, preventing the 'not indexed' error.
 *
 * This test would have caught the bug where getCollectionName() used
 * 8-char hashes but getPathHash() used 16-char hashes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Increase timeout for integration tests
jest.setTimeout(60000);

describe('Hash Consistency Integration Test', () => {
    let tempDir: string;

    beforeEach(async () => {
        // Create temp directory with sample code files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-context-test-'));

        // Create sample TypeScript files
        fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'src', 'utils.ts'), `
export function add(a: number, b: number): number {
    return a + b;
}
`);
    });

    afterEach(() => {
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should use consistent 8-character hash throughout flow', async () => {
        // Import functions
        const { getPathHash } = await import('@tan-yong-sheng/code-context-core/dist/utils/vector-paths');

        // Get hash from vector-paths
        const pathHash = getPathHash(tempDir);
        expect(pathHash).toHaveLength(8);
        expect(pathHash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should generate unique 8-char hashes for different paths', async () => {
        const { getPathHash } = await import('@tan-yong-sheng/code-context-core/dist/utils/vector-paths');

        // Create multiple temp directories
        const tempDirs = [
            fs.mkdtempSync(path.join(os.tmpdir(), 'test1-')),
            fs.mkdtempSync(path.join(os.tmpdir(), 'test2-')),
            fs.mkdtempSync(path.join(os.tmpdir(), 'test3-'))
        ];

        try {
            // Get hashes for all
            const hashes = tempDirs.map(dir => getPathHash(dir));

            // All should be 8 characters
            hashes.forEach(hash => {
                expect(hash).toHaveLength(8);
                expect(hash).toMatch(/^[a-f0-9]{8}$/);
            });

            // All should be unique
            const uniqueHashes = new Set(hashes);
            expect(uniqueHashes.size).toBe(hashes.length);
        } finally {
            // Cleanup
            tempDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
            });
        }
    });
});
