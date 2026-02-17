import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get env vars
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Clear previous snapshot to start fresh
const snapshotPath = join(os.homedir(), '.context', 'mcp-codebase-snapshot.json');
if (fs.existsSync(snapshotPath)) {
    console.log('Removing old snapshot:', snapshotPath);
    fs.unlinkSync(snapshotPath);
}

console.log('=== INDEXING FLOW TEST ===');
console.log('Starting MCP server...');

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
    serverProcess.stdin.write(message);
    return request.id;
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
                        lines.splice(i, 1);
                        buffer = lines.join('\n');
                        resolve(response);
                        return;
                    }
                } catch (e) { }
            }
            setTimeout(checkBuffer, 100);
        };
        checkBuffer();
    });
}

serverProcess.stdout.on('data', (data) => {
    buffer += data.toString();
});

serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    // Only log relevant messages
    if (msg.includes('[BACKGROUND-INDEX]') ||
        msg.includes('[SYNC-CLOUD]') ||
        msg.includes('[SNAPSHOT-DEBUG]') ||
        msg.includes('[SEARCH]') ||
        msg.includes('indexed') ||
        msg.includes('indexing')) {
        console.log('SERVER:', msg);
    }
});

async function runTest() {
    const testPath = '/home/ubuntu/code-context/packages/mcp';

    try {
        console.log('\n--- STEP 1: Initialize ---');
        await new Promise(r => setTimeout(r, 3000));

        const initId = sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
        });
        await waitForResponse(initId, 5000);
        console.log('✓ Initialized');

        console.log('\n--- STEP 2: Start Indexing ---');
        const indexId = sendRequest('tools/call', {
            name: 'index_codebase',
            arguments: {
                path: testPath,
                force: true
            }
        });
        const indexResult = await waitForResponse(indexId, 10000);
        console.log('Index result:', indexResult?.result?.content?.[0]?.text?.substring(0, 100) || 'N/A');

        // Poll status multiple times
        console.log('\n--- STEP 3: Poll Indexing Status (every 3 seconds) ---');
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 3000));

            const statusId = sendRequest('tools/call', {
                name: 'get_indexing_status',
                arguments: { path: testPath }
            });

            const statusResult = await waitForResponse(statusId, 5000);
            const statusText = statusResult?.result?.content?.[0]?.text || 'Unknown';
            console.log(`Poll ${i + 1}: ${statusText.substring(0, 80)}...`);

            // Check snapshot file content
            if (fs.existsSync(snapshotPath)) {
                const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
                const codebase = snapshot.codebases?.[testPath];
                if (codebase) {
                    console.log(`  -> Snapshot: status=${codebase.status}, progress=${codebase.indexingPercentage || 'N/A'}%`);
                } else {
                    console.log(`  -> Snapshot: NOT FOUND in snapshot!`);
                }
            }
        }

        console.log('\n--- STEP 4: Try Search (when status shows complete) ---');
        const searchId = sendRequest('tools/call', {
            name: 'search_code',
            arguments: {
                path: testPath,
                query: 'embedding provider',
                limit: 3
            }
        });
        const searchResult = await waitForResponse(searchId, 30000);
        console.log('Search result:', searchResult?.result?.content?.[0]?.text?.substring(0, 200) || 'N/A');

        console.log('\n--- STEP 5: Check Status Again After Search ---');
        const finalStatusId = sendRequest('tools/call', {
            name: 'get_indexing_status',
            arguments: { path: testPath }
        });
        const finalStatus = await waitForResponse(finalStatusId, 5000);
        console.log('Final status:', finalStatus?.result?.content?.[0]?.text || 'Unknown');

        // Check final snapshot
        if (fs.existsSync(snapshotPath)) {
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
            console.log('\n--- Final Snapshot Content ---');
            console.log(JSON.stringify(snapshot, null, 2));
        }

        console.log('\n--- STEP 6: Test Clear Index ---');
        const clearId = sendRequest('tools/call', {
            name: 'clear_index',
            arguments: { path: testPath }
        });
        const clearResult = await waitForResponse(clearId, 10000);
        console.log('Clear result:', clearResult?.result?.content?.[0]?.text || 'N/A');

        // Check snapshot after clear
        if (fs.existsSync(snapshotPath)) {
            const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
            console.log('\n--- Snapshot After Clear ---');
            console.log('Codebases:', Object.keys(snapshot.codebases || {}));
        }

        console.log('\n=== TEST COMPLETED ===');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        serverProcess.kill();
        process.exit(0);
    }
}

runTest();
