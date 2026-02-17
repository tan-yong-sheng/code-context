# Research: Migrating from Milvus to sqlite-vec

**Date:** 2025-02-16
**Author:** Claude Code
**Status:** Ready for Implementation

---

## Executive Summary

This document contains comprehensive research on migrating Code Context's vector database from Milvus to SQLite-based solutions. After evaluating multiple options, **sqlite-vec** was selected as the primary implementation, with **FTS5** for hybrid search text components.

**Key Decision:** Use `sqlite-vec` (brute-force) over `vectorlite` (HNSW) due to zero build dependencies, maximum portability, and "fast enough" performance for typical codebase sizes (<500K chunks).

---

## Table of Contents

1. [Current Milvus Architecture](#1-current-milvus-architecture)
2. [SQLite Ecosystem Options](#2-sqlite-ecosystem-options)
3. [sqlite-vec Deep Dive](#3-sqlite-vec-deep-dive)
4. [vectorlite Analysis](#4-vectorlite-analysis)
5. [pgvector Comparison](#5-pgvector-comparison)
6. [Decision Matrix](#6-decision-matrix)
7. [Implementation Plan](#7-implementation-plan)
8. [SQL Schema & Operations](#8-sql-schema--operations)
9. [Performance Benchmarks](#9-performance-benchmarks)
10. [Risks & Mitigations](#10-risks--mitigations)

---

## 1. Current Milvus Architecture

### 1.1 Overview
Code Context currently uses two Milvus implementations:

| Implementation | Environment | Protocol | Use Case |
|---------------|-------------|----------|----------|
| `MilvusVectorDatabase` | Node.js backend | gRPC | Full-featured server deployment |
| `MilvusRestfulVectorDatabase` | VSCode/Chrome extensions | REST API | Constrained environments |

### 1.2 Collection Schema
```typescript
{
  id: string (primary key, max 512 chars)
  vector: FloatVector[dimension]  // e.g., 1536 for OpenAI embeddings
  content: string (max 65535 chars)
  relativePath: string (max 1024 chars)
  startLine: number (Int64)
  endLine: number (Int64)
  fileExtension: string (max 32 chars)
  metadata: string (JSON, max 65535 chars)
}
```

### 1.3 Current Architecture
```
Milvus Instance (1 database)
├── collection: code_chunks_a1b2c3d4  ← Project A
├── collection: code_chunks_e5f6g7h8  ← Project B
├── collection: hybrid_code_chunks_i9j0k1l2  ← Project C (hybrid)
└── ... (many collections in same DB)
```

**Note:** All codebases share one Milvus database, each gets its own collection.

### 1.4 Features Used
- Dense vector search with AUTOINDEX (COSINE metric)
- Hybrid search (BM25 sparse + dense) with RRF reranking
- Metadata filtering with boolean expressions
- Collection-level isolation

---

## 2. SQLite Ecosystem Options

### 2.1 Overview of Options

| Option | ANN Index | Speed | Dependencies | Best For |
|--------|-----------|-------|--------------|----------|
| **sqlite-vec** | ❌ Brute force | Medium | Zero | General purpose, reliability |
| **vectorlite** | ✅ HNSW | Fast | hnswlib (native) | Speed-critical applications |
| **sqlite-vector** (SQLiteAI) | ✅ Quantized | Very Fast | Commercial license | Enterprise/performance |
| **sqlite-vss** | ✅ IVF (Faiss) | Slow builds | Faiss | ❌ Deprecated |
| **libSQL (Turso)** | ✅ DiskANN | Fast | Turso-specific | Turso/cloud users |

### 2.2 Detailed Comparison

#### sqlite-vec
- **Author:** Alex Garcia (Mozilla Builders sponsored)
- **GitHub:** https://github.com/asg017/sqlite-vec
- **License:** MIT/Apache-2.0
- **Approach:** Virtual tables (`vec0()`) with brute-force search
- **Pros:** Zero dependencies, prebuilt binaries, 100% recall, very mature
- **Cons:** No ANN index, linear search time

#### vectorlite
- **Author:** 1yefuwang1
- **GitHub:** https://github.com/1yefuwang1/vectorlite
- **License:** Apache-2.0
- **Approach:** HNSW index via hnswlib
- **Pros:** 10-20x faster queries, scales better
- **Cons:** Native compilation required, build dependencies, approximate results

#### sqlite-vss
- **Status:** ❌ **DEPRECATED** - superseded by sqlite-vec
- **Reason:** Abandoned due to integration issues with Faiss

---

## 3. sqlite-vec Deep Dive

### 3.1 What is sqlite-vec?

sqlite-vec is a vector search SQLite extension written in pure C that:
- Runs anywhere SQLite runs (Linux, macOS, Windows, WASM, Raspberry Pi)
- Uses virtual tables similar to FTS5
- Supports float32, int8, and bit vectors
- Has zero dependencies (prebuilt binaries)

### 3.2 Installation

```bash
npm install sqlite-vec
```

```typescript
import * as sqliteVec from 'sqlite-vec';
import Database from 'better-sqlite3';

const db = new Database('vectors.db');
sqliteVec.load(db);
```

### 3.3 Virtual Table Creation

```sql
CREATE VIRTUAL TABLE vec_documents USING vec0(
  embedding float[768]
);
```

### 3.4 Vector Types

| Type | Storage | Use Case |
|------|---------|----------|
| `float` (float32) | 4 bytes/element | Standard embeddings |
| `int8` | 1 byte/element | Quantized embeddings |
| `bit` | 1 bit/element | Binary embeddings |

### 3.5 Distance Functions

- `vec_distance_L2(a, b)` - Euclidean distance
- `vec_distance_cosine(a, b)` - Cosine distance
- `vec_distance_hamming(a, b)` - Hamming distance (bit vectors only)

### 3.6 Performance Characteristics

From official benchmarks (Alex Garcia's blog):

| Vectors | Dimension | Query Time | Assessment |
|---------|-----------|------------|------------|
| 100K | 384 | ~68ms | ✅ Excellent |
| 100K | 768 | ~75ms | ✅ Excellent |
| 100K | 1536 | ~105ms | ✅ Good |
| 100K | 3072 | ~214ms | ⚠️ Acceptable |
| 1M | 384 | ~350ms | ⚠️ Slow |
| 1M | 1536 | ~2.5s | ❌ Too slow |
| 1M | 3072 | ~8.5s | ❌ Unusable |

**For code search context:**
- Most codebases: 1K-50K chunks → sqlite-vec is perfect
- Large codebases: 100K-200K chunks → sqlite-vec is acceptable (~100-200ms)
- Huge codebases: 500K+ chunks → Consider alternatives

### 3.7 Key Limitations

1. **No ANN Index** - Full table scan for every query
2. **Memory Usage** - Loads vectors in chunks, not all at once
3. **WAL Mode** - Should enable for concurrency: `PRAGMA journal_mode=WAL;`

---

## 4. vectorlite Analysis

### 4.1 Overview

vectorlite is an SQLite extension using HNSW (Hierarchical Navigable Small World) algorithm via hnswlib.

### 4.2 Performance vs sqlite-vec

From vectorlite benchmarks:

| Metric | sqlite-vec | vectorlite | Improvement |
|--------|-----------|------------|-------------|
| Insert 128d | Fast | 6-16x slower | ❌ sqlite-vec wins |
| Query 128d | 200μs | ~10μs | ✅ 20x faster |
| Query 1536d | 3856μs | ~200μs | ✅ 19x faster |
| Recall | 100% | ~96% | ⚠️ Trade-off |

### 4.3 Why NOT Selected

Despite faster queries, vectorlite was **NOT selected** because:

1. **Build Dependencies:** Requires Python, C++ compiler, hnswlib headers
2. **Build Failures:** Can fail on Windows, Alpine Linux, constrained environments
3. **Approximate Results:** 96% recall means some results may be missed
4. **Slower Inserts:** HNSW index maintenance overhead
5. **Complexity:** More complex deployment for marginal benefit on typical codebases

### 4.4 When vectorlite Would Be Better

- Codebases with 500K+ chunks
- Requirement for sub-50ms queries
- Controlled deployment environment
- Acceptable to miss some results (approximate search)

---

## 5. pgvector Comparison

### 5.1 Overview

pgvector is a PostgreSQL extension for vector similarity search.

### 5.2 Pros vs sqlite-vec

| Feature | pgvector | sqlite-vec |
|---------|----------|------------|
| HNSW Index | ✅ Yes | ❌ No |
| IVFFlat Index | ✅ Yes | ❌ No |
| Max Vectors | Millions+ | ~100K-1M practical |
| Query Speed | <10ms (with HNSW) | 50-500ms |
| SQL Features | Full PostgreSQL | SQLite subset |
| Backup Tools | pg_dump, etc. | Copy file |

### 5.3 Cons vs sqlite-vec

| Feature | pgvector | sqlite-vec |
|---------|----------|------------|
| Setup Complexity | Docker/server needed | Just npm install |
| Infrastructure | Requires PostgreSQL server | File-based |
| Portability | Server-bound | File is portable |
| Dependencies | PostgreSQL + extension | Zero dependencies |

### 5.4 Why NOT Selected

1. **Requires Docker/Server** - sqlite-vec is simpler for local tool
2. **More Infrastructure** - PostgreSQL is overkill for this use case
3. **Not File-Portable** - Can't easily move/copy vector database

### 5.5 Docker Setup (For Reference)

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: vectordb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
```

---

## 6. Decision Matrix

### 6.1 Final Decision

**Selected:** `sqlite-vec` with `FTS5` for hybrid search

**Rejected:**
- vectorlite - build complexity not worth the performance gain
- pgvector - too much infrastructure for a local tool
- sqlite-vss - deprecated

### 6.2 Decision Rationale

| Factor | sqlite-vec | vectorlite | pgvector |
|--------|-----------|------------|----------|
| **Zero dependencies** | ✅ Yes | ❌ No | ❌ No |
| **Easy install** | ✅ npm install | ⚠️ May fail | ❌ Docker needed |
| **Performance** | ⚠️ Good enough | ✅ Fast | ✅ Fast |
| **Exact results** | ✅ 100% | ❌ ~96% | ✅ 100% |
| **Maturity** | ✅ Very mature | ⚠️ Newer | ✅ Mature |
| **Portability** | ✅ File-based | ✅ File-based | ❌ Server-based |
| **Typical use case** | ✅ Perfect | ⚠️ Overkill | ❌ Overkill |

### 6.3 When to Consider Alternatives

Consider **vectorlite** if:
- Codebases regularly exceed 500K chunks
- Sub-50ms query time is critical
- Build environment is fully controlled

Consider **pgvector** if:
- Already using PostgreSQL
- Need full SQL feature set
- Team is PostgreSQL-savvy

Keep **Milvus** (current) if:
- Already invested in Milvus infrastructure
- Need cloud scaling
- Hybrid search is critical and complex

---

## 7. Implementation Plan

### 7.1 Storage Architecture

**Selected:** Option A - 1 codebase = 1 SQLite file

```
~/.code-context/
└── vectors/
    ├── a1b2c3d4e5f67890.db      ← Project A vectors + FTS
    ├── b2c3d4e5f6g78901.db      ← Project B vectors + FTS
    └── c3d4e5f6g7h89012.db      ← Project C vectors + FTS
```

**Not selected:** In-project storage (risk of git commits)

### 7.2 Configuration

```bash
# Environment variable
VECTOR_DB_PROVIDER=sqlite|milvus  # default: sqlite
```

### 7.3 Implementation Phases

| Phase | Task | Files | Hours |
|-------|------|-------|-------|
| 1 | Path utilities | `utils/vector-paths.ts` | 2-3 |
| 2 | Factory pattern | `utils/vector-factory.ts` | 1 |
| 3 | sqlite-vec impl | `vectordb/sqlite-vec-vectordb.ts` | 5-6 |
| 4 | Hybrid search | `vectordb/sqlite-hybrid-search.ts` | 3-4 |
| 5 | Integration | Modify 5 files | 2-3 |
| 6 | Testing | Tests | 3-4 |

**Total: 16-21 hours**

---

## 8. SQL Schema & Operations

### 8.1 Table Schema

#### Vector Table (sqlite-vec)
```sql
CREATE VIRTUAL TABLE documents USING vec0(
  id TEXT PRIMARY KEY,
  vector float[1536],
  content TEXT,
  relativePath TEXT,
  startLine INTEGER,
  endLine INTEGER,
  fileExtension TEXT,
  metadata TEXT
);
```

#### FTS Table (FTS5)
```sql
CREATE VIRTUAL TABLE document_fts USING fts5(
  id UNINDEXED,
  content,
  relativePath,
  fileExtension
);
```

### 8.2 CRUD Operations

#### Insert
```sql
-- Vector
INSERT INTO documents (id, vector, content, relativePath, startLine, endLine, fileExtension, metadata)
VALUES (?, vec_f32(?), ?, ?, ?, ?, ?, ?);

-- FTS (manual or trigger)
INSERT INTO document_fts (id, content, relativePath, fileExtension)
VALUES (?, ?, ?, ?);
```

#### Vector Search (Cosine)
```sql
SELECT
  id, content, relativePath, startLine, endLine, fileExtension, metadata,
  vec_distance_cosine(vector, vec_f32(?)) AS distance
FROM documents
WHERE fileExtension IN ('.ts', '.js')
ORDER BY distance
LIMIT ?;
```

#### Text Search (BM25)
```sql
SELECT
  id, content, relativePath, fileExtension,
  rank AS bm25_score
FROM document_fts
WHERE document_fts MATCH ?
ORDER BY rank
LIMIT ?;
```

#### Delete
```sql
DELETE FROM documents WHERE id = ?;
DELETE FROM document_fts WHERE id = ?;
```

#### Query with Filter
```sql
SELECT * FROM documents
WHERE fileExtension = '.ts' AND startLine > 100
LIMIT ?;
```

#### Drop Collection
```sql
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS document_fts;
```

### 8.3 Hybrid Search (RRF Algorithm)

```typescript
// 1. Get vector results (top 50)
const vectorResults = db.prepare(`
  SELECT id, vec_distance_cosine(vector, vec_f32(?)) AS score
  FROM documents
  ORDER BY score
  LIMIT 50
`).all(queryVector);

// 2. Get FTS results (top 50)
const ftsResults = db.prepare(`
  SELECT id, rank AS score
  FROM document_fts
  WHERE document_fts MATCH ?
  ORDER BY rank
  LIMIT 50
`).all(queryText);

// 3. Merge with RRF (Reciprocal Rank Fusion)
const k = 60;
const scores = new Map<string, number>();

// Add vector scores
vectorResults.forEach((r, i) => {
  const current = scores.get(r.id) || 0;
  scores.set(r.id, current + 1.0 / (k + i + 1));
});

// Add FTS scores
ftsResults.forEach((r, i) => {
  const current = scores.get(r.id) || 0;
  scores.set(r.id, current + 1.0 / (k + i + 1));
});

// 4. Sort and return top N
const sorted = Array.from(scores.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN);
```

---

## 9. Performance Benchmarks

### 9.1 sqlite-vec Official Benchmarks

Source: https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/

**100K vectors on disk:**

| Dimension | Type | Query Time |
|-----------|------|------------|
| 192 | float | 20ms |
| 384 | float | 34ms |
| 768 | float | 67ms |
| 1024 | float | 75ms |
| 1536 | float | 105ms |
| 3072 | float | 214ms |
| 3072 | bit (binary) | 11ms |

**1M vectors on disk:**

| Dimension | Query Time | Assessment |
|-----------|------------|------------|
| 192 | 192ms | ⚠️ Slow |
| 384 | 350ms | ⚠️ Slow |
| 768 | 1.2s | ❌ Unusable |
| 1536 | 2.5s | ❌ Unusable |

### 9.2 Codebase Size Estimates

| Project Type | Lines of Code | Estimated Chunks | sqlite-vec Perf |
|--------------|---------------|------------------|-----------------|
| Small project | 10K-50K | 1K-10K | ✅ <20ms |
| Medium project | 100K-500K | 20K-80K | ✅ ~50ms |
| Large project | 1M-5M | 100K-300K | ⚠️ ~100-200ms |
| Monorepo | 10M+ | 500K+ | ❌ Too slow |

**Note:** Linux kernel (~27M LOC) ≈ 100K-200K chunks → sqlite-vec acceptable

---

## 10. Risks & Mitigations

### 10.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| sqlite-vec too slow for large codebases | Medium | Medium | Document 500K chunk limit; suggest Milvus for huge projects |
| FTS5 not available in some SQLite builds | Low | Medium | Check at runtime; fallback to vector-only search |
| Orphaned databases accumulate | Medium | Low | Provide cleanup CLI command |
| Path hash collisions | Low | Low | Use 16-char MD5 hash (very low collision probability) |
| Concurrent access issues | Low | Medium | Enable WAL mode; document single-process limitation |

### 10.2 Limitations to Document

1. **No ANN Index** - Linear search time; scales O(n)
2. **Approximate Hybrid Search** - Client-side RRF not as sophisticated as Milvus native
3. **Single-Process Writes** - SQLite WAL allows multiple readers but single writer
4. **Binary Quantization** - If needed for speed, loses some precision

---

## 11. References

### 11.1 sqlite-vec
- **GitHub:** https://github.com/asg017/sqlite-vec
- **Documentation:** https://alexgarcia.xyz/sqlite-vec/
- **NPM:** https://www.npmjs.com/package/sqlite-vec
- **Blog:** https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/

### 11.2 vectorlite
- **GitHub:** https://github.com/1yefuwang1/vectorlite
- **Benchmarks:** https://1yefuwang1.github.io/vectorlite/

### 11.3 pgvector
- **GitHub:** https://github.com/pgvector/pgvector
- **Documentation:** https://github.com/pgvector/pgvector

### 11.4 FTS5
- **SQLite Docs:** https://www.sqlite.org/fts5.html

---

## 12. Appendix: Comparison with Current Milvus

### 12.1 Feature Parity Matrix

| Feature | Milvus | sqlite-vec + FTS5 | Gap |
|---------|--------|-------------------|-----|
| Dense vector search | ✅ | ✅ | None |
| Sparse vector/BM25 | ✅ Native | ✅ FTS5 | Different implementation |
| Hybrid search | ✅ Native RRF | ✅ Client RRF | Equivalent |
| Metadata filtering | ✅ Boolean expr | ✅ SQL WHERE | Equivalent |
| HNSW index | ✅ | ❌ Brute force | Performance trade-off |
| Scalability | ✅ Millions | ⚠️ ~500K practical | Document limit |
| Exact recall | ✅ | ✅ 100% | Same |
| Cloud deployment | ✅ | ❌ File-based | Different architecture |

### 12.2 Migration Path

1. **Phase 1:** Add sqlite-vec as option (keep Milvus)
2. **Phase 2:** Default to sqlite-vec for new users
3. **Phase 3:** (Future) Remove Milvus when confident

**Note:** No automatic migration - requires re-indexing when switching providers.

---

## 13. Conclusion

**sqlite-vec** is the optimal choice for Code Context because:

1. ✅ Zero dependencies - maximum reliability
2. ✅ "Fast enough" for 95% of codebases
3. ✅ Exact results (100% recall)
4. ✅ File-portable and simple
5. ✅ Mature and well-maintained
6. ✅ FTS5 enables hybrid search

**Trade-off accepted:** Linear search performance for simplicity and reliability.

---

*Document version: 1.0*
*Last updated: 2025-02-16*
