/**
 * Build script for sqlite-vec-wasm-node
 *
 * If dist/ already exists (e.g., from CI artifacts), skip building.
 * Otherwise, run the WASM build.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distPath = path.join(__dirname, '..', 'dist');
const jsFile = path.join(distPath, 'sqlite-vec-wasm-node.js');

// Check if dist already exists with built files
if (fs.existsSync(jsFile)) {
    console.log('dist/ already exists with built files, skipping build');
    process.exit(0);
}

// Otherwise, build the WASM module
console.log('Building WASM module...');
try {
    execSync('make wasm', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
    });
    console.log('WASM build completed');
} catch (error) {
    console.error('WASM build failed:', error.message);
    process.exit(1);
}
