import { create } from 'zustand';

interface JobState {
  jobId: string | null;
  setJobId: (id: string | null) => void;
  clearJob: () => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobId: null,
  setJobId: (id) => set({ jobId: id }),
  clearJob: () => set({ jobId: null }),
}));