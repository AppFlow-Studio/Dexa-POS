import { createLazyPersistStorage } from "@/lib/storage";
import {
    PrintJob,
    PrintJobPriority,
    PrintJobStatus,
    SerializedPrintJob,
    deserializePrintJob,
    serializePrintJob,
} from "@/types/printer";
import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  reassignJob: (jobId: string, newPrinterId: string) => void;
  removeJob: (jobId: string) => void;
  getQueuedJobCount: () => number;
  getFailedJobs: () => PrintJob[];
  clearCompleted: () => void;
  clearFailed: () => void;
  clearAll: () => void;
  retryAllFailed: () => number;
}

const PRIORITY_ORDER: Record<PrintJobPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const MAX_RETRIES = 3;
const MAX_FAILED_JOBS = 50;
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

        // Find the first queued job that is ready to process (skip jobs in retry backoff)
        let idx = -1;
        for (let i = 0; i < jobs.length; i++) {
          const j = jobs[i];
          if (j.status !== "queued") continue;
          if (j.attempts > 0) {
            const delayMs =
              RETRY_DELAYS[Math.min(j.attempts - 1, RETRY_DELAYS.length - 1)];
            const elapsed = Date.now() - j.createdAt;
            if (elapsed < delayMs * j.attempts) continue; // Not ready, skip to next
          }
          idx = i;
          break;
        }
        if (idx === -1) return null;

        const job = jobs[idx];

        // Mark as processing
        set((state) => ({
          jobs: state.jobs.map((j, i) =>
            i === idx ? { ...j, status: "processing" as PrintJobStatus } : j,
          ),
        }));

        return deserializePrintJob(job);
      },

      updateJobStatus: (jobId, status, error) => {
        set((state) => {
          let jobs = state.jobs.map((j) => {
            if (j.id !== jobId) return j;
            return {
              ...j,
              status,
              lastError: error ?? j.lastError,
              attempts: status === "failed" ? j.attempts + 1 : j.attempts,
            };
          });
          // Evict oldest failed jobs when cap exceeded
          if (status === "failed") {
            const failedJobs = jobs.filter((j) => j.status === "failed");
            if (failedJobs.length > MAX_FAILED_JOBS) {
              const oldest = new Set(
                failedJobs
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .slice(0, failedJobs.length - MAX_FAILED_JOBS)
                  .map((j) => j.id),
              );
              jobs = jobs.filter((j) => !oldest.has(j.id));
            }
          }
          return { jobs };
        });
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
            j.id === jobId ? { ...j, status: "queued" as PrintJobStatus } : j,
          ),
        }));

        return true;
      },

      reassignJob: (jobId, newPrinterId) => {
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === jobId ? { ...j, printerId: newPrinterId } : j,
          ),
        }));
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

      clearFailed: () => {
        set((state) => ({
          jobs: state.jobs.filter((j) => j.status !== "failed"),
        }));
      },

      clearAll: () => {
        set({ jobs: [] });
      },

      retryAllFailed: () => {
        const { jobs } = get();
        const failedIds = jobs
          .filter((j) => j.status === "failed")
          .map((j) => j.id);
        if (failedIds.length === 0) return 0;
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.status === "failed"
              ? { ...j, status: "queued" as PrintJobStatus, attempts: 0 }
              : j,
          ),
        }));
        return failedIds.length;
      },
    }),
    {
      name: "print-queue-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        // Persist queued, failed, AND processing jobs (processing saved as queued for crash recovery)
        jobs: state.jobs
          .filter(
            (j) =>
              j.status === "queued" ||
              j.status === "failed" ||
              j.status === "processing",
          )
          .map((j) =>
            j.status === "processing"
              ? { ...j, status: "queued" as PrintJobStatus }
              : j,
          ),
      }),
      onRehydrateStorage: () => (state) => {
        // On hydration, reset any processing jobs back to queued (crash recovery)
        if (state?.jobs) {
          state.jobs = state.jobs.map((j) =>
            j.status === "processing"
              ? { ...j, status: "queued" as PrintJobStatus }
              : j,
          );
        }
      },
    },
  ),
);
