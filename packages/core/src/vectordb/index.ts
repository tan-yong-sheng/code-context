// Re-export types and interfaces
export {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    VectorDatabase,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
    RerankStrategy
} from './types';

// Implementation class exports
export { SqliteVecVectorDatabase, SqliteVecConfig } from './sqlite-vec-vectordb';
