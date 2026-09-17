# CogniStream

**Asynchronous document ingestion and semantic search / RAG pipeline.**

CogniStream lets you upload documents (PDF, DOCX, TXT, Markdown, CSV), processes them asynchronously through a Redis-backed job queue, embeds them with Google Gemini, and stores the vectors in Redis Stack's RediSearch HNSW index — enabling both raw semantic search and grounded Retrieval-Augmented Generation (RAG) question answering.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)
![License](https://img.shields.io/badge/license-ISC-blue)

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Run with Docker Compose (recommended)](#run-with-docker-compose-recommended)
  - [Run Locally Without Docker](#run-locally-without-docker)
- [API Reference](#api-reference)
- [Frontend](#frontend)
- [How It Works](#how-it-works)
  - [Ingestion Pipeline](#ingestion-pipeline)
  - [Chunking Strategy](#chunking-strategy)
  - [Vector Storage & Retrieval](#vector-storage--retrieval)
  - [RAG Answer Synthesis](#rag-answer-synthesis)
- [Design Decisions & Trade-offs](#design-decisions--trade-offs)
- [Known Limitations](#known-limitations)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why This Exists

Synchronously embedding a document inside an HTTP request doesn't scale — response time grows with document size, and a slow/rate-limited embedding API turns into cascading request timeouts. CogniStream decouples **upload** from **processing**: the API accepts a file, hands it to a background worker via a job queue, and returns immediately. The client polls job status (or the UI does it for you) while chunking and embedding happen out-of-band.

This also isolates failure domains — a transient embedding-API outage delays a job, it doesn't drop the upload or take down the API.

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │        React Frontend         │
                         │  (Vite, TanStack Query, Zustand)
                         └───────────────┬────────────────┘
                                          │ REST (fetch)
                                          ▼
┌───────────────────────────────────────────────────────────────┐
│                        Express API (index.ts)                  │
│  POST /ingest  → multer → extractText() → enqueue BullMQ job   │
│  POST /search  → embed query → RediSearch KNN                 │
│  POST /ask     → embed query → KNN → Gemini generation        │
│  GET  /jobs/:id → BullMQ job status                            │
│  GET  /documents, DELETE /documents/:id                        │
└───────────────────────────┬────────────────────────────────────┘
                             │ enqueue
                             ▼
                    ┌─────────────────┐
                    │   BullMQ Queue   │   (Redis-backed)
                    │  document-ingestion
                    └────────┬─────────┘
                             │ dequeue
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                  Background Worker (processor.ts)               │
│  1. chunkDocument()   — RecursiveCharacterTextSplitter          │
│  2. generateEmbedding() per chunk — Gemini embedding-001         │
│  3. Write chunk:{docId}:{i} hash → Redis (indexed by RediSearch) │
│  4. saveDocumentMetadata() — only after ALL chunks are written   │
└───────────────────────────┬────────────────────────────────────┘
                             ▼
                  ┌────────────────────────┐
                  │      Redis Stack        │
                  │  - Job queue storage    │
                  │  - chunk:* hashes       │
                  │  - RediSearch HNSW index│
                  │    (chunk_index)        │
                  └────────────────────────┘
```

**Flow summary:**

1. Client uploads a file → API extracts raw text synchronously (cheap) and enqueues a job (expensive part deferred).
2. API responds `202 Accepted` with a `jobId` immediately — no blocking on embedding.
3. A separate worker process pulls the job, chunks the text, embeds each chunk via Gemini, and writes it to Redis as a HASH that RediSearch automatically indexes.
4. Document metadata is only written to the registry **after every chunk succeeds**, so partially-processed documents never appear as "ready."
5. Frontend polls `GET /jobs/:id` until the job is `completed` or `failed`, then refreshes the document list.
6. Search/Ask endpoints embed the query with the same model and run a `KNN` search over the HNSW index; `/ask` additionally feeds retrieved chunks into Gemini for a grounded natural-language answer.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API server | Node.js, TypeScript (strict), Express 5 |
| Job queue | BullMQ (Redis-backed) |
| Vector store | Redis Stack (RediSearch, HNSW index, cosine distance) |
| Embeddings | Google Gemini (`gemini-embedding-001`, 768-dim) |
| RAG generation | Google Gemini (configurable generation model) |
| Text extraction | `pdf-parse` (PDF), `mammoth` (DOCX), native decode (TXT/MD/CSV) |
| Chunking | LangChain `RecursiveCharacterTextSplitter` |
| File upload | Multer (in-memory storage) |
| Frontend | React 19, Vite, TypeScript |
| Frontend state/data | TanStack Query (server state), Zustand (job queue state) |
| UI | Tailwind CSS v4, shadcn-style components, Base UI primitives, lucide-react icons |
| Containerization | Docker, Docker Compose |

---

## Project Structure

```
cognistream/
├── src/
│   ├── index.ts                    # Express app entrypoint
│   ├── api/
│   │   ├── routes.ts                # Route definitions
│   │   └── controllers.ts           # Request handlers (ingest, search, ask, jobs, documents)
│   ├── infrastructure/
│   │   ├── config.ts                # Centralized env-driven configuration
│   │   ├── redis.ts                 # Redis client + RediSearch index bootstrap
│   │   ├── queue.ts                 # BullMQ Queue instance
│   │   ├── documents.ts             # Document metadata registry (Redis sorted set + hashes)
│   │   └── gemini.ts                # Embedding + generation model wrappers
│   ├── services/
│   │   ├── ingestion.ts             # Text extraction + chunking
│   │   └── search.ts                # Vector search + reply parsing
│   └── workers/
│       └── processor.ts             # BullMQ Worker — chunk → embed → store pipeline
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── cognistream-ui/                  # React frontend (separate package)
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── DocumentUploader.tsx
    │   │   ├── ProgressTracker.tsx
    │   │   ├── DocumentList.tsx
    │   │   ├── AskAI.tsx
    │   │   ├── SemanticSearch.tsx
    │   │   └── ui/                  # shadcn-style primitives (button, card, input, progress, toast)
    │   ├── lib/
    │   │   ├── api.ts               # Typed fetch client for the backend API
    │   │   └── utils.ts
    │   ├── store/
    │   │   └── useJobStore.ts       # Zustand store tracking ingestion job(s)
    │   └── hooks/
    │       └── use-toast.ts
    ├── vite.config.ts
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Docker & Docker Compose** (recommended path), *or* a local Redis Stack instance if running without Docker
- A **Google Gemini API key** — [Google AI Studio](https://aistudio.google.com/)

### Environment Variables

Create a `.env` file at the project root (see `.env.example` if present):

```bash
# Server
PORT=3000
CORS_ORIGIN=http://localhost:5173

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_GENERATION_MODEL=gemini-3.6-flash   # optional override, verify against current Gemini model catalog

# Optional auth (leave unset to disable)
API_KEY=

# Optional rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

For the frontend (`cognistream-ui/.env`):

```bash
VITE_API_URL=http://localhost:3000/api/v1
VITE_API_KEY=   # only needed if the backend API_KEY is set
```

> ⚠️ **Never commit real API keys.** Rotate any key that has been shared or committed.

### Run with Docker Compose (recommended)

This spins up Redis Stack, the API, the worker, and the frontend as separate containers:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| RedisInsight | http://localhost:8001 |

Stop everything with `docker compose down` (add `-v` to also wipe the Redis volume).

### Run Locally Without Docker

**1. Start Redis Stack** (must include RediSearch — the standard `redis-server` will not work):

```bash
docker run -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
```

**2. Install and run the backend:**

```bash
npm install
npm run dev        # API server with hot reload (tsx --watch)
```

In a second terminal, start the worker:

```bash
npm run worker      # background ingestion worker with hot reload
```

**3. Install and run the frontend:**

```bash
cd cognistream-ui
npm install
npm run dev
```

Visit **http://localhost:5173**.

---

## API Reference

Base path: `/api/v1`

### `POST /ingest`

Upload a document for asynchronous ingestion.

- **Content-Type:** `multipart/form-data`
- **Body field:** `file`
- **Accepted MIME types:** `text/plain`, `text/markdown`, `text/csv`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **Max size:** 20 MB

**Response `202 Accepted`:**
```json
{ "jobId": "1" }
```

### `GET /jobs/:id`

Poll the status of an ingestion job.

**Response `200 OK`:**
```json
{
  "id": "1",
  "state": "active",
  "progress": 45,
  "result": null,
  "error": null
}
```
`state` is one of `waiting | active | completed | failed`. On `completed`, `result` contains `{ docId, totalChunks, filename }`.

### `POST /search`

Semantic vector search over ingested chunks.

**Body:**
```json
{ "query": "How does chunking work?", "k": 5 }
```
`k` is optional (default `5`, max `50`).

**Response `200 OK`:**
```json
{
  "query": "How does chunking work?",
  "k": 5,
  "results": [
    { "docId": "…", "text": "…", "score": 0.83 }
  ]
}
```
`score` is a normalized similarity in `[0, 1]` (higher = more relevant).

### `POST /ask`

RAG question answering — retrieves top-k chunks and asks Gemini to answer grounded only in that context.

**Body:** same shape as `/search`.

**Response `200 OK`:**
```json
{
  "query": "How does chunking work?",
  "answer": "…",
  "sources": [
    { "docId": "…", "text": "…", "score": 0.83 }
  ]
}
```

### `GET /documents`

List all fully-ingested documents (newest first).

```json
{
  "documents": [
    { "docId": "…", "filename": "notes.pdf", "mimeType": "application/pdf", "totalChunks": 12, "createdAt": "2026-09-01T12:00:00.000Z" }
  ]
}
```

### `DELETE /documents/:id`

Deletes a document's metadata record **and** all of its chunk vectors.

```json
{ "docId": "…", "deleted": true }
```

### Authentication

If `API_KEY` is set on the server, every request must include:

```
x-api-key: <API_KEY>
```

Leave `API_KEY` unset to disable auth (default for local/dev).

---

## Frontend

A single-page dashboard (`App.tsx`) composing:

- **`DocumentUploader`** — drag-and-drop or click-to-browse upload with client-side size/type pre-checks.
- **`ProgressTracker`** — polls the active ingestion job and renders a live progress bar, with a FIFO queue so multiple sequential uploads display correctly one at a time.
- **`DocumentList`** — polls `/documents` every 5s, supports deletion.
- **`AskAI`** — RAG Q&A panel showing the synthesized answer plus cited source chunks.
- **`SemanticSearch`** — raw vector search with similarity-score badges.

State is split deliberately: **TanStack Query** owns all server state (documents, job status, search/ask results) with polling/caching/invalidation; **Zustand** (`useJobStore`) owns only the transient client-side concern of "which job(s) are currently being tracked in the UI."

---

## How It Works

### Ingestion Pipeline

1. `POST /ingest` receives the file via Multer (in-memory buffer, MIME-filtered, size-capped).
2. `extractText()` converts the buffer to plain text:
   - `text/plain`, `text/markdown`, `text/csv` → direct UTF-8 decode
   - `application/pdf` → `pdf-parse`
   - `.docx` → `mammoth` (`extractRawText`)
3. The raw text + filename + mimetype are pushed onto the `document-ingestion` BullMQ queue. The API returns immediately with a job ID — it never waits on chunking or embedding.
4. The worker (a separate process) dequeues the job and runs it through chunking → embedding → storage → metadata registration (see below).

### Chunking Strategy

Uses LangChain's `RecursiveCharacterTextSplitter`:

- **Chunk size:** 500 characters
- **Overlap:** 50 characters (10%)

Recursive splitting tries to break on paragraph → sentence → word boundaries in that order, minimizing the chance of severing a sentence mid-thought (which would degrade embedding quality). The overlap ensures facts that fall near a chunk boundary remain retrievable regardless of which chunk "wins" the split.

### Vector Storage & Retrieval

Each chunk is written as a Redis HASH:

```
chunk:{docId}:{index} → { docId, chunk_id, text_chunk, embedding }
```

`embedding` is a raw `Float32Array` buffer (768 dimensions), matching the RediSearch HNSW schema:

```
FT.CREATE chunk_index ON HASH PREFIX 1 chunk:
  SCHEMA
    docId TAG
    chunk_id NUMERIC
    text_chunk TEXT
    embedding VECTOR HNSW 6
      TYPE FLOAT32
      DIM 768
      DISTANCE_METRIC COSINE
```

RediSearch indexes/deindexes hashes reactively on write/delete — no manual `FT.ADD`/`FT.DEL` calls are needed.

Search queries run:

```
FT.SEARCH chunk_index "*=>[KNN {k} @embedding $BLOB AS vector_score]"
  PARAMS 2 BLOB <query_vector>
  SORTBY vector_score
  RETURN 3 docId text_chunk vector_score
  DIALECT 2
```

> **Note:** `k` must be inlined as a literal integer in the query string — passing it as a `$K` parameter silently binds to nothing in RediSearch and returns zero results with no error.

Raw cosine distance is converted to a public `[0, 1]` similarity score via `distanceToSimilarity()` (`1 - distance`, clamped) before reaching the API/UI.

### RAG Answer Synthesis

`/ask` retrieves the top-k chunks exactly as `/search` does, concatenates their text (capped at 12,000 characters to bound prompt size), and sends it to Gemini with an explicit instruction to answer **only** from the provided context and say so if the context is insufficient — reducing (not eliminating) hallucination risk.

Embedding and generation use **separate Gemini model instances**, since the embedding model must stay fixed for the lifetime of an index (changing it requires re-embedding all stored vectors), while the generation model can be swapped freely via `GEMINI_GENERATION_MODEL` without touching stored data.

---

## Design Decisions & Trade-offs

| Decision | Rationale |
|---|---|
| **BullMQ (Redis) over Kafka/RabbitMQ** | No need for event replay or multiple consumer groups — this is a task queue, not an event stream. Reusing Redis (already the vector store) avoids a second infra dependency. |
| **Redis Stack over Pinecone/PGVector** | Co-locates queue + vector storage in one component. Trade-off: no managed sharding/replication at Pinecone's scale, and no relational guarantees like PGVector-on-Postgres — acceptable for this project's scope. |
| **In-memory Multer storage** | Simpler code, no disk cleanup, but caps practical upload size and concurrent-upload memory footprint (hence the 20 MB limit). |
| **Character-based chunking (not token-based)** | Simple and library-native, but doesn't perfectly align with the embedding model's token boundaries — effective chunk size in tokens varies with content density. |
| **Worker-side rate limiting (`limiter: { max: 50, duration: 60000 }`)** | Throttles *consumption*, which is what actually protects the downstream Gemini quota — throttling producers would just make jobs pile up without helping. |
| **Metadata written only after all chunks succeed** | Guarantees no partially-indexed document ever appears in `GET /documents` — at the cost of orphaned chunk keys if a worker crashes mid-document (see below). |

---

## Known Limitations

These are deliberate scope boundaries, not oversights — listed here for transparency:

- **No content-based deduplication.** Re-uploading the same file creates a fully duplicate document and chunk set.
- **No formal dead-letter queue.** Failed jobs are retained (`removeOnFail: { count: 5000 }`) and inspectable via BullMQ, but there's no dedicated DLQ stream or alerting integration.
- **No orphaned-chunk cleanup.** A worker crash mid-document can leave `chunk:*` hashes in Redis with no corresponding document record and no automatic reaper.
- **No index rebuild tooling.** Changing the embedding model or vector dimensionality requires manually dropping the index and re-ingesting original source files (which are not retained after processing — only chunked/embedded text is kept).
- **`express-rate-limit` is a declared dependency but not currently wired into the API routes** — the only real rate limiting today is worker-side, protecting the Gemini quota.
- **Single shared API key, optional.** No per-user scoping or key rotation — fine for local/dev, not multi-tenant production-ready.
- **PDF/DOCX extraction is plain-text only.** Tables, multi-column layouts, and embedded images are not specially handled.

---

## Testing

```bash
npm test
```

Runs the built-in Node.js test runner (`tsx --test`) against `src/**/*.test.ts`, covering chunking behavior and text-extraction edge cases (empty input, unsupported mimetypes, whitespace trimming).

---

## Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Start the API server with hot reload |
| `npm run worker` | Start the ingestion worker with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled API server |
| `npm run start:worker` | Run the compiled worker |
| `npm run typecheck` | Type-check without emitting output |
| `npm test` | Run the test suite |

Frontend (`cognistream-ui/`):

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and production-build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

---

## Roadmap

- [ ] Content-hash based upload deduplication
- [ ] Dead-letter queue with alerting (Slack/Datadog/Sentry integration on `worker.on('failed')`)
- [ ] Scheduled reaper for orphaned chunk keys
- [ ] Reindex/backfill CLI for embedding-model or dimensionality changes
- [ ] Wire up `express-rate-limit` on public routes
- [ ] Per-key/per-user auth scoping
- [ ] Token-aware chunking (align splits to the embedding model's tokenizer)
- [ ] Citation/groundedness scoring on RAG answers

---

## License

ISC
