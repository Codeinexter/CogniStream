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

// Separate model/instance for RAG answer synthesis - embeddings and text
// generation are different model families and are configured independently.
const generationModel = ai.getGenerativeModel({ model: config.gemini.generationModel });

// Keeps the prompt within a sane size regardless of how many/how long the
// retrieved chunks are, rather than concatenating an unbounded context.
const MAX_CONTEXT_CHARS = 12000;

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

/**
 * Synthesizes a natural-language answer to `query`, grounded only in the
 * supplied context chunks (typically the top-k search results). The prompt
 * explicitly instructs the model to say so rather than guess when the
 * context is insufficient, to reduce (not eliminate) hallucination risk.
 */
export async function generateAnswer(query: string, contextChunks: string[]): Promise<string> {
  const context = contextChunks.join('\n\n---\n\n').slice(0, MAX_CONTEXT_CHARS);

  const prompt = [
    'Answer the question using ONLY the context below. If the context does not contain',
    'enough information to answer, say so explicitly instead of guessing.',
    '',
    `Context:\n${context}`,
    '',
    `Question: ${query}`,
  ].join('\n');

  try {
    const result = await generationModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Failed to generate answer:', error);
    throw error instanceof Error ? error : new Error('Answer generation failed');
  }
}