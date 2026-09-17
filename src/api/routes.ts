import { Router } from 'express';
import {
    askQuestion,
    deleteDocumentHandler,
    getJobStatus,
    ingestDocument,
    listDocumentsHandler,
    searchDocuments,
    upload,
} from './controllers.js';

export const router = Router();

// Route specifically expects multipart/form-data with a field named 'file'
router.post('/ingest', upload.single('file'), ingestDocument);

// Expects a JSON body: { "query": "...", "k"?: number }
router.post('/search', searchDocuments);

// RAG answer synthesis: retrieves top-k chunks, then asks Gemini to answer
// the question grounded in them. Same body shape as /search.
router.post('/ask', askQuestion);

// Returns the queue status for a previously created BullMQ job ID.
router.get('/jobs/:id', getJobStatus);

// Document registry - documents appear here once ingestion finishes.
router.get('/documents', listDocumentsHandler);
router.delete('/documents/:id', deleteDocumentHandler);