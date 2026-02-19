/**
 * Copy native dependencies for VSCode extension packaging
 * This script copies the WASM SQLite package to the dist folder
 * so they can be included in the VSIX package.
 *
 * Since we use WASM, there are no native binaries to rebuild -
 * the WASM files work across all platforms.
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '../node_modules');
const targetDir = path.resolve(__dirname, '../dist/node_modules');
const pnpmStore = path.resolve(__dirname, '../../../node_modules/.pnpm');

// Dependencies to copy (production dependencies that are externals in webpack)
const depsToCopy = [
    '@tan-yong-sheng/sqlite-vec-wasm-node'
];

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`Warning: Source does not exist: ${src}`);
        return;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            // Skip unnecessary files to reduce package size
            if (entry === '.bin' || entry === '.cache' || entry === 'README.md' ||
                entry === 'CHANGELOG.md' || entry === 'LICENSE.md' || entry === 'LICENSE' ||
                entry === '.github' || entry === '.gitignore' || entry === 'test' ||
                entry === 'tests' || entry === '__tests__' || entry === 'docs' ||
                entry === 'examples' || entry === 'benchmark' || entry === 'scripts' ||
                entry === 'src' || entry === 'Makefile' || entry === '.gitignore' ||
                entry === 'build' || entry === 'sqlite-src' || entry === 'sqlite-vec-src' ||
                entry === '.github') {
                continue;
            }
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        // Only copy necessary file types
        const ext = path.extname(src);
        if (ext === '.md' || ext === '.markdown' || ext === '.txt' || ext === '.yml' || ext === '.yaml' ||
            ext === '.json' && path.basename(src) === 'package-lock.json') {
            return;
        }
        fs.copyFileSync(src, dest);
    }
}

// Helper to find package source
function findPackageSource(dep) {
    // First check local node_modules
    let src = path.join(sourceDir, dep);
    if (fs.existsSync(src)) {
        // Check if it's a symlink and resolve it
        try {
            const stats = fs.lstatSync(src);
            if (stats.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(src);
                // Resolve relative to the symlink's parent directory, not sourceDir
                return path.resolve(path.dirname(src), linkTarget);
            }
        } catch (e) {
            // Not a symlink, use as-is
        }
        return src;
    }

    // Check root node_modules (for pnpm workspace hoisted deps)
    const rootNodeModules = path.resolve(__dirname, '../../../node_modules');
    const rootSrc = path.join(rootNodeModules, dep);
    if (fs.existsSync(rootSrc)) {
        // Check if it's a symlink and resolve it
        try {
            const stats = fs.lstatSync(rootSrc);
            if (stats.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(rootSrc);
                return path.resolve(path.dirname(rootSrc), linkTarget);
            }
        } catch (e) {
            // Not a symlink, use as-is
        }
        return rootSrc;
    }

    // Look in pnpm store
    const stores = [pnpmStore, path.join(rootNodeModules, '.pnpm')];
    for (const store of stores) {
        if (fs.existsSync(store)) {
            const entries = fs.readdirSync(store);
            // Handle scoped packages
            const depName = dep.startsWith('@') ? dep.substring(1).replace('/', '+') : dep;
            const matchingEntries = entries.filter(e => e.startsWith(depName + '@'));
            if (matchingEntries.length > 0) {
                const latest = matchingEntries.sort()[matchingEntries.length - 1];
                return path.join(store, latest, 'node_modules', dep);
            }
        }
    }

    // Check packages directory for workspace packages
    const packagesDir = path.resolve(__dirname, '../../..', 'packages');
    const packageName = dep.replace('@tan-yong-sheng/', '');
    const workspaceSrc = path.join(packagesDir, packageName);
    if (fs.existsSync(workspaceSrc)) {
        return workspaceSrc;
    }

    return null;
}

console.log('Copying WASM dependencies to dist/node_modules...');

for (const dep of depsToCopy) {
    const src = findPackageSource(dep);
    const dest = path.join(targetDir, dep);

    if (src && fs.existsSync(src)) {
        console.log(`Copying ${dep} from ${src}...`);
        copyRecursive(src, dest);
    } else {
        console.error(`Error: ${dep} not found in node_modules`);
        console.error('Checked paths:');
        console.error(`  - ${path.join(sourceDir, dep)}`);
        console.error(`  - pnpm store: ${pnpmStore}`);
        console.error(`  - packages directory`);
        process.exit(1);
    }
}

console.log('WASM dependencies copied successfully!');

// Verify the files are in place
const wasmPackagePath = path.join(targetDir, '@tan-yong-sheng', 'sqlite-vec-wasm-node');

console.log('\nVerifying copied dependencies:');
console.log(`- @tan-yong-sheng/sqlite-vec-wasm-node: ${fs.existsSync(wasmPackagePath) ? '✓' : '✗'}`);

// Verify the WASM file exists
const wasmFile = path.join(wasmPackagePath, 'dist', 'sqlite-vec-wasm-node.wasm');
const jsFile = path.join(wasmPackagePath, 'dist', 'sqlite-vec-wasm-node.js');

if (fs.existsSync(wasmFile)) {
    console.log(`- sqlite-vec-wasm-node.wasm: ✓`);
    const stats = fs.statSync(wasmFile);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
    console.error(`- sqlite-vec-wasm-node.wasm: ✗ (NOT FOUND!)`);
    console.error(`  Expected at: ${wasmFile}`);
}

if (fs.existsSync(jsFile)) {
    console.log(`- sqlite-vec-wasm-node.js: ✓`);
} else {
    console.error(`- sqlite-vec-wasm-node.js: ✗ (NOT FOUND!)`);
    console.error(`  Expected at: ${jsFile}`);
}

// List all files in the wasm package for debugging
console.log('\nFiles in WASM package:');
function listFiles(dir, prefix = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            console.log(`${prefix}${entry.name}/`);
            listFiles(fullPath, prefix + '  ');
        } else {
            const stats = fs.statSync(fullPath);
            console.log(`${prefix}${entry.name} (${(stats.size / 1024).toFixed(1)} KB)`);
        }
    }
}
listFiles(wasmPackagePath);
