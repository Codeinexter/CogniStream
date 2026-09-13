import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkDocument, extractText } from './ingestion.js';

test('chunkDocument splits long text into more than one chunk', async () => {
  const longText = 'CogniStream ingests documents asynchronously via BullMQ. '.repeat(100);
  const chunks = await chunkDocument(longText);
  assert.ok(chunks.length > 1, `expected more than one chunk, got ${chunks.length}`);
});

test('chunkDocument returns short text as a single chunk', async () => {
  const shortText = 'Hello World';
  const chunks = await chunkDocument(shortText);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], shortText);
});

test('extractText decodes plain-text mimetypes directly', async () => {
  const buffer = Buffer.from('Hello World', 'utf-8');
  assert.equal(await extractText(buffer, 'text/plain'), 'Hello World');
  assert.equal(await extractText(buffer, 'text/markdown'), 'Hello World');
  assert.equal(await extractText(buffer, 'text/csv'), 'Hello World');
});

test('extractText trims surrounding whitespace', async () => {
  const buffer = Buffer.from('  padded  \n', 'utf-8');
  assert.equal(await extractText(buffer, 'text/plain'), 'padded');
});

test('extractText rejects unsupported mimetypes', async () => {
  const buffer = Buffer.from('irrelevant');
  await assert.rejects(() => extractText(buffer, 'image/png'), /Unsupported file type/);
});