import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
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
