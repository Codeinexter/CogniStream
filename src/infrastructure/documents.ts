import { redisClient } from './redis.js';

export interface DocumentMetadata {
  docId: string;
  filename: string;
  mimeType: string;
  totalChunks: number;
  createdAt: string;
}

// A sorted set (score = ingestion timestamp) so listing is O(log N) instead
// of an FT.SEARCH / SCAN over the whole keyspace, and naturally supports
// "most recent first" ordering.
const DOCUMENT_INDEX_KEY = 'documents:index';
const documentKey = (docId: string): string => `doc:${docId}`;

/**
 * Called by the worker once a document finishes chunking + embedding.
 * Documents intentionally only appear in the registry after processing
 * completes - while a job is still running, its status lives in BullMQ
 * (GET /jobs/:id), not here.
 */
export async function saveDocumentMetadata(meta: DocumentMetadata): Promise<void> {
  await redisClient.hset(documentKey(meta.docId), {
    docId: meta.docId,
    filename: meta.filename,
    mimeType: meta.mimeType,
    totalChunks: meta.totalChunks,
    createdAt: meta.createdAt,
  });
  await redisClient.zadd(DOCUMENT_INDEX_KEY, Date.parse(meta.createdAt) || Date.now(), meta.docId);
}

export async function getDocument(docId: string): Promise<DocumentMetadata | null> {
  const hash = await redisClient.hgetall(documentKey(docId));
  if (!hash || Object.keys(hash).length === 0) {
    return null;
  }
  return {
    docId,
    filename: hash.filename ?? 'unknown',
    mimeType: hash.mimeType ?? 'text/plain',
    totalChunks: Number(hash.totalChunks ?? 0),
    createdAt: hash.createdAt ?? new Date(0).toISOString(),
  };
}

export async function listDocuments(): Promise<DocumentMetadata[]> {
  const docIds = await redisClient.zrevrange(DOCUMENT_INDEX_KEY, 0, -1);
  if (docIds.length === 0) {
    return [];
  }

  const pipeline = redisClient.pipeline();
  for (const docId of docIds) {
    pipeline.hgetall(documentKey(docId));
  }
  const responses = await pipeline.exec();

  const documents: DocumentMetadata[] = [];
  responses?.forEach((entry, index) => {
    const [err, hash] = entry as [Error | null, Record<string, string> | null];
    const docId = docIds[index];
    if (err || !hash || !docId || Object.keys(hash).length === 0) {
      return;
    }
    documents.push({
      docId,
      filename: hash.filename ?? 'unknown',
      mimeType: hash.mimeType ?? 'text/plain',
      totalChunks: Number(hash.totalChunks ?? 0),
      createdAt: hash.createdAt ?? new Date(0).toISOString(),
    });
  });
  return documents;
}

/**
 * Removes a document's metadata record, its index entry, and every chunk
 * hash belonging to it. Returns false if the document didn't exist.
 */
export async function deleteDocument(docId: string): Promise<boolean> {
  const existing = await getDocument(docId);
  if (!existing) {
    return false;
  }

  // Chunk keys are `chunk:{docId}:{index}`, and docId is always a
  // crypto.randomUUID() value generated server-side (hex + dashes only),
  // so this pattern can't be widened by a malicious id.
  const chunkKeys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redisClient.scan(
      cursor,
      'MATCH',
      `chunk:${docId}:*`,
      'COUNT',
      100
    );
    cursor = nextCursor;
    chunkKeys.push(...keys);
  } while (cursor !== '0');

  if (chunkKeys.length > 0) {
    // Deleting the hash keys also removes them from the RediSearch index -
    // RediSearch indexes/deindexes hashes reactively based on keyspace
    // writes under the indexed prefix, no separate FT.DEL call is needed.
    await redisClient.del(...chunkKeys);
  }

  await redisClient.del(documentKey(docId));
  await redisClient.zrem(DOCUMENT_INDEX_KEY, docId);
  return true;
}