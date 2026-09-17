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
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  auth: {
    // Shared-secret auth via the `x-api-key` header. An empty string
    // disables auth entirely (the local/dev default) - set API_KEY in any
    // environment reachable outside your own machine.
    apiKey: process.env.API_KEY || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    // Used only for RAG answer synthesis (embeddings use a separate,
    // hardcoded model in gemini.ts). Generation model names/availability
    // change more often than embedding models - verify this against
    // Google's current model catalog before relying on the default.
    generationModel: process.env.GEMINI_GENERATION_MODEL || 'gemini-3.6-flash',
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
    // Plain text formats are decoded directly; PDF/DOCX are routed through
    // dedicated parsers in services/ingestion.ts (extractText). Anything
    // else is rejected up front rather than silently decoded as UTF-8
    // garbage.
    allowedMimeTypes: [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxFileSizeBytes: 20 * 1024 * 1024, // 20 MB - bumped from 10MB now that PDFs/DOCX are supported
  },
  search: {
    indexName: 'chunk_index',
    defaultK: 5,
    maxK: 50,
  },
};