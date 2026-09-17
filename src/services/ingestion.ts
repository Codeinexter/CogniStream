import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { config } from '../infrastructure/config.js';

// Initialize the recursive semantic splitter using centralized limits
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: config.chunking.size,
  chunkOverlap: config.chunking.overlap,
});

/**
 * Splits raw document text into semantically preserved chunks.
 */
export async function chunkDocument(text: string): Promise<string[]> {
  try {
    const chunks = await textSplitter.splitText(text);
    return chunks;
  } catch (error) {
    console.error('Failed to chunk document text:', error);
    throw new Error('Chunking failed');
  }
}

/**
 * Extracts plain text from an uploaded file buffer based on its mimetype.
 * Plain-text formats are decoded directly; PDF/DOCX go through dedicated
 * parsers, since decoding those as UTF-8 would produce binary garbage that
 * would then get chunked and embedded as if it were real content.
 *
 * Keep this in sync with config.ingestion.allowedMimeTypes - multer's
 * fileFilter already rejects anything not in that list before a request
 * reaches here, so the `default` branch below should be unreachable in
 * normal operation; it exists as a defensive fallback.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
    case 'text/csv':
      return buffer.toString('utf-8').trim();

    case 'application/pdf': {
      const parsed = await pdfParse(buffer);
      return parsed.text.trim();
    }

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const { value } = await mammoth.extractRawText({ buffer });
      return value.trim();
    }

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}