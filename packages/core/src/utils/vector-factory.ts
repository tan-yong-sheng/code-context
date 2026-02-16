/**
 * Vector Database Factory
 *
 * Factory pattern for creating VectorDatabase instances based on configuration.
 * Supports sqlite-vec provider.
 */

import { VectorDatabase } from '../vectordb/types';
import { SqliteVecVectorDatabase, SqliteVecConfig } from '../vectordb/sqlite-vec-vectordb';

/**
 * Configuration for vector database factory
 */
export interface VectorDbFactoryConfig {
    sqliteVec?: SqliteVecConfig;
}

/**
 * Create a VectorDatabase instance based on configuration
 * @param config - Factory configuration
 * @returns VectorDatabase instance
 */
export function createVectorDatabase(config: VectorDbFactoryConfig): VectorDatabase {
    return new SqliteVecVectorDatabase(config.sqliteVec || {});
}

/**
 * Create a VectorDatabase instance from environment configuration
 * @returns VectorDatabase instance
 */
export function createVectorDatabaseFromEnv(): VectorDatabase {
    const config: VectorDbFactoryConfig = {
        sqliteVec: {
            dbPath: process.env.VECTOR_DB_PATH // Optional override
        }
    };

    return createVectorDatabase(config);
}

/**
 * Validate vector database configuration
 * @param config - Factory configuration to validate
 * @returns Validation result with errors if any
 */
export function validateVectorDbConfig(config: VectorDbFactoryConfig): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // sqlite-vec has no required config (uses default paths)
    // Just validate that the config object is provided
    if (!config) {
        errors.push('Configuration is required');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
