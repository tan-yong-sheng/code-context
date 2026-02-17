import { Context, SqliteVecVectorDatabase, AstCodeSplitter, LangChainCodeSplitter } from '@tan-yong-sheng/code-context-core';
import { envManager } from '@tan-yong-sheng/code-context-core';
import * as path from 'path';

// Try to load .env file
try {
    require('dotenv').config();
} catch (error) {
    // dotenv is not required, skip if not installed
}

async function main() {
    console.log('🚀 Code Context Real Usage Example');
    console.log('===================================');

    try {
        // 1. Initialize sqlite-vec vector database (zero config!)
        console.log(`🔧 Using sqlite-vec (local SQLite vector database)`);
        console.log(`💾 Database location: ~/.code-context/vectors/`);

        const vectorDatabase = new SqliteVecVectorDatabase({
            // Optional: custom dbPath
            // dbPath: '/custom/path/to/vectors.db'
        });

        const splitterType = envManager.get('SPLITTER_TYPE')?.toLowerCase() || 'ast';

        // 2. Create Context instance
        let codeSplitter;
        if (splitterType === 'langchain') {
            codeSplitter = new LangChainCodeSplitter(1000, 200);
        } else {
            codeSplitter = new AstCodeSplitter(2500, 300);
        }
        const context = new Context({
            vectorDatabase,
            codeSplitter,
            supportedExtensions: ['.ts', '.js', '.py', '.java', '.cpp', '.go', '.rs']
        });

        // 3. Check if index already exists and clear if needed
        console.log('\n📖 Starting to index codebase...');
        const codebasePath = path.join(__dirname, '../..'); // Index entire project

        // Check if index already exists
        const hasExistingIndex = await context.hasIndex(codebasePath);
        if (hasExistingIndex) {
            console.log('🗑️  Existing index found, clearing it first...');
            await context.clearIndex(codebasePath);
        }

        // Index with progress tracking
        const indexStats = await context.indexCodebase(codebasePath);

        // 4. Show indexing statistics
        console.log(`\n📊 Indexing stats: ${indexStats.indexedFiles} files, ${indexStats.totalChunks} code chunks`);

        // 5. Perform semantic search
        console.log('\n🔍 Performing semantic search...');

        const queries = [
            'vector database operations',
            'code splitting functions',
            'embedding generation',
            'typescript interface definitions'
        ];

        for (const query of queries) {
            console.log(`\n🔎 Search: "${query}"`);
            const results = await context.semanticSearch(codebasePath, query, 3, 0.3);

            if (results.length > 0) {
                results.forEach((result, index) => {
                    console.log(`   ${index + 1}. Similarity: ${(result.score * 100).toFixed(2)}%`);
                    console.log(`      File: ${path.join(codebasePath, result.relativePath)}`);
                    console.log(`      Language: ${result.language}`);
                    console.log(`      Lines: ${result.startLine}-${result.endLine}`);
                    console.log(`      Preview: ${result.content.substring(0, 100)}...`);
                });
            } else {
                console.log('   No relevant results found');
            }
        }

        console.log('\n🎉 Example completed successfully!');

    } catch (error) {
        console.error('❌ Error occurred:', error);

        // Provide detailed error diagnostics
        if (error instanceof Error) {
            if (error.message.includes('API key')) {
                console.log('\n💡 Please make sure to set the correct OPENAI_API_KEY environment variable');
                console.log('   Example: export OPENAI_API_KEY="your-actual-api-key"');
            }

            console.log('\n💡 Environment Variables:');
            console.log('   - OPENAI_API_KEY: Your OpenAI API key (required for OpenAI embeddings)');
            console.log('   - OPENAI_BASE_URL: Custom OpenAI API endpoint (optional)');
            console.log('   - SPLITTER_TYPE: Code splitter type - "ast" or "langchain" (default: ast)');
            console.log('   - VECTOR_DB_PATH: Custom path for sqlite-vec databases (optional)');
        }

        process.exit(1);
    }
}

// Run main program
if (require.main === module) {
    main().catch(console.error);
}

export { main };
