import { create } from 'zustand';

interface JobState {
  /**
   * FIFO queue of BullMQ job IDs. jobQueue[0] is the job currently
   * displayed by ProgressTracker; everything behind it is still waiting
   * for the worker to reach it (the worker processes ingestion jobs
   * sequentially), so it stays hidden until it becomes the front.
   */
  jobQueue: string[];
  /** Enqueue a newly-created ingestion job. */
  addJob: (id: string) => void;
  /** Remove a specific job (manual dismiss via the X button). */
  removeJob: (id: string) => void;
  /** Drop the front of the queue, advancing display to the next job. */
  advanceQueue: () => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobQueue: [],
  addJob: (id) => set((state) => ({ jobQueue: [...state.jobQueue, id] })),
  removeJob: (id) =>
    set((state) => ({ jobQueue: state.jobQueue.filter((jobId) => jobId !== id) })),
  advanceQueue: () => set((state) => ({ jobQueue: state.jobQueue.slice(1) })),
}));