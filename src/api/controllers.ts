import type { Request, Response } from 'express';
import multer from 'multer';
import { config } from '../infrastructure/config.js';
import { ingestionQueue } from '../infrastructure/queue.js';
import { searchVectors } from '../services/search.js';

// Configure multer to parse the file payload into a memory buffer.
// Reject anything that isn't a text-like mimetype up front, since the
// handler decodes the buffer as UTF-8 text - a PDF/DOCX/image would
// silently turn into garbage chunks and garbage embeddings otherwise.
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

    // Extract raw text from the file buffer
    const rawText = req.file.buffer.toString('utf-8').trim();

    if (!rawText) {
      res.status(400).json({ error: 'Uploaded file is empty' });
      return;
    }

    // Push the job to the BullMQ queue for background processing
    const job = await ingestionQueue.add('process-doc', {
      filename: req.file.originalname,
      text: rawText,
    });

    // Immediately return 202 Accepted with the unique Job UUID
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({ error: 'Internal server error during ingestion' });
  }
}

export async function searchDocuments(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { query, k } = body;

    if (typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: '"query" must be a non-empty string' });
      return;
    }

    const topK = k === undefined ? config.search.defaultK : k;
    if (
      typeof topK !== 'number' ||
      !Number.isInteger(topK) ||
      topK <= 0 ||
      topK > config.search.maxK
    ) {
      res.status(400).json({
        error: `"k" must be an integer between 1 and ${config.search.maxK}`,
      });
      return;
    }

    const rawResults = await searchVectors(query, topK);

    // searchVectors() returns internal fields (textChunk, chunkKey) and a
    // raw RediSearch COSINE *distance* (0 = identical, higher = further
    // apart) via `score`. The public API - and the SemanticSearch UI,
    // which renders this as a "% Match" badge - expects a 0-1 similarity
    // where higher is better, plus a `text` field. Map that here at the
    // API boundary rather than leaking Redis internals to the client.
    const results = rawResults.map((r) => ({
      docId: r.docId,
      text: r.textChunk,
      score: Number.isFinite(r.score) ? Math.max(0, Math.min(1, 1 - r.score)) : 0,
    }));

    res.status(200).json({ query, k: topK, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error during search' });
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
    // type actually declares instead of leaking BullMQ's internal states.
    const state: 'waiting' | 'active' | 'completed' | 'failed' =
      rawState === 'completed' || rawState === 'failed'
        ? rawState
        : rawState === 'waiting' || rawState === 'delayed' || rawState === 'waiting-children' || rawState === 'prioritized'
          ? 'waiting'
          : 'active';

    // Field names here (id/state/progress/result/error) intentionally match
    // the `JobStatusResponse` interface in the frontend's lib/api.ts - the
    // previous version returned status/data/returnedValue/failedReason,
    // which silently never matched what ProgressTracker.tsx was reading.
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