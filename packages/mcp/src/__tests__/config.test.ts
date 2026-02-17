/**
 * Unit Tests for MCP Config
 *
 * Tests embedding configuration functions
 */

import {
    getDefaultModelForProvider,
    getEmbeddingModelForProvider,
    getEmbeddingDimension,
    getEmbeddingBatchSize,
    createMcpConfig,
    logConfigurationSummary,
    ContextMcpConfig
} from '../config';
import { envManager } from '@tan-yong-sheng/code-context-core';

// Mock the envManager
jest.mock('@tan-yong-sheng/code-context-core', () => ({
    envManager: {
        get: jest.fn(),
    },
}));

describe('MCP Config', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        // Clear process.env
        delete process.env.EMBEDDING_PROVIDER;
        delete process.env.EMBEDDING_MODEL;
        delete process.env.EMBEDDING_DIMENSION;
        delete process.env.EMBEDDING_BATCH_SIZE;
        delete process.env.OLLAMA_MODEL;
        delete process.env.OPENAI_API_KEY;
        delete process.env.MCP_SERVER_NAME;
        delete process.env.MCP_SERVER_VERSION;
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('getDefaultModelForProvider()', () => {
        test.each([
            ['openai', 'text-embedding-3-small'],
            ['voyage', 'voyage-code-3'],
            ['gemini', 'gemini-embedding-001'],
            ['ollama', 'nomic-embed-text'],
            ['unknownprovider', 'text-embedding-3-small'], // default fallback
        ])('returns correct default model for %s', (provider, expected) => {
            const result = getDefaultModelForProvider(provider);
            expect(result).toBe(expected);
        });
    });

    describe('getEmbeddingModelForProvider()', () => {
        test('uses EMBEDDING_MODEL env var for openai', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_MODEL') return 'text-embedding-3-large';
                return undefined;
            });

            const result = getEmbeddingModelForProvider('openai');

            expect(result).toBe('text-embedding-3-large');
        });

        test('uses EMBEDDING_MODEL env var for voyage', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_MODEL') return 'voyage-3-large';
                return undefined;
            });

            const result = getEmbeddingModelForProvider('voyage');

            expect(result).toBe('voyage-3-large');
        });

        test('uses OLLAMA_MODEL over EMBEDDING_MODEL for ollama provider', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'OLLAMA_MODEL') return 'mxbai-embed-large';
                if (name === 'EMBEDDING_MODEL') return 'nomic-embed-text';
                return undefined;
            });

            const result = getEmbeddingModelForProvider('ollama');

            expect(result).toBe('mxbai-embed-large');
        });

        test('falls back to EMBEDDING_MODEL when OLLAMA_MODEL not set', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'OLLAMA_MODEL') return undefined;
                if (name === 'EMBEDDING_MODEL') return 'nomic-embed-text';
                return undefined;
            });

            const result = getEmbeddingModelForProvider('ollama');

            expect(result).toBe('nomic-embed-text');
        });

        test('uses default model when no env vars set', () => {
            (envManager.get as jest.Mock).mockReturnValue(undefined);

            const result = getEmbeddingModelForProvider('openai');

            expect(result).toBe('text-embedding-3-small');
        });

        test('provider names are case-sensitive - uppercase returns default', () => {
            (envManager.get as jest.Mock).mockReturnValue(undefined);

            // Uppercase 'OpenAI' is not recognized - returns default
            const result = getEmbeddingModelForProvider('OpenAI');

            // Since 'OpenAI' is not a valid lowercase provider, it falls through to default
            expect(result).toBe('text-embedding-3-small');
        });
    });

    describe('getEmbeddingDimension()', () => {
        test('returns parsed integer from env var', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_DIMENSION') return '1536';
                return undefined;
            });

            const result = getEmbeddingDimension();

            expect(result).toBe(1536);
        });

        test('returns undefined when env var not set', () => {
            (envManager.get as jest.Mock).mockReturnValue(undefined);

            const result = getEmbeddingDimension();

            expect(result).toBeUndefined();
        });

        test('returns undefined and logs warning for invalid value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_DIMENSION') return 'invalid';
                return undefined;
            });

            const result = getEmbeddingDimension();

            expect(result).toBeUndefined();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Invalid EMBEDDING_DIMENSION')
            );
            consoleSpy.mockRestore();
        });

        test('returns undefined for zero value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_DIMENSION') return '0';
                return undefined;
            });

            const result = getEmbeddingDimension();

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        test('returns undefined for negative value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_DIMENSION') return '-100';
                return undefined;
            });

            const result = getEmbeddingDimension();

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        test('handles large dimension values', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_DIMENSION') return '8192';
                return undefined;
            });

            const result = getEmbeddingDimension();

            expect(result).toBe(8192);
        });
    });

    describe('getEmbeddingBatchSize()', () => {
        test('returns parsed integer from env var', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_BATCH_SIZE') return '50';
                return undefined;
            });

            const result = getEmbeddingBatchSize();

            expect(result).toBe(50);
        });

        test('returns undefined when env var not set', () => {
            (envManager.get as jest.Mock).mockReturnValue(undefined);

            const result = getEmbeddingBatchSize();

            expect(result).toBeUndefined();
        });

        test('returns undefined and logs warning for invalid value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_BATCH_SIZE') return 'not-a-number';
                return undefined;
            });

            const result = getEmbeddingBatchSize();

            expect(result).toBeUndefined();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Invalid EMBEDDING_BATCH_SIZE')
            );
            consoleSpy.mockRestore();
        });

        test('returns undefined for zero value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_BATCH_SIZE') return '0';
                return undefined;
            });

            const result = getEmbeddingBatchSize();

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        test('returns undefined for negative value', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                if (name === 'EMBEDDING_BATCH_SIZE') return '-10';
                return undefined;
            });

            const result = getEmbeddingBatchSize();

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });
    });

    describe('createMcpConfig()', () => {
        test('creates config with default values', () => {
            (envManager.get as jest.Mock).mockReturnValue(undefined);

            const config = createMcpConfig();

            expect(config.name).toBe('Context MCP Server');
            expect(config.version).toBe('1.0.0');
            expect(config.embeddingProvider).toBe('openai');
            expect(config.embeddingModel).toBe('text-embedding-3-small');
            expect(config.embeddingDimension).toBeUndefined();
            expect(config.embeddingBatchSize).toBeUndefined();
        });

        test('creates config with custom values', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                const values: Record<string, string> = {
                    'MCP_SERVER_NAME': 'Custom Server',
                    'MCP_SERVER_VERSION': '2.0.0',
                    'EMBEDDING_PROVIDER': 'voyage',
                    'EMBEDDING_MODEL': 'voyage-3-large',
                    'EMBEDDING_DIMENSION': '1024',
                    'EMBEDDING_BATCH_SIZE': '200',
                    'VOYAGEAI_API_KEY': 'test-key',
                };
                return values[name];
            });

            const config = createMcpConfig();

            expect(config.name).toBe('Custom Server');
            expect(config.version).toBe('2.0.0');
            expect(config.embeddingProvider).toBe('voyage');
            expect(config.embeddingModel).toBe('voyage-3-large');
            expect(config.embeddingDimension).toBe(1024);
            expect(config.embeddingBatchSize).toBe(200);
            expect(config.voyageaiApiKey).toBe('test-key');
        });

        test('creates config with ollama provider', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                const values: Record<string, string> = {
                    'EMBEDDING_PROVIDER': 'ollama',
                    'OLLAMA_MODEL': 'mxbai-embed-large',
                    'OLLAMA_HOST': 'http://localhost:11434',
                };
                return values[name];
            });

            const config = createMcpConfig();

            expect(config.embeddingProvider).toBe('ollama');
            expect(config.embeddingModel).toBe('mxbai-embed-large');
            expect(config.ollamaHost).toBe('http://localhost:11434');
        });

        test('includes API keys when provided', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                const values: Record<string, string> = {
                    'OPENAI_API_KEY': 'sk-test123',
                    'OPENAI_BASE_URL': 'https://custom.openai.com',
                    'GEMINI_API_KEY': 'gemini-test',
                    'GEMINI_BASE_URL': 'https://custom.gemini.com',
                };
                return values[name];
            });

            const config = createMcpConfig();

            expect(config.openaiApiKey).toBe('sk-test123');
            expect(config.openaiBaseUrl).toBe('https://custom.openai.com');
            expect(config.geminiApiKey).toBe('gemini-test');
            expect(config.geminiBaseUrl).toBe('https://custom.gemini.com');
        });

        test('uppercase provider names fall back to openai', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                const values: Record<string, string> = {
                    'EMBEDDING_PROVIDER': 'OpenAI',  // Uppercase - should fall back to 'openai'
                };
                return values[name];
            });

            const config = createMcpConfig();

            // 'OpenAI' is not in valid lowercase providers, so it falls back to 'openai'
            expect(config.embeddingProvider).toBe('openai');
        });

        test('mixed case provider names fall back to openai', () => {
            (envManager.get as jest.Mock).mockImplementation((name: string) => {
                const values: Record<string, string> = {
                    'EMBEDDING_PROVIDER': 'GEMINI',  // Uppercase - should fall back to 'openai'
                };
                return values[name];
            });

            const config = createMcpConfig();

            // 'GEMINI' is not in valid lowercase providers, so it falls back to 'openai'
            expect(config.embeddingProvider).toBe('openai');
        });
    });

    describe('logConfigurationSummary()', () => {
        test('logs configuration with manual dimension', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const config: ContextMcpConfig = {
                name: 'Test Server',
                version: '1.0.0',
                embeddingProvider: 'openai',
                embeddingModel: 'text-embedding-3-large',
                embeddingDimension: 3072,
                embeddingBatchSize: 50,
                openaiApiKey: 'sk-test',
            };

            logConfigurationSummary(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Server'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('openai'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('text-embedding-3-large'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3072'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('manual override'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('50'));
            consoleSpy.mockRestore();
        });

        test('logs configuration with auto-detect dimension', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const config: ContextMcpConfig = {
                name: 'Test Server',
                version: '1.0.0',
                embeddingProvider: 'voyage',
                embeddingModel: 'voyage-code-3',
                openaiApiKey: undefined,
            };

            logConfigurationSummary(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('auto-detect'));
            consoleSpy.mockRestore();
        });

        test('logs voyage configuration correctly', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const config: ContextMcpConfig = {
                name: 'Test Server',
                version: '1.0.0',
                embeddingProvider: 'voyage',
                embeddingModel: 'voyage-code-3',
                voyageaiApiKey: 'pa-test',
            };

            logConfigurationSummary(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('VoyageAI API Key:'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Configured'));
            consoleSpy.mockRestore();
        });

        test('logs missing API key correctly', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const config: ContextMcpConfig = {
                name: 'Test Server',
                version: '1.0.0',
                embeddingProvider: 'openai',
                embeddingModel: 'text-embedding-3-small',
            };

            logConfigurationSummary(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OpenAI API Key:'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ Missing'));
            consoleSpy.mockRestore();
        });

        test('logs ollama configuration correctly', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const config: ContextMcpConfig = {
                name: 'Test Server',
                version: '1.0.0',
                embeddingProvider: 'ollama',
                embeddingModel: 'nomic-embed-text',
                ollamaHost: 'http://127.0.0.1:11434',
            };

            logConfigurationSummary(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ollama Host:'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:11434'));
            consoleSpy.mockRestore();
        });
    });
});
