/**
 * Vector Database Path Management Utilities
 *
 * Manages SQLite database file paths for vector storage.
 * Uses 1 codebase = 1 file approach stored in ~/.code-context/vectors/
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

const CODE_CONTEXT_DIR = path.join(os.homedir(), '.code-context');
export const VECTOR_DB_DIR = path.join(CODE_CONTEXT_DIR, 'vectors');
const PATH_MAPPINGS_FILE = path.join(CODE_CONTEXT_DIR, 'path-mappings.json');

/**
 * Get the storage path for a vector database file
 * @param codebasePath - Absolute path to the codebase
 * @returns Path to the SQLite database file
 */
export function getVectorDbPath(codebasePath: string): string {
    const resolvedPath = path.resolve(codebasePath);
    const hash = getPathHash(resolvedPath);

    // Ensure directory exists
    ensureVectorDirectory();

    // Save mapping for reverse lookup
    savePathMapping(hash, resolvedPath);

    return path.join(VECTOR_DB_DIR, `${hash}.db`);
}

/**
 * Get the hash for a codebase path
 * @param codebasePath - Absolute path to the codebase
 * @returns 8-character MD5 hash
 */
export function getPathHash(codebasePath: string): string {
    const resolvedPath = path.resolve(codebasePath);
    return crypto
        .createHash('md5')
        .update(resolvedPath)
        .digest('hex')
        .substring(0, 8);
}

/**
 * Get the original codebase path from a hash
 * @param hash - The hash string
 * @returns Original path or undefined if not found
 */
export function getOriginalPath(hash: string): string | undefined {
    const mappings = loadPathMappings();
    return mappings[hash];
}

/**
 * Ensure the vector database directory exists
 */
export function ensureVectorDirectory(): void {
    if (!fs.existsSync(VECTOR_DB_DIR)) {
        fs.mkdirSync(VECTOR_DB_DIR, { recursive: true });
    }
}

/**
 * Load all path mappings from the mappings file
 * @returns Object mapping hashes to paths
 */
function loadPathMappings(): Record<string, string> {
    try {
        if (fs.existsSync(PATH_MAPPINGS_FILE)) {
            const content = fs.readFileSync(PATH_MAPPINGS_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.warn('[VectorPaths] Failed to load path mappings:', error);
    }
    return {};
}

/**
 * Save a path mapping to the mappings file
 * @param hash - The hash string
 * @param originalPath - The original codebase path
 */
function savePathMapping(hash: string, originalPath: string): void {
    try {
        // Ensure parent directory exists
        if (!fs.existsSync(CODE_CONTEXT_DIR)) {
            fs.mkdirSync(CODE_CONTEXT_DIR, { recursive: true });
        }

        const mappings = loadPathMappings();
        mappings[hash] = originalPath;
        fs.writeFileSync(PATH_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    } catch (error) {
        console.warn('[VectorPaths] Failed to save path mapping:', error);
    }
}

/**
 * List all vector databases with their metadata
 * @returns Array of database information objects
 */
export function listAllVectorDbs(): Array<{
    hash: string;
    path: string;
    size: number;
    lastModified: Date;
    originalPath?: string;
}> {
    ensureVectorDirectory();

    const files = fs.readdirSync(VECTOR_DB_DIR);
    const mappings = loadPathMappings();

    return files
        .filter((file: string) => file.endsWith('.db'))
        .map((file: string) => {
            const hash = file.replace('.db', '');
            const dbPath = path.join(VECTOR_DB_DIR, file);
            const stats = fs.statSync(dbPath);

            return {
                hash,
                path: dbPath,
                size: stats.size,
                lastModified: stats.mtime,
                originalPath: mappings[hash]
            };
        })
        .sort((a: { lastModified: Date }, b: { lastModified: Date }) => b.lastModified.getTime() - a.lastModified.getTime());
}

/**
 * Clean up orphaned databases (databases whose original paths no longer exist)
 * @returns Array of deleted database hashes
 */
export function cleanupOrphanedDatabases(): string[] {
    const dbs = listAllVectorDbs();
    const deleted: string[] = [];

    for (const db of dbs) {
        // Check if original path exists
        if (db.originalPath && !fs.existsSync(db.originalPath)) {
            try {
                fs.unlinkSync(db.path);
                deleted.push(db.hash);

                // Remove from mappings
                const mappings = loadPathMappings();
                delete mappings[db.hash];
                fs.writeFileSync(PATH_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
            } catch (error) {
                console.warn(`[VectorPaths] Failed to delete orphaned database ${db.hash}:`, error);
            }
        }
    }

    return deleted;
}

/**
 * Delete a vector database for a specific codebase
 * @param codebasePath - Path to the codebase
 * @returns true if deleted, false if not found
 */
export function deleteVectorDb(codebasePath: string): boolean {
    const dbPath = getVectorDbPath(codebasePath);
    const hash = getPathHash(codebasePath);

    try {
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);

            // Remove from mappings
            const mappings = loadPathMappings();
            delete mappings[hash];
            fs.writeFileSync(PATH_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));

            return true;
        }
    } catch (error) {
        console.warn(`[VectorPaths] Failed to delete vector database for ${codebasePath}:`, error);
    }

    return false;
}

/**
 * Get statistics about vector databases
 * @returns Statistics object
 */
export function getVectorDbStats(): {
    totalDatabases: number;
    totalSize: number;
    oldestDb?: Date;
    newestDb?: Date;
} {
    const dbs = listAllVectorDbs();

    if (dbs.length === 0) {
        return { totalDatabases: 0, totalSize: 0 };
    }

    const totalSize = dbs.reduce((sum, db) => sum + db.size, 0);
    const sortedByDate = [...dbs].sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    return {
        totalDatabases: dbs.length,
        totalSize,
        oldestDb: sortedByDate[0].lastModified,
        newestDb: sortedByDate[sortedByDate.length - 1].lastModified
    };
}

/**
 * Check if a vector database exists for a codebase
 * @param codebasePath - Path to the codebase
 * @returns true if database exists
 */
export function vectorDbExists(codebasePath: string): boolean {
    const dbPath = getVectorDbPath(codebasePath);
    return fs.existsSync(dbPath);
}

/**
 * Get the size of a vector database
 * @param codebasePath - Path to the codebase
 * @returns Size in bytes, or 0 if not found
 */
export function getVectorDbSize(codebasePath: string): number {
    const dbPath = getVectorDbPath(codebasePath);

    try {
        if (fs.existsSync(dbPath)) {
            return fs.statSync(dbPath).size;
        }
    } catch (error) {
        console.warn(`[VectorPaths] Failed to get size for ${codebasePath}:`, error);
    }

    return 0;
}
