# Basic Usage Example

This example demonstrates the basic usage of Code Context.

## Prerequisites

1. **OpenAI API Key**: Set your OpenAI API key for embeddings:
   ```bash
   export OPENAI_API_KEY="your-openai-api-key"
   ```

2. **SQLite-vec**: No additional setup needed! Vector data is stored locally in SQLite files.

## Running the Example

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set environment variables (see examples above)

3. Run the example:
   ```bash
   pnpm run start
   ```

## What This Example Does
1. **Indexes Codebase**: Indexes the entire Code Context project
2. **Performs Searches**: Executes semantic searches for different code patterns
3. **Shows Results**: Displays search results with similarity scores and file locations

## Expected Output

```
🚀 Code Context Real Usage Example
===============================
...
🔌 Connecting to vector database at: ...

📖 Starting to index codebase...
🗑️  Existing index found, clearing it first...
📊 Indexing stats: 45 files, 234 code chunks

🔍 Performing semantic search...

🔎 Search: "vector database operations"
   1. Similarity: 89.23%
      File: /path/to/packages/core/src/vectordb/sqlite-vec-vectordb.ts
      Language: typescript
      Lines: 147-177
      Preview: async search(collectionName: string, queryVector: number[], options?: SearchOptions)...

🎉 Example completed successfully!
```
