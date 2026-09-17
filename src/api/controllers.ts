import type { Request, Response } from 'express';
import multer from 'multer';
import { config } from '../infrastructure/config.js';
import { deleteDocument, listDocuments } from '../infrastructure/documents.js';
import { generateAnswer } from '../infrastructure/gemini.js';
import { ingestionQueue } from '../infrastructure/queue.js';
import { extractText } from '../services/ingestion.js';
import { distanceToSimilarity, searchVectors } from '../services/search.js';

// Configure multer to parse the file payload into a memory buffer.
// Actual text extraction (plain-text decode vs PDF/DOCX parsing) happens
// per-mimetype in extractText() - multer's fileFilter here just rejects
// anything outside the supported set up front.
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: config.ingestion.maxFileSizeBytes,
  },
  fileFilter: (_req, file, cb) => {
    if (!config.ingestion.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

export async function ingestDocument(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    let rawText: string;
    try {
      rawText = await extractText(req.file.buffer, req.file.mimetype);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Could not extract text from file',
      });
      return;
    }

    if (!rawText) {
      res.status(400).json({ error: 'Uploaded file is empty or has no extractable text' });
      return;
    }

    // Push the job to the BullMQ queue for background processing. mimeType
    // is carried through so the worker can record it on the document's
    // metadata record once processing completes.
    const job = await ingestionQueue.add('process-doc', {
      filename: req.file.originalname,
      text: rawText,
      mimeType: req.file.mimetype,
    });

    // Immediately return 202 Accepted with the unique Job UUID
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ error: 'Internal server error during ingestion' });
  }
}

function parseSearchRequest(
  body: Record<string, unknown>
): { query: string; k: number } | { error: string } {
  const { query, k } = body;

  if (typeof query !== 'string' || !query.trim()) {
    return { error: '"query" must be a non-empty string' };
  }

  const topK = k === undefined ? config.search.defaultK : k;
  if (
    typeof topK !== 'number' ||
    !Number.isInteger(topK) ||
    topK <= 0 ||
    topK > config.search.maxK
  ) {
    return { error: `"k" must be an integer between 1 and ${config.search.maxK}` };
  }

  return { query, k: topK };
}

export async function searchDocuments(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseSearchRequest((req.body ?? {}) as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { query, k: topK } = parsed;

    const rawResults = await searchVectors(query, topK);

    // searchVectors() returns internal fields (textChunk, chunkKey) and a
    // raw RediSearch COSINE distance via `score`. The public API - and the
    // SemanticSearch UI, which renders this as a "% Match" badge - expects
    // a 0-1 similarity where higher is better, plus a `text` field.
    const results = rawResults.map((r) => ({
      docId: r.docId,
      text: r.textChunk,
      score: distanceToSimilarity(r.score),
    }));

    res.status(200).json({ query, k: topK, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error during search' });
  }
}

export async function askQuestion(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseSearchRequest((req.body ?? {}) as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { query, k: topK } = parsed;

    const rawResults = await searchVectors(query, topK);

    if (rawResults.length === 0) {
      res.status(200).json({
        query,
        answer: "I couldn't find anything relevant in the ingested documents to answer that.",
        sources: [],
      });
      return;
    }

    const sources = rawResults.map((r) => ({
      docId: r.docId,
      text: r.textChunk,
      score: distanceToSimilarity(r.score),
    }));

    const answer = await generateAnswer(
      query,
      sources.map((s) => s.text)
    );

    res.status(200).json({ query, answer, sources });
  } catch (error) {
    console.error('Ask error:', error);
    res.status(500).json({ error: 'Internal server error while generating an answer' });
  }
}

export async function listDocumentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const documents = await listDocuments();
    res.status(200).json({ documents });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Internal server error while listing documents' });
  }
}

export async function deleteDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawId = req.params.id;
    const docId = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!docId) {
      res.status(400).json({ error: 'Document id is required' });
      return;
    }

    const deleted = await deleteDocument(docId);
    if (!deleted) {
      res.status(404).json({ error: `Document ${docId} not found` });
      return;
    }

    res.status(200).json({ docId, deleted: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Internal server error while deleting document' });
  }
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      res.status(400).json({ error: 'Job id is required' });
      return;
    }

    const job = await ingestionQueue.getJob(id);
    if (!job) {
      res.status(404).json({ error: `Job ${id} not found` });
      return;
    }

    const rawState = await job.getState();

    // BullMQ's state set (waiting, active, delayed, waiting-children,
    // prioritized, completed, failed, unknown, ...) is broader than what
    // the frontend renders. Only completed/failed get a distinct UI; every
    // other state should just show the "in progress" spinner+bar, so
    // normalize down to the four states the client's JobStatusResponse
    // type actually declares.
    const state: 'waiting' | 'active' | 'completed' | 'failed' =
      rawState === 'completed' || rawState === 'failed'
        ? rawState
        : rawState === 'waiting' || rawState === 'delayed' || rawState === 'waiting-children' || rawState === 'prioritized'
          ? 'waiting'
          : 'active';

    // Field names here (id/state/progress/result/error) intentionally match
    // the `JobStatusResponse` interface in the frontend's lib/api.ts.
    const payload = {
      id: job.id,
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue ?? null,
      error: job.failedReason ?? null,
    };

    res.status(200).json(payload);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: 'Internal server error while fetching job status' });
  }
}