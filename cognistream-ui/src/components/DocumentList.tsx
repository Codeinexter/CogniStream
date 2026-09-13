import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { api } from '../lib/api';

export function DocumentList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents'],
    queryFn: api.listDocuments,
    refetchInterval: 5000,
  });

  const handleDelete = async (docId: string, filename: string) => {
    try {
      await api.deleteDocument(docId);
      toast({
        title: 'Document deleted',
        description: `Removed "${filename}" and its chunks from the index.`,
      });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message || 'Could not delete document.',
      });
    }
  };

  const documents = data?.documents ?? [];

  return (
    <Card className="w-full shadow-lg bg-slate-900/40 backdrop-blur-xl border-slate-800/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            Ingested Documents
          </CardTitle>
          <CardDescription>Documents currently indexed for search and Q&amp;A.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
          className="text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading documents...
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400">Could not load documents.</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents ingested yet.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.docId}
                className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 hover:border-slate-700/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{doc.filename}</p>
                  <p className="text-xs text-slate-500">
                    {doc.totalChunks} chunks &middot; {doc.mimeType} &middot;{' '}
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(doc.docId, doc.filename)}
                  className="text-slate-400 hover:text-red-400 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}