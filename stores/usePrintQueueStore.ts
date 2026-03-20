import { mmkvStorage } from "@/lib/storage";
import {
  PrintJob,
  PrintJobPriority,
  PrintJobStatus,
  SerializedPrintJob,
  deserializePrintJob,
  serializePrintJob,
} from "@/types/printer";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PrintQueueStoreState {
  jobs: SerializedPrintJob[];

  // Actions
  enqueue: (job: PrintJob) => void;
  dequeue: () => PrintJob | null;
  updateJobStatus: (
    jobId: string,
    status: PrintJobStatus,
    error?: string,
  ) => void;
  retryJob: (jobId: string) => boolean;
  removeJob: (jobId: string) => void;
  getQueuedJobCount: () => number;
  getFailedJobs: () => PrintJob[];
  clearCompleted: () => void;
}

const PRIORITY_ORDER: Record<PrintJobPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 9000]; // Exponential backoff

export const usePrintQueueStore = create<PrintQueueStoreState>()(
  persist(
    (set, get) => ({
      jobs: [],

      enqueue: (job: PrintJob) => {
        const serialized = serializePrintJob(job);
        set((state) => {
          const updated = [...state.jobs, serialized];
          // Sort by priority then by creation time
          updated.sort((a, b) => {
            const priorityDiff =
              PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return a.createdAt - b.createdAt;
          });
          return { jobs: updated };
        });
      },

      dequeue: () => {
        const { jobs } = get();

        // Find the first queued job
        const idx = jobs.findIndex((j) => j.status === "queued");
        if (idx === -1) return null;

        const job = jobs[idx];

        // Check retry delay for previously failed jobs
        if (job.attempts > 0) {
          const delayMs = RETRY_DELAYS[Math.min(job.attempts - 1, RETRY_DELAYS.length - 1)];
          const elapsed = Date.now() - job.createdAt;
          if (elapsed < delayMs * job.attempts) {
            return null; // Not ready for retry yet
          }
        }

        // Mark as processing
        set((state) => ({
          jobs: state.jobs.map((j, i) =>
            i === idx ? { ...j, status: "processing" as PrintJobStatus } : j,
          ),
        }));

        return deserializePrintJob(job);
      },

      updateJobStatus: (jobId, status, error) => {
        set((state) => ({
          jobs: state.jobs.map((j) => {
            if (j.id !== jobId) return j;
            return {
              ...j,
              status,
              lastError: error ?? j.lastError,
              attempts: status === "failed" ? j.attempts + 1 : j.attempts,
            };
          }),
        }));
      },

      retryJob: (jobId) => {
        const { jobs } = get();
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return false;

        if (job.attempts >= MAX_RETRIES) {
          return false; // Max retries exceeded
        }

        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === jobId
              ? { ...j, status: "queued" as PrintJobStatus }
              : j,
          ),
        }));

        return true;
      },

      removeJob: (jobId) => {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.id !== jobId),
        }));
      },

      getQueuedJobCount: () => {
        return get().jobs.filter(
          (j) => j.status === "queued" || j.status === "processing",
        ).length;
      },

      getFailedJobs: () => {
        return get()
          .jobs.filter((j) => j.status === "failed")
          .map(deserializePrintJob);
      },

      clearCompleted: () => {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.status !== "completed"),
        }));
      },
    }),
    {
      name: "print-queue-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Persist queued, failed, AND processing jobs (processing saved as queued for crash recovery)
        jobs: state.jobs
          .filter(
            (j) => j.status === "queued" || j.status === "failed" || j.status === "processing",
          )
          .map((j) =>
            j.status === "processing" ? { ...j, status: "queued" as PrintJobStatus } : j,
          ),
      }),
      onRehydrateStorage: () => (state) => {
        // On hydration, reset any processing jobs back to queued (crash recovery)
        if (state?.jobs) {
          state.jobs = state.jobs.map((j) =>
            j.status === "processing" ? { ...j, status: "queued" as PrintJobStatus } : j,
          );
        }
      },
    },
  ),
);
