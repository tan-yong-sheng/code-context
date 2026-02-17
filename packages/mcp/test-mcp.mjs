import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMcp() {
    const transport = new StdioClientTransport({
        command: 'node',
        args: ['/home/ubuntu/code-context/packages/mcp/dist/index.js'],
        env: {
            ...process.env,
            EMBEDDING_PROVIDER: 'openai',
            EMBEDDING_MODEL: 'model2vec/minishlab-potion-multilingual-128M',
            EMBEDDING_DIMENSION: '256',
            OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
            OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
        }
    });

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    try {
        console.log('Connecting to MCP server...');
        await client.connect(transport);
        console.log('Connected to MCP server');

        // List tools
        console.log('Listing tools...');
        const tools = await client.listTools();
        console.log('Tools:', JSON.stringify(tools, null, 2));

        await client.close();
        console.log('Test completed successfully');
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testMcp();
