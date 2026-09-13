import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

// Must match the Redis HNSW schema's DIM in redis.ts - if these two ever
// drift apart, RediSearch does NOT throw on write; it silently excludes
// the mismatched hash from the vector index, so KNN searches return zero
// hits with no error anywhere, even though the hash's other fields exist.
const EMBEDDING_DIMENSIONS = 768;

const ai = new GoogleGenerativeAI(config.gemini.apiKey);

// Update model name to the current standard embedding model
const embeddingModel = ai.getGenerativeModel({ model: 'gemini-embedding-001' });

/**
 * Generates a 768-dimensional embedding vector for input text
 * and converts it to a Float32 binary Buffer for RediSearch HNSW storage.
 */
export async function generateEmbedding(text: string): Promise<Buffer> {
  try {
    const result = await embeddingModel.embedContent({
      content: { role: 'user', parts: [{ text }] },
      // gemini-embedding-001 natively returns a much larger vector (it
      // supports Matryoshka truncation to 768/1536/3072). Requesting
      // outputDimensionality gets a properly truncated + re-normalized
      // 768-dim embedding instead of us naively slicing the raw output.
      // The SDK's TS types don't declare this field yet, hence the cast.
      ...({ outputDimensionality: EMBEDDING_DIMENSIONS } as Record<string, unknown>),
    });

    const values = result.embedding.values;

    // Defend against a dimension mismatch instead of silently writing a
    // malformed vector to Redis (see comment on EMBEDDING_DIMENSIONS above).
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${values.length}. ` +
          'Check the Gemini model / outputDimensionality setting against the Redis index schema.'
      );
    }

    // Convert array to Float32Array and then to a Buffer for binary Redis ingestion
    const floatArray = new Float32Array(values);
    return Buffer.from(floatArray.buffer);
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    throw error instanceof Error ? error : new Error('Embedding generation failed');
  }
}
