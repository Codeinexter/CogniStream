import { Database, FileText, Loader2, Search, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useToast } from '../hooks/use-toast';
import { api, type SearchResult } from '../lib/api';

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const response = await api.searchDocuments(query);
      setResults(response.results);

      if (response.results.length === 0) {
        toast({
          title: 'No Matches Found',
          description: 'Try adjusting your query or uploading more documents.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Search Failed',
        description: error.message || 'Could not query vector database.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className="w-full shadow-lg bg-slate-900/40 backdrop-blur-xl border-slate-800/60">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Semantic Vector Search
        </CardTitle>
        <CardDescription>
          Query text chunks using Google Gemini embeddings and RediSearch HNSW similarity.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              type="text"
              placeholder="e.g., What architecture does CogniStream use?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-12 bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-indigo-500/50"
            />
          </div>
          <Button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="h-12 px-6 bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              'Search'
            )}
          </Button>
        </form>

        {/* Results View */}
        {results !== null && (
          <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              Nearest Neighbors ({results.length} Matches)
            </div>

            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No vector matches found for your query.
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className="p-5 bg-slate-950/40 rounded-xl border border-slate-800/50 space-y-3 hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        <span>Doc ID: {result.docId ? result.docId.slice(0, 8) : 'N/A'}...</span>
                      </div>
                      
                      {/* Similarity Score Badge */}
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                        {(result.score * 100).toFixed(1)}% Match
                      </span>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed font-sans">
                      "{result.text}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}