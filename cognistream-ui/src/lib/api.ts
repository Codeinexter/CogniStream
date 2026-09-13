// Reads from the environment (see vite-env.d.ts / .env.example) so the
// Dockerized frontend, which gets VITE_API_URL injected via
// docker-compose.yml, actually talks to the right host instead of always
// hitting localhost:3000 regardless of environment.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface JobStatusResponse {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result: { docId: string; totalChunks: number; filename: string } | null;
  error: string | null;
}

export interface SearchResult {
  text: string;
  score: number;
  docId?: string;
}

// Global interceptor to standardize HTTP errors for UI consumption
async function fetchWithError(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    let errorMessage = 'An unexpected error occurred.';
    
    // Catch specific HTTP 429 limits from Gemini / BullMQ
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = response.statusText;
    }
    
    throw new Error(errorMessage);
  }
  
  return response.json();
}

export const api = {
  uploadDocument: (file: File): Promise<{ jobId: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    
    return fetchWithError(`${API_BASE}/ingest`, {
      method: 'POST',
      body: formData,
    });
  },
  
  getJobStatus: (id: string): Promise<JobStatusResponse> => {
    return fetchWithError(`${API_BASE}/jobs/${id}`);
  },
  
  searchDocuments: (query: string): Promise<{ results: SearchResult[] }> => {
    return fetchWithError(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, k: 5 }),
    });
  }
};