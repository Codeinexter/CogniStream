import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, FileText, Loader2, X, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { api } from '../lib/api';
import { useJobStore } from '../store/useJobStore';

export function ProgressTracker() {
  const { jobId, clearJob } = useJobStore();

  const { data: job, isError, error } = useQuery({
    queryKey: ['jobStatus', jobId],
    queryFn: () => api.getJobStatus(jobId!),
    enabled: !!jobId,
    // Poll every 1 second, but halt immediately if the job reaches a terminal state
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === 'completed' || state === 'failed') {
        return false;
      }
      return 1000;
    },
  });

  // Do not render anything if there is no active job in the global Zustand store
  if (!jobId) return null;

  return (
    <Card className="w-full shadow-lg bg-slate-900/40 backdrop-blur-xl border-slate-800/60 relative overflow-hidden">
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
        onClick={clearJob}
      >
        <X className="w-4 h-4" />
      </Button>

      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600" />
          Ingestion Telemetry
        </CardTitle>
        <CardDescription>
          Tracking live worker progress for Job ID: <span className="font-mono text-xs">{jobId.slice(0, 8)}...</span>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Error State: UI gracefully handles HTTP 500s or TanStack query failures */}
        {isError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            <XCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error?.message || 'Failed to fetch telemetry data.'}</p>
          </div>
        )}

        {/* Processing State */}
        {job && job.state !== 'completed' && job.state !== 'failed' && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm font-medium text-slate-300">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                {job.state === 'waiting' ? 'Queued for processing...' : 'Vectorizing chunks...'}
              </span>
              <span className="text-indigo-300">{job.progress}%</span>
            </div>
            <Progress value={job.progress} className="h-1.5 bg-slate-800 [&>div]:bg-indigo-500" />
          </div>
        )}

        {/* Success State */}
        {job?.state === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Ingestion Complete</p>
                <p className="text-xs opacity-90 mt-1">Ready for semantic retrieval.</p>
              </div>
            </div>
            
            {/* Displaying returning payload from BullMQ */}
            {job.result && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <div className="text-xs text-slate-500 mb-1">Source File</div>
                  <div className="text-sm font-medium flex items-center gap-2 truncate">
                    <FileText className="w-3 h-3" />
                    {job.result.filename}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <div className="text-xs text-slate-500 mb-1">Total Chunks Embedded</div>
                  <div className="text-sm font-medium text-indigo-600">
                    {job.result.totalChunks} vectors
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Failed State */}
        {job?.state === 'failed' && (
          <div className="flex items-start gap-3 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Worker Execution Failed</p>
              <p className="text-xs mt-1 font-mono bg-red-100 p-1.5 rounded text-red-900 mt-2">
                {job.error || 'Unknown fatal error in processing queue.'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}