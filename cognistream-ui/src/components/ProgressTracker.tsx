import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, FileText, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { api } from '../lib/api';
import { useJobStore } from '../store/useJobStore';

// How long the completed/failed panel stays visible before auto-advancing
// to the next queued job's progress bar.
const TERMINAL_STATE_DISPLAY_MS = 2500;

export function ProgressTracker() {
  const jobQueue = useJobStore((state) => state.jobQueue);
  const removeJob = useJobStore((state) => state.removeJob);
  const advanceQueue = useJobStore((state) => state.advanceQueue);
  const queryClient = useQueryClient();

  // Always the OLDEST job in the queue - this is what keeps the first
  // upload's progress bar visible while later uploads sit queued behind it.
  const jobId = jobQueue[0] ?? null;

  const { data: job, isError, error } = useQuery({
    queryKey: ['jobStatus', jobId],
    queryFn: () => api.getJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === 'completed' || state === 'failed') {
        return false;
      }
      return 1000;
    },
  });

  useEffect(() => {
    if (job?.state === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    }
  }, [job?.state, queryClient]);

  // Once the current job reaches a terminal state, briefly show the
  // result, then pop it off the queue so the next queued job's progress
  // bar takes over automatically.
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!jobId || (job?.state !== 'completed' && job?.state !== 'failed')) {
      return;
    }
    advanceTimeoutRef.current = setTimeout(() => advanceQueue(), TERMINAL_STATE_DISPLAY_MS);
    return () => {
      if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    };
  }, [jobId, job?.state, advanceQueue]);

  if (!jobId) return null;

  const handleDismiss = () => {
    if (advanceTimeoutRef.current) clearTimeout(advanceTimeoutRef.current);
    removeJob(jobId);
  };

  const queuedBehind = jobQueue.length - 1;

  return (
    <Card className="w-full shadow-lg bg-slate-900/40 backdrop-blur-xl border-slate-800/60 relative overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
        onClick={handleDismiss}
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
          {queuedBehind > 0 && (
            <span className="ml-2 text-indigo-300">&middot; {queuedBehind} more queued</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {isError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            <XCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error?.message || 'Failed to fetch telemetry data.'}</p>
          </div>
        )}

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

        {job?.state === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Ingestion Complete</p>
                <p className="text-xs opacity-90 mt-1">Ready for semantic retrieval.</p>
              </div>
            </div>

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