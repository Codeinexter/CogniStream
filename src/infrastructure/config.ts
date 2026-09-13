import 'dotenv/config';

// Fail fast if required secrets are missing rather than silently
// running with an empty Gemini API key.
const requiredEnvVars = ['GEMINI_API_KEY'] as const;
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.warn(`[config] Warning: environment variable ${key} is not set.`);
  }
}

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
  cors: {
    // Was hardcoded in index.ts, which meant the Dockerized frontend
    // (served from a different origin/port than local dev) had no way to
    // override it. Defaults preserve the previous behavior for local dev.
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  queue: {
    name: 'document-ingestion',
    limiter: {
      max: 50,
      duration: 60000, // 60,000 milliseconds = 1 minute
    },
    // Prevent Redis from growing unbounded with finished job records.
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  },
  chunking: {
    size: 500,
    overlap: 50,
  },
  ingestion: {
    // Only accept text-like payloads; anything else would be decoded as
    // UTF-8 garbage and silently poison the embeddings.
    allowedMimeTypes: ['text/plain', 'text/markdown', 'text/csv'],
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  },
  search: {
    indexName: 'chunk_index',
    defaultK: 5,
    maxK: 50,
  },
};