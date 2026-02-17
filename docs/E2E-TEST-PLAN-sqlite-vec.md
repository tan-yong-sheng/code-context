# E2E Test Plan: sqlite-vec Vector Database

**Status:** Planned
**Last Updated:** 16 Feb 2026, 6:42pm UTC+8
**Note:** Do not proceed with removal of Milvus/VSCode/Chrome extension logic as of this date. This test plan is for future implementation.

---

## Objective

Create comprehensive end-to-end tests for the sqlite-vec vector database implementation that validate:
- Path management and storage
- Vector database CRUD operations
- Hybrid search functionality
- Integration with Context class
- Real-world codebase indexing scenarios

**Out of scope:** Milvus, VSCode extension, Chrome extension (to be removed in future - NOT NOW)

---

## Test Scenarios

### 1. Path Management Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| `getVectorDbPath()` | Generates database path from codebase path | Returns path in `~/.code-context/vectors/{hash}.db` |
| Hash determinism | Same path always produces same hash | Identical hashes for identical paths |
| Path uniqueness | Different paths produce different hashes | Different hashes for different paths |
| Path mappings | Mappings JSON is created and readable | JSON file exists with correct hash→path mapping |
| Cleanup orphaned | `cleanupOrphanedDatabases()` removes orphaned DBs | Deleted databases removed, existing kept |
| List databases | `listAllVectorDbs()` returns metadata | Array with hash, path, size, lastModified |

### 2. Database Operations Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create collection | `createCollection()` with dimension | vec0 virtual table created with correct schema |
| Create hybrid | `createCollection()` hybrid mode | vec0 + FTS5 tables created |
| Has collection | `hasCollection()` check | Returns true for existing, false for non-existing |
| Insert documents | `insert()` with vectors and metadata | Documents stored correctly |
| Vector search | `search()` with query vector | Results ordered by cosine similarity |
| Filtered search | `search()` with `filterExpr` | SQL WHERE clause applied correctly |
| Delete documents | `delete()` by IDs | Documents removed from DB |
| SQL query | `query()` with filters | Matching documents returned |
| Drop collection | `dropCollection()` | Tables removed from database |

### 3. Hybrid Search Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Hybrid execution | `hybridSearch()` with vector + text | Both searches executed |
| RRF scoring | Reciprocal Rank Fusion calculation | Combined scores calculated correctly (1/(k+rank)) |
| Result merging | Semantic + keyword results merged | Top-K results include both types |
| Ranking | Results properly ranked by RRF score | Highest combined scores first |
| FTS5 fallback | When FTS5 unavailable | Graceful fallback to vector-only search |

### 4. Context Integration Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Index codebase | `Context.indexCodebase()` | Files indexed to sqlite-vec database |
| Semantic search | `Context.semanticSearch()` | Relevant code chunks found |
| Filtered search | Search with `filterExpr` | Results filtered by file extension |
| Re-index | Re-indexing same codebase | Data updated, not duplicated |
| Multi-codebase | Index multiple projects | Each project isolated in separate DB |

### 5. Real-world Scenario Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| TypeScript project | Index ~20 TS files | All files indexed, searchable |
| Python project | Index ~20 Python files | All files indexed, searchable |
| Semantic similarity | Search finds similar code | Conceptually related code found |
| Hybrid search | Keyword + semantic query | Both types of matches returned |
| Extension filter | Search with `.ts` filter | Only TypeScript files returned |
| Cross-project isolation | Search in project A | Results from project B not included |

---

## Test Data Structure

### Mock Embedding Provider

```typescript
const MOCK_EMBEDDING_DIMENSION = 1536;

const mockEmbed = (text: string): number[] => {
  // Deterministic mock based on text content
  return Array(MOCK_EMBEDDING_DIMENSION).fill(0).map((_, i) =>
    (text.charCodeAt(i % text.length) / 255) - 0.5
  );
};
```

### Test Fixtures

```
packages/core/e2e/fixtures/
├── typescript-project/
│   ├── src/
│   │   ├── utils.ts          # String utilities
│   │   ├── parser.ts         # Code parser
│   │   └── index.ts          # Main entry
│   └── package.json
├── python-project/
│   ├── src/
│   │   ├── utils.py          # String utilities
│   │   ├── parser.py         # Code parser
│   │   └── main.py           # Main entry
│   └── requirements.txt
└── mixed-project/
    ├── src/
    │   ├── helper.ts
    │   └── helper.py
    └── README.md
```

---

## Implementation Phases

### Phase 1: Test Infrastructure
- [ ] Set up Jest configuration for E2E tests
- [ ] Create mock embedding provider
- [ ] Create test fixtures
- [ ] Set up temp directory management

### Phase 2: Path Management Tests
- [ ] Test path generation
- [ ] Test hash determinism
- [ ] Test path mappings
- [ ] Test cleanup utilities

### Phase 3: Database Operations Tests
- [ ] Test collection creation
- [ ] Test CRUD operations
- [ ] Test search with filters
- [ ] Test hybrid collection

### Phase 4: Hybrid Search Tests
- [ ] Test RRF calculation
- [ ] Test result merging
- [ ] Test ranking
- [ ] Test fallback

### Phase 5: Context Integration Tests
- [ ] Test indexing
- [ ] Test searching
- [ ] Test filtering
- [ ] Test multi-codebase

### Phase 6: Real-world Scenario Tests
- [ ] Test with TypeScript project
- [ ] Test with Python project
- [ ] Test semantic similarity
- [ ] Test cross-project isolation

---

## Dependencies

```json
{
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "jest": "^30.0.0",
    "ts-jest": "^29.4.0",
    "tmp": "^0.2.3",
    "@types/tmp": "^0.2.6"
  }
}
```

---

## GitHub Actions Integration

See `.github/workflows/e2e-test.yml` for automated test execution.

---

## Notes

- Tests should clean up temp databases after execution
- Use unique temp directories for concurrent test safety
- Mock embedding provider for speed and determinism
- Tests should not depend on external APIs (OpenAI, etc.)

---

**Reminder:** Do not remove Milvus, VSCode extension, or Chrome extension logic as of 16 Feb 2026, 6:42pm UTC+8. This test plan is for future implementation only.
