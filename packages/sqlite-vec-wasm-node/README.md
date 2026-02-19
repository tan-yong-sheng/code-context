# @tan-yong-sheng/sqlite-vec-wasm-node

WebAssembly build of SQLite3 with [sqlite-vec](https://github.com/asg017/sqlite-vec) for Node.js with file system access.

## Features

- **No native compilation required** - Pure WebAssembly, works on any platform
- **File persistence** - Direct file system access via Node.js fs API
- **Vector search built-in** - sqlite-vec extension compiled in for semantic search
- **Cross-platform** - Same binary works on Linux (x64/ARM64), macOS (x64/ARM64), Windows

## Installation

```bash
npm install @tan-yong-sheng/sqlite-vec-wasm-node
```

## Usage

```javascript
const { Database } = require('@tan-yong-sheng/sqlite-vec-wasm-node');

// Open a database file (created if doesn't exist)
const db = new Database('mydb.sqlite');

// Check versions
const version = db.get('SELECT sqlite_version() as sqlite, vec_version() as vec');
console.log(`SQLite: ${version.sqlite}, sqlite-vec: ${version.vec}`);

// Create a vector table
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS embeddings
  USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[1536]
  )
`);

// Insert vectors
const embedding = new Float32Array(1536); // your embedding vector
db.run('INSERT INTO embeddings (id, embedding) VALUES (?, ?)', ['doc1', embedding.buffer]);

// Vector search
const query = new Float32Array(1536); // your query vector
const results = db.all(`
  SELECT id, vec_distance_cosine(embedding, ?) as distance
  FROM embeddings
  ORDER BY distance
  LIMIT 10
`, [query.buffer]);

console.log(results);

db.close();
```

## Why This Package?

### Problem with Native SQLite

Native SQLite bindings like `better-sqlite3` require compilation for each platform:
- Linux x64, Linux ARM64, macOS x64, macOS ARM64, Windows x64
- Each build must be compiled on a machine with matching GLIBC version
- Binary compatibility issues (e.g., GLIBC 2.38 vs 2.35)

### WASM Solution

This package uses WebAssembly:
- **Single binary** - Works everywhere
- **No GLIBC dependency** - Runs in any Node.js environment
- **File persistence** - Custom VFS maps SQLite file operations to Node.js fs API

## Building from Source

Prerequisites:
- Docker (for Emscripten toolchain)
- Node.js 18+

```bash
# Build the WASM module
make download  # Download SQLite and sqlite-vec sources
make           # Compile with Emscripten
```

## API

### `new Database(path, options?)`

Create a new database connection.

- `path` - Path to the database file
- `options.fileMustExist` - Throw error if file doesn't exist (default: false)
- `options.readOnly` - Open in read-only mode (default: false)

### `Database#exec(sql)`

Execute SQL statements.

### `Database#prepare(sql) -> Statement`

Create a prepared statement.

### `Database#run(sql, values?) -> { changes, lastInsertRowid }`

Execute a statement and return metadata.

### `Database#all(sql, values?) -> Row[]`

Execute a query and return all rows.

### `Database#get(sql, values?) -> Row | null`

Execute a query and return the first row.

### `Database#close()`

Close the database connection.

## License

MIT

## Credits

- SQLite - Public domain
- [sqlite-vec](https://github.com/asg017/sqlite-vec) - MIT/Apache-2.0
- [node-sqlite3-wasm](https://github.com/tndrle/node-sqlite3-wasm) - MIT (VFS implementation)
# Build test
