import { envManager } from "@tan-yong-sheng/code-context-core";

export interface ContextMcpConfig {
    name: string;
    version: string;
    // Embedding provider configuration (lowercase only: openai, voyage, gemini, ollama)
    embeddingProvider: 'openai' | 'voyage' | 'gemini' | 'ollama';
    embeddingModel: string;
    embeddingDimension?: number;  // Optional: override auto-detected dimension
    embeddingBatchSize?: number;  // Optional: override default batch size
    // Provider-specific API keys
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    voyageaiApiKey?: string;
    geminiApiKey?: string;
    geminiBaseUrl?: string;
    // Ollama configuration
    ollamaModel?: string;
    ollamaHost?: string;
}

// Legacy format (v1) - for backward compatibility
export interface CodebaseSnapshotV1 {
    indexedCodebases: string[];
    indexingCodebases: string[] | Record<string, number>;  // Array (legacy) or Map of codebase path to progress percentage
    lastUpdated: string;
}

// New format (v2) - structured with codebase information

// Base interface for common fields
interface CodebaseInfoBase {
    lastUpdated: string;
}

// Indexing state - when indexing is in progress
export interface CodebaseInfoIndexing extends CodebaseInfoBase {
    status: 'indexing';
    indexingPercentage: number;  // Current progress percentage
}

// Indexed state - when indexing completed successfully
export interface CodebaseInfoIndexed extends CodebaseInfoBase {
    status: 'indexed';
    indexedFiles: number;        // Number of files indexed
    totalChunks: number;         // Total number of chunks generated
    indexStatus: 'completed' | 'limit_reached';  // Status from indexing result
}

// Index failed state - when indexing failed
export interface CodebaseInfoIndexFailed extends CodebaseInfoBase {
    status: 'indexfailed';
    errorMessage: string;        // Error message from the failure
    lastAttemptedPercentage?: number;  // Progress when failure occurred
}

// Union type for all codebase information states
export type CodebaseInfo = CodebaseInfoIndexing | CodebaseInfoIndexed | CodebaseInfoIndexFailed;

export interface CodebaseSnapshotV2 {
    formatVersion: 'v2';
    codebases: Record<string, CodebaseInfo>;  // codebasePath -> CodebaseInfo
    lastUpdated: string;
}

// Union type for all supported formats
export type CodebaseSnapshot = CodebaseSnapshotV1 | CodebaseSnapshotV2;

// Helper function to get default model for each provider
// Provider names must be lowercase (openai, voyage, gemini, ollama)
export function getDefaultModelForProvider(provider: string): string {
    // Provider must already be lowercase - no normalization
    switch (provider) {
        case 'openai':
            return 'text-embedding-3-small';
        case 'voyage':
            return 'voyage-code-3';
        case 'gemini':
            return 'gemini-embedding-001';
        case 'ollama':
            return 'nomic-embed-text';
        default:
            return 'text-embedding-3-small';
    }
}

// Helper function to get embedding model with provider-specific environment variable priority
// Provider names must be lowercase (openai, voyage, gemini, ollama)
export function getEmbeddingModelForProvider(provider: string): string {
    // Provider must already be lowercase - no normalization
    switch (provider) {
        case 'ollama':
            // For Ollama, prioritize OLLAMA_MODEL over EMBEDDING_MODEL for backward compatibility
            const ollamaModel = envManager.get('OLLAMA_MODEL') || envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 Ollama model selection: OLLAMA_MODEL=${envManager.get('OLLAMA_MODEL') || 'NOT SET'}, EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${ollamaModel}`);
            return ollamaModel;
        case 'openai':
        case 'voyage':
        case 'gemini':
        default:
            // For all other providers, use EMBEDDING_MODEL or default
            const selectedModel = envManager.get('EMBEDDING_MODEL') || getDefaultModelForProvider(provider);
            console.log(`[DEBUG] 🎯 ${provider} model selection: EMBEDDING_MODEL=${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}, selected=${selectedModel}`);
            return selectedModel;
    }
}

// Helper function to get embedding dimension from environment variable
export function getEmbeddingDimension(): number | undefined {
    const dimensionEnv = envManager.get('EMBEDDING_DIMENSION');
    if (!dimensionEnv) {
        return undefined;
    }

    const parsed = parseInt(dimensionEnv, 10);
    if (isNaN(parsed) || parsed <= 0) {
        console.warn(`[Config] ⚠️ Invalid EMBEDDING_DIMENSION value: "${dimensionEnv}". Using auto-detection.`);
        return undefined;
    }

    console.log(`[Config] 📏 Using manually configured embedding dimension: ${parsed}`);
    return parsed;
}

// Helper function to get embedding batch size from environment variable
export function getEmbeddingBatchSize(): number | undefined {
    const batchSizeEnv = envManager.get('EMBEDDING_BATCH_SIZE');
    if (!batchSizeEnv) {
        return undefined;
    }

    const parsed = parseInt(batchSizeEnv, 10);
    if (isNaN(parsed) || parsed <= 0) {
        console.warn(`[Config] ⚠️ Invalid EMBEDDING_BATCH_SIZE value: "${batchSizeEnv}". Using default.`);
        return undefined;
    }

    console.log(`[Config] 📦 Using manually configured embedding batch size: ${parsed}`);
    return parsed;
}

export function createMcpConfig(): ContextMcpConfig {
    // Debug: Print all environment variables related to Context
    console.log(`[DEBUG] 🔍 Environment Variables Debug:`);
    console.log(`[DEBUG]   EMBEDDING_PROVIDER: ${envManager.get('EMBEDDING_PROVIDER') || 'NOT SET'}`);
    console.log(`[DEBUG]   EMBEDDING_MODEL: ${envManager.get('EMBEDDING_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   EMBEDDING_DIMENSION: ${envManager.get('EMBEDDING_DIMENSION') || 'NOT SET (auto-detect)'}`);
    console.log(`[DEBUG]   EMBEDDING_BATCH_SIZE: ${envManager.get('EMBEDDING_BATCH_SIZE') || 'NOT SET (default: 100)'}`);
    console.log(`[DEBUG]   OLLAMA_MODEL: ${envManager.get('OLLAMA_MODEL') || 'NOT SET'}`);
    console.log(`[DEBUG]   GEMINI_API_KEY: ${envManager.get('GEMINI_API_KEY') ? 'SET (length: ' + envManager.get('GEMINI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   OPENAI_API_KEY: ${envManager.get('OPENAI_API_KEY') ? 'SET (length: ' + envManager.get('OPENAI_API_KEY')!.length + ')' : 'NOT SET'}`);
    console.log(`[DEBUG]   NODE_ENV: ${envManager.get('NODE_ENV') || 'NOT SET'}`);

    // Use lowercase provider name only (case sensitive)
    const rawProvider = envManager.get('EMBEDDING_PROVIDER') || 'openai';

    // Validate - must be lowercase only
    const validProviders = ['openai', 'voyage', 'gemini', 'ollama'];
    const finalProvider = validProviders.includes(rawProvider) ? rawProvider : 'openai';

    const config: ContextMcpConfig = {
        name: envManager.get('MCP_SERVER_NAME') || "Context MCP Server",
        version: envManager.get('MCP_SERVER_VERSION') || "1.0.0",
        // Embedding provider configuration (lowercase only: openai, voyage, gemini, ollama)
        embeddingProvider: finalProvider as 'openai' | 'voyage' | 'gemini' | 'ollama',
        embeddingModel: getEmbeddingModelForProvider(rawProvider),
        embeddingDimension: getEmbeddingDimension(),
        embeddingBatchSize: getEmbeddingBatchSize(),
        // Provider-specific API keys
        openaiApiKey: envManager.get('OPENAI_API_KEY'),
        openaiBaseUrl: envManager.get('OPENAI_BASE_URL'),
        voyageaiApiKey: envManager.get('VOYAGEAI_API_KEY'),
        geminiApiKey: envManager.get('GEMINI_API_KEY'),
        geminiBaseUrl: envManager.get('GEMINI_BASE_URL'),
        // Ollama configuration
        ollamaModel: envManager.get('OLLAMA_MODEL'),
        ollamaHost: envManager.get('OLLAMA_HOST')
    };

    return config;
}

export function logConfigurationSummary(config: ContextMcpConfig): void {
    // Log configuration summary before starting server
    console.log(`[MCP] 🚀 Starting Context MCP Server`);
    console.log(`[MCP] Configuration Summary:`);
    console.log(`[MCP]   Server: ${config.name} v${config.version}`);
    console.log(`[MCP]   Embedding Provider: ${config.embeddingProvider}`);
    console.log(`[MCP]   Embedding Model: ${config.embeddingModel}`);
    console.log(`[MCP]   Embedding Dimension: ${config.embeddingDimension ? `${config.embeddingDimension} (manual override)` : 'auto-detect'}`);
    console.log(`[MCP]   Embedding Batch Size: ${config.embeddingBatchSize || 100}`);
    console.log(`[MCP]   Vector DB: sqlite-vec (local SQLite)`);

    // Log provider-specific configuration without exposing sensitive data
    switch (config.embeddingProvider) {
        case 'openai':
            console.log(`[MCP]   OpenAI API Key: ${config.openaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.openaiBaseUrl) {
                console.log(`[MCP]   OpenAI Base URL: ${config.openaiBaseUrl}`);
            }
            break;
        case 'voyage':
            console.log(`[MCP]   VoyageAI API Key: ${config.voyageaiApiKey ? '✅ Configured' : '❌ Missing'}`);
            break;
        case 'gemini':
            console.log(`[MCP]   Gemini API Key: ${config.geminiApiKey ? '✅ Configured' : '❌ Missing'}`);
            if (config.geminiBaseUrl) {
                console.log(`[MCP]   Gemini Base URL: ${config.geminiBaseUrl}`);
            }
            break;
        case 'ollama':
            console.log(`[MCP]   Ollama Host: ${config.ollamaHost || 'http://127.0.0.1:11434'}`);
            console.log(`[MCP]   Ollama Model: ${config.embeddingModel}`);
            break;
    }

    console.log(`[MCP] 🔧 Initializing server components...`);
}

export function showHelpMessage(): void {
    console.log(`
Context MCP Server

Usage: npx @tan-yong-sheng/code-context-mcp@latest [options]

Options:
  --help, -h                          Show this help message

Environment Variables:
  MCP_SERVER_NAME         Server name
  MCP_SERVER_VERSION      Server version

  Embedding Provider Configuration:
  EMBEDDING_PROVIDER      Embedding provider: openai, voyage, gemini, ollama (lowercase only, default: openai)
  EMBEDDING_MODEL         Embedding model name (works for all providers)
  EMBEDDING_DIMENSION     Embedding dimension (optional, overrides auto-detection)
  EMBEDDING_BATCH_SIZE    Batch size for processing embeddings (default: 100)

  Provider-specific API Keys:
  OPENAI_API_KEY          OpenAI API key (required for OpenAI provider)
  OPENAI_BASE_URL         OpenAI API base URL (optional, for custom endpoints)
  VOYAGEAI_API_KEY        VoyageAI API key (required for VoyageAI provider)
  GEMINI_API_KEY          Google AI API key (required for Gemini provider)
  GEMINI_BASE_URL         Gemini API base URL (optional, for custom endpoints)

  Ollama Configuration:
  OLLAMA_HOST             Ollama server host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL            Ollama model name (alternative to EMBEDDING_MODEL for Ollama)
  
Examples:
  # Start MCP server with OpenAI (default)
  OPENAI_API_KEY=sk-xxx npx @tan-yong-sheng/code-context-mcp@latest

  # Start MCP server with OpenAI and specific model
  OPENAI_API_KEY=sk-xxx EMBEDDING_MODEL=text-embedding-3-large npx @tan-yong-sheng/code-context-mcp@latest

  # Start MCP server with VoyageAI and specific model
  EMBEDDING_PROVIDER=voyage VOYAGEAI_API_KEY=pa-xxx EMBEDDING_MODEL=voyage-3-large npx @tan-yong-sheng/code-context-mcp@latest

  # Start MCP server with Gemini and specific model (case-insensitive)
  EMBEDDING_PROVIDER=gemini GEMINI_API_KEY=xxx EMBEDDING_MODEL=gemini-embedding-001 npx @tan-yong-sheng/code-context-mcp@latest

  # Start MCP server with Ollama and specific model (using OLLAMA_MODEL)
  EMBEDDING_PROVIDER=ollama OLLAMA_MODEL=mxbai-embed-large npx @tan-yong-sheng/code-context-mcp@latest

  # Start MCP server with Ollama and specific model (using EMBEDDING_MODEL)
  EMBEDDING_PROVIDER=ollama EMBEDDING_MODEL=nomic-embed-text npx @tan-yong-sheng/code-context-mcp@latest
        `);
} 