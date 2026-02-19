/**
 * Copy native dependencies for VSCode extension packaging
 * This script copies better-sqlite3 and its dependencies to the dist folder
 * so they can be included in the VSIX package.
 *
 * It also rebuilds better-sqlite3 for VS Code's Node.js version.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.resolve(__dirname, '../node_modules');
const targetDir = path.resolve(__dirname, '../dist/node_modules');
const pnpmStore = path.resolve(__dirname, '../../../node_modules/.pnpm');

// VS Code 1.109 uses Node 22.21.1 (NODE_MODULE_VERSION 127)
// For CI/build: Set TARGET_NODE_VERSION environment variable
// For local dev: Uses current Node.js version
const TARGET_NODE_VERSION = process.env.TARGET_NODE_VERSION || process.version.substring(1);

// Dependencies to copy (production dependencies that are externals in webpack)
const depsToCopy = [
    'better-sqlite3',
    'bindings',
    'file-uri-to-path',
    'sqlite-vec',
    'sqlite-vec-linux-arm64',
    'sqlite-vec-linux-x64',
    'sqlite-vec-darwin-arm64',
    'sqlite-vec-darwin-x64',
    'sqlite-vec-windows-x64'
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
                entry === 'examples' || entry === 'benchmark' || entry === 'scripts') {
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

// Rebuild better-sqlite3 for the target Node.js version
function rebuildBetterSqlite3() {
    console.log(`\nRebuilding better-sqlite3 for Node.js v${TARGET_NODE_VERSION}...`);

    // Use findPackageSource to locate better-sqlite3 (handles pnpm workspace structure)
    const betterSqlite3Path = findPackageSource('better-sqlite3');

    if (!betterSqlite3Path || !fs.existsSync(betterSqlite3Path)) {
        console.error('Error: better-sqlite3 not found in node_modules');
        console.error('Checked paths:');
        console.error(`  - ${path.join(sourceDir, 'better-sqlite3')}`);
        console.error(`  - pnpm store: ${pnpmStore}`);
        process.exit(1);
    }

    console.log(`Found better-sqlite3 at: ${betterSqlite3Path}`);

    try {
        // Use node-gyp to compile for the correct Node.js version
        // For CI: Set TARGET_NODE_VERSION env var to VS Code's Node version
        // For local: Uses current Node.js version
        console.log(`Running node-gyp rebuild for Node.js ${TARGET_NODE_VERSION}...`);

        const isDifferentTarget = TARGET_NODE_VERSION !== process.version.substring(1);
        const targetArgs = isDifferentTarget
            ? `--target=${TARGET_NODE_VERSION} --dist-url=https://nodejs.org/dist`
            : '';

        execSync(`npx node-gyp rebuild ${targetArgs} --release`, {
            cwd: betterSqlite3Path,
            stdio: 'inherit',
            env: {
                ...process.env,
                npm_config_target: TARGET_NODE_VERSION,
                npm_config_runtime: 'node'
            }
        });
        console.log('✓ better-sqlite3 rebuilt successfully for Node.js');
    } catch (error) {
        console.error('Error: Failed to rebuild better-sqlite3 for Node.js');
        console.error('Error:', error.message);
        console.error('\nThe extension may not work correctly in VS Code');
        process.exit(1);
    }
}

console.log('Copying native dependencies to dist/node_modules...');

// Debug: Show paths being used
console.log('Debug: sourceDir =', sourceDir);
console.log('Debug: pnpmStore =', pnpmStore);
console.log('Debug: Checking if sourceDir exists:', fs.existsSync(sourceDir));
console.log('Debug: Checking if pnpmStore exists:', fs.existsSync(pnpmStore));

// List contents of pnpmStore if it exists
if (fs.existsSync(pnpmStore)) {
    const entries = fs.readdirSync(pnpmStore);
    console.log('Debug: pnpmStore entries (first 20):', entries.slice(0, 20).join(', '));
    const betterSqlite3Entries = entries.filter(e => e.startsWith('better-sqlite3'));
    console.log('Debug: better-sqlite3 entries in pnpmStore:', betterSqlite3Entries.join(', ') || 'none');
}

// Check if already rebuilt (CI environments may have already done this)
// Use findPackageSource to handle pnpm workspace structure
const betterSqlite3ModulePath = findPackageSource('better-sqlite3');
console.log('Debug: betterSqlite3ModulePath =', betterSqlite3ModulePath);

if (!betterSqlite3ModulePath) {
    console.error('Error: better-sqlite3 not found in node_modules');
    console.error('Checked paths:');
    console.error(`  - ${path.join(sourceDir, 'better-sqlite3')}`);
    console.error(`  - pnpm store: ${pnpmStore}`);
    process.exit(1);
}
const prebuiltBinary = path.join(betterSqlite3ModulePath, 'build', 'Release', 'better_sqlite3.node');

if (fs.existsSync(prebuiltBinary)) {
    console.log(`✓ better-sqlite3 binary already exists at ${prebuiltBinary}, skipping rebuild`);
} else {
    // Rebuild better-sqlite3 for the correct Electron version
    rebuildBetterSqlite3();
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
                // Resolve relative to the node_modules directory
                return path.resolve(sourceDir, linkTarget);
            }
        } catch (e) {
            // Not a symlink, use as-is
        }
        return src;
    }

    // Look in pnpm store for platform-specific packages
    if (dep.startsWith('sqlite-vec-')) {
        const entries = fs.readdirSync(pnpmStore);
        const matchingEntry = entries.find(e => e.startsWith(dep + '@'));
        if (matchingEntry) {
            return path.join(pnpmStore, matchingEntry, 'node_modules', dep);
        }
    }

    // Look in pnpm store for better-sqlite3
    if (dep === 'better-sqlite3') {
        const entries = fs.readdirSync(pnpmStore);
        // Find the matching better-sqlite3 version
        const matchingEntries = entries.filter(e => e.startsWith('better-sqlite3@'));
        if (matchingEntries.length > 0) {
            // Use the latest version
            const latest = matchingEntries.sort()[matchingEntries.length - 1];
            return path.join(pnpmStore, latest, 'node_modules', dep);
        }
    }

    // Look in root node_modules for sqlite-vec
    if (dep === 'sqlite-vec') {
        const entries = fs.readdirSync(pnpmStore);
        // Find the latest version
        const matchingEntries = entries
            .filter(e => e.startsWith('sqlite-vec@') && !e.includes('linux') && !e.includes('darwin') && !e.includes('windows'))
            .sort();
        if (matchingEntries.length > 0) {
            const latest = matchingEntries[matchingEntries.length - 1];
            return path.join(pnpmStore, latest, 'node_modules', dep);
        }
    }

    return null;
}

for (const dep of depsToCopy) {
    const src = findPackageSource(dep);
    const dest = path.join(targetDir, dep);

    if (src && fs.existsSync(src)) {
        console.log(`Copying ${dep}...`);
        copyRecursive(src, dest);
    } else {
        if (dep.startsWith('sqlite-vec-')) {
            console.warn(`Warning: ${dep} not found (optional platform-specific package)`);
        } else {
            console.error(`Error: ${dep} not found in node_modules`);
            process.exit(1);
        }
    }
}

console.log('Native dependencies copied successfully!');

// Verify the files are in place
const betterSqlite3TargetPath = path.join(targetDir, 'better-sqlite3');
const bindingsPath = path.join(targetDir, 'bindings');
const fileUriToPathPath = path.join(targetDir, 'file-uri-to-path');
const sqliteVecPath = path.join(targetDir, 'sqlite-vec');

console.log('\nVerifying copied dependencies:');
console.log(`- better-sqlite3: ${fs.existsSync(betterSqlite3TargetPath) ? '✓' : '✗'}`);
console.log(`- bindings: ${fs.existsSync(bindingsPath) ? '✓' : '✗'}`);
console.log(`- file-uri-to-path: ${fs.existsSync(fileUriToPathPath) ? '✓' : '✗'}`);
console.log(`- sqlite-vec: ${fs.existsSync(sqliteVecPath) ? '✓' : '✗'}`);

// Verify the binary exists
const binaryPath = path.join(betterSqlite3TargetPath, 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(binaryPath)) {
    console.log(`- better_sqlite3.node binary: ✓`);
    const stats = fs.statSync(binaryPath);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
    console.error(`- better_sqlite3.node binary: ✗ (NOT FOUND!)`);
    process.exit(1);
}

// Verify sqlite-vec extension exists for current platform
const { platform, arch } = require('node:process');
const platformPackageName = `sqlite-vec-${platform === 'win32' ? 'windows' : platform}-${arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : 'arm64'}`;
const platformExtPath = path.join(targetDir, platformPackageName);
if (fs.existsSync(platformExtPath)) {
    console.log(`- ${platformPackageName}: ✓`);
} else {
    console.warn(`- ${platformPackageName}: ✗ (optional platform-specific extension)`);
}
