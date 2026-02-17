import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get env vars from shell environment or use defaults
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Debug: Log env vars
console.log('Parent process env vars:');
console.log('  OPENAI_API_KEY:', OPENAI_API_KEY ? `SET (length: ${OPENAI_API_KEY.length})` : 'NOT SET');
console.log('  OPENAI_BASE_URL:', OPENAI_BASE_URL);

// Start MCP server process
const serverProcess = spawn('node', [join(__dirname, 'dist/index.js')], {
    env: {
        ...process.env,
        EMBEDDING_PROVIDER: 'openai',
        EMBEDDING_MODEL: 'model2vec/minishlab-potion-multilingual-128M',
        EMBEDDING_DIMENSION: '256',
        OPENAI_API_KEY: OPENAI_API_KEY,
        OPENAI_BASE_URL: OPENAI_BASE_URL,
    },
    stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';
let requestId = 1;

function sendRequest(method, params = {}) {
    const request = {
        jsonrpc: '2.0',
        id: requestId++,
        method,
        params
    };
    const message = JSON.stringify(request) + '\n';
    console.log('Sending:', message.trim());
    serverProcess.stdin.write(message);
}

function waitForResponse(targetId, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for response ${targetId}`));
        }, timeout);

        const checkBuffer = () => {
            const lines = buffer.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                try {
                    const response = JSON.parse(line);
                    if (response.id === targetId) {
                        clearTimeout(timer);
                        // Remove processed line from buffer
                        lines.splice(i, 1);
                        buffer = lines.join('\n');
                        resolve(response);
                        return;
                    }
                } catch (e) {
                    // Not valid JSON, skip
                }
            }
            setTimeout(checkBuffer, 100);
        };
        checkBuffer();
    });
}

serverProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    console.log('Raw stdout:', data.toString().trim());
});

serverProcess.stderr.on('data', (data) => {
    console.log('Stderr:', data.toString().trim());
});

serverProcess.on('error', (error) => {
    console.error('Server error:', error);
});

serverProcess.on('exit', (code) => {
    console.log('Server exited with code:', code);
});

async function runTests() {
    try {
        console.log('Waiting for server to start...');
        await new Promise(r => setTimeout(r, 3000));

        // Test 1: Initialize
        console.log('\n=== Test 1: Initialize ===');
        sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });
        const initResponse = await waitForResponse(1);
        console.log('Initialize response:', JSON.stringify(initResponse, null, 2));

        // Test 2: List Tools
        console.log('\n=== Test 2: List Tools ===');
        sendRequest('tools/list', {});
        const toolsResponse = await waitForResponse(2);
        console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));

        if (toolsResponse.result && toolsResponse.result.tools) {
            console.log(`\nFound ${toolsResponse.result.tools.length} tools:`);
            for (const tool of toolsResponse.result.tools) {
                console.log(`  - ${tool.name}: ${tool.description}`);
            }
        }

        // Test 3: Call index_codebase tool (dry run - small test)
        console.log('\n=== Test 3: Call index_codebase ===');
        sendRequest('tools/call', {
            name: 'index_codebase',
            arguments: {
                path: '/home/ubuntu/code-context/packages/mcp',
                fileLimit: 5  // Small limit for testing
            }
        });
        const indexResponse = await waitForResponse(3, 60000);
        console.log('Index response:', JSON.stringify(indexResponse, null, 2));

        // Test 4: Call search_code tool
        console.log('\n=== Test 4: Call search_code ===');
        sendRequest('tools/call', {
            name: 'search_code',
            arguments: {
                path: '/home/ubuntu/code-context/packages/mcp',
                query: 'embedding provider',
                limit: 3
            }
        });
        const searchResponse = await waitForResponse(4, 60000);
        console.log('Search response:', JSON.stringify(searchResponse, null, 2));

        console.log('\n=== All tests completed ===');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        serverProcess.kill();
        process.exit(0);
    }
}

runTests();
