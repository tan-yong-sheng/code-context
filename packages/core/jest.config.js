module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                composite: false,
            },
        }],
    },
    // Transform ES modules from specific packages
    transformIgnorePatterns: [
        '/node_modules/(?!(p-retry|is-network-error|aggregate-error|clean-stack|indent-string|@google/genai)/)',
    ],
    // Map modules that cause ESM issues or native build issues to mocks
    moduleNameMapper: {
        '^@google/genai$': '<rootDir>/e2e/__mocks__/google-genai.mock.ts',
        '^@tan-yong-sheng/sqlite-vec-wasm-node$': '<rootDir>/e2e/__mocks__/sqlite-vec-wasm.mock.ts',
        '^tree-sitter$': '<rootDir>/e2e/__mocks__/tree-sitter.ts',
        '^tree-sitter-javascript$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-typescript$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-python$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-java$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-go$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-cpp$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-rust$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-c-sharp$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
        '^tree-sitter-scala$': '<rootDir>/e2e/__mocks__/tree-sitter-languages.ts',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
        '!src/**/index.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
    coverageThreshold: {
        global: {
            branches: 25,
            functions: 30,
            lines: 35,
            statements: 35,
        },
    },
    testTimeout: 30000,
    verbose: true,
};
