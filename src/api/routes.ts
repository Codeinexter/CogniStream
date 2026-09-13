import { Router } from 'express';
import { getJobStatus, ingestDocument, searchDocuments, upload } from './controllers.js';

export const router = Router();

// Route specifically expects multipart/form-data with a field named 'file'
router.post('/ingest', upload.single('file'), ingestDocument);

// Expects a JSON body: { "query": "...", "k"?: number }
router.post('/search', searchDocuments);

// Returns the queue status for a previously created BullMQ job ID.
router.get('/jobs/:id', getJobStatus);
