import { config } from '../infrastructure/config.js';
import { generateEmbedding } from '../infrastructure/gemini.js';
import { redisClient } from '../infrastructure/redis.js';

export interface SearchResult {
  chunkKey: string;
  docId: string;
  textChunk: string;
  /** Vector distance for the configured metric (COSINE) - lower is closer. */
  score: number;
}

/**
 * Embeds a plain-text query with the same model used at ingestion time,
 * then runs a K-Nearest-Neighbors search over the chunk_index HNSW field
 * to find the most semantically similar chunks.
 */
export async function searchVectors(query: string, k: number): Promise<SearchResult[]> {
  if (!query.trim()) {
    throw new Error('Query text must not be empty');
  }
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error('k must be a positive integer');
  }

  // Same embedding model/dimensionality as ingestion, so the query vector
  // lands in the same space as the stored chunk vectors.
  const queryVector = await generateEmbedding(query);

  // Raw FT.SEARCH KNN query. Only the vector blob is passed as a $param -
  // the neighbor count must be a literal integer directly in the query
  // text; substituting it via $K silently binds to nothing in RediSearch
  // rather than erroring, which is what was causing zero results despite
  // a fully healthy, correctly-indexed dataset.
  const rawReply = await redisClient.call(
    'FT.SEARCH',
    config.search.indexName,
    `*=>[KNN ${k} @embedding $BLOB AS vector_score]`,
    'PARAMS',
    '2',
    'BLOB',
    queryVector,
    'SORTBY',
    'vector_score',
    'RETURN',
    '3',
    'docId',
    'text_chunk',
    'vector_score',
    'DIALECT',
    '2'
  );

  return parseSearchReply(rawReply);
}

/**
 * RediSearch replies to FT.SEARCH with a flat array:
 *   [totalResults, key1, [field, value, field, value, ...], key2, [...], ...]
 */
function parseSearchReply(reply: unknown): SearchResult[] {
  if (!Array.isArray(reply)) {
    return [];
  }

  // Redis Stack v8 returns a structured response like:
  // ["attributes", [], "format", "STRING", "results", [["id", "chunk:...", "extra_attributes", ["vector_score", "...", "docId", "...", "text_chunk", "..."], "values", []]], "total_results", 3, ...]
  const resultsIndex = reply.indexOf('results');
  if (resultsIndex >= 0 && resultsIndex + 1 < reply.length) {
    const rawResults = reply[resultsIndex + 1];
    if (Array.isArray(rawResults)) {
      const results: SearchResult[] = [];

      for (const entry of rawResults) {
        if (!Array.isArray(entry) || entry.length < 4) {
          continue;
        }

        const chunkKey = String(entry[1] ?? '');
        const extraAttributes = entry[2] === 'extra_attributes' ? entry[3] : undefined;
        if (!Array.isArray(extraAttributes)) {
          continue;
        }

        const fieldMap: Record<string, string> = {};
        for (let i = 0; i < extraAttributes.length; i += 2) {
          fieldMap[String(extraAttributes[i])] = String(extraAttributes[i + 1]);
        }

        results.push({
          chunkKey,
          docId: fieldMap.docId ?? '',
          textChunk: fieldMap.text_chunk ?? '',
          score: Number(fieldMap.vector_score ?? Number.NaN),
        });
      }

      return results;
    }
  }

  // Fallback for the older flat-array FT.SEARCH format used in some examples.
  if (reply.length <= 1) {
    return [];
  }

  const results: SearchResult[] = [];
  for (let i = 1; i < reply.length; i += 2) {
    const chunkKey = String(reply[i]);
    const fields = reply[i + 1];
    if (!Array.isArray(fields)) {
      continue;
    }

    const fieldMap: Record<string, string> = {};
    for (let j = 0; j < fields.length; j += 2) {
      fieldMap[String(fields[j])] = String(fields[j + 1]);
    }

    results.push({
      chunkKey,
      docId: fieldMap.docId ?? '',
      textChunk: fieldMap.text_chunk ?? '',
      score: Number(fieldMap.vector_score ?? Number.NaN),
    });
  }

  return results;
}