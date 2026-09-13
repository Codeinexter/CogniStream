import { Job, Worker } from 'bullmq';
import crypto from 'crypto';
import { config } from '../infrastructure/config.js';
import { generateEmbedding } from '../infrastructure/gemini.js';
import { redisClient } from '../infrastructure/redis.js';
import { chunkDocument } from '../services/ingestion.js';

// Interface defining the exact shape of job data in the BullMQ queue
interface IngestionJobData {
  filename: string;
  text: string;
}

// Instantiate the background worker bound to the 'document-ingestion' queue
const worker = new Worker<IngestionJobData>(
  config.queue.name,
  async (job: Job<IngestionJobData>) => {
    const { text, filename } = job.data;

    // Guard check to guarantee the text buffer is non-empty
    if (!text) {
      throw new Error('Invalid job payload: document text is missing');
    }

    // Unique UUID assigned to group all chunks under one document
    const docId = crypto.randomUUID();

    // 1. Chunking Phase
    await job.updateProgress(10);
    const chunks = await chunkDocument(text);
    await job.updateProgress(30);

    // 2. Vectorization & Storage Phase
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      if (chunkText === undefined) {
        throw new Error(`Invalid chunk at index ${i}`);
      }
      const vectorBuffer = await generateEmbedding(chunkText);
      const chunkKey = `chunk:${docId}:${i}`;

      // Save chunk text, metadata, and 768D float vector buffer into Redis
      await redisClient.hset(chunkKey, {
        docId: docId,
        chunk_id: i,
        text_chunk: chunkText,
        embedding: vectorBuffer,
      });

      // Calculate dynamic percentage and update telemetry
      const progress = 30 + Math.floor(((i + 1) / chunks.length) * 70);
      await job.updateProgress(progress);
    }

    return { docId, totalChunks: chunks.length, filename };
  },
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
    },
    limiter: config.queue.limiter,
  }
);

// Event Listeners for Worker Telemetry
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully! Embedded ${job.returnvalue?.totalChunks} chunks.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err.message);
});

console.log('Background worker started and polling for jobs...');

// Graceful shutdown so in-flight jobs aren't killed mid-embedding when the
// container receives a stop signal.
const shutdown = async (signal: string) => {
  console.log(`${signal} received, closing worker...`);
  await worker.close();
  await redisClient.quit();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
