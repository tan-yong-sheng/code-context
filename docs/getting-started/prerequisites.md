# Prerequisites

Before setting up Code Context, ensure you have the following requirements met.

## Required Services

### Embedding Provider (Choose One)

#### Option 1: OpenAI (Recommended)
- **API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Billing**: Active billing account required
- **Models**: `text-embedding-3-small` or `text-embedding-3-large`
- **Rate Limits**: Check current limits on your OpenAI account

#### Option 2: VoyageAI
- **API Key**: Get from [VoyageAI Console](https://dash.voyageai.com/)
- **Models**: `voyage-code-3` (optimized for code)
- **Billing**: Pay-per-use pricing

#### Option 3: Gemini
- **API Key**: Get from [Google AI Studio](https://aistudio.google.com/)
- **Models**: `gemini-embedding-001`
- **Quota**: Check current quotas and limits

#### Option 4: Ollama (Local)
- **Installation**: Download from [ollama.ai](https://ollama.ai/)
- **Models**: Pull embedding models like `nomic-embed-text`
- **Hardware**: Sufficient RAM for model loading (varies by model)

### Vector Database

#### SQLite-vec (Default - Zero Config)
- **No setup required**: Uses local SQLite files for vector storage
- **Storage location**: `~/.code-context/vectors/` (configurable)
- **Features**: Hybrid search with BM25 + dense vector
- **Best for**: Local development, offline usage, simple deployments

## Development Tools (Optional)

### For Development Contributions
- **Git**: For version control
- **pnpm**: Package manager (preferred over npm)
- **TypeScript**: Understanding of TypeScript development
