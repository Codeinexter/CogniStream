import { Redis } from 'ioredis';
import { config } from './config.js';

// Establish the connection to Redis Stack
export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Create the HNSW vector index if it does not already exist
export async function initializeRedisSchema(): Promise<void> {
  try {
    await redisClient.call(
      'FT.CREATE',
      'chunk_index',
      'ON',
      'HASH',
      'PREFIX', '1', 'chunk:',
      'SCHEMA',
      'docId', 'TAG',
      'chunk_id', 'NUMERIC',
      'text_chunk', 'TEXT',
      'embedding', 'VECTOR', 'HNSW', '6',
        'TYPE', 'FLOAT32',
        'DIM', '768',
        'DISTANCE_METRIC', 'COSINE'
    );
    console.log('Redis vector index created successfully.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Ignore the error if the index survives a container restart via AOF persistence
    if (message.includes('Index already exists')) {
      console.log('Redis vector index already exists. Skipping creation.');
    } else {
      console.error('Failed to create Redis index:', error);
      throw error;
    }
  }
}
