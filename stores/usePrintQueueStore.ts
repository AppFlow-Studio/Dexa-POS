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
  dequeueForPrinter: (printerId: string) => PrintJob | null;
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
  pruneJobs: () => number;
}

const PRIORITY_ORDER: Record<PrintJobPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const MAX_RETRIES = 3;
const MAX_FAILED_JOBS = 50;
const RETRY_DELAYS = [1000, 3000, 9000]; // Exponential backoff

// Retention. Completed jobs used to live for the whole session (`clearCompleted`
// had zero callers), so a busy shift accumulated every receipt document —
// including embedded base64 logos — in memory. They are kept briefly so the
// diagnostics surfaces can still show "what just printed", then dropped.
const COMPLETED_RETENTION_MS = 10 * 60 * 1000; // 10 min
// Absolute age cap for every other status. A queued job this old has long since
// burnt its retries and will never usefully print; keeping it only costs memory
// (and MMKV bytes for the persisted queued/failed slice).
const MAX_JOB_AGE_MS = 2 * 60 * 60 * 1000; // 2 h

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

      dequeueForPrinter: (printerId: string) => {
        const { jobs } = get();

        // Same readiness rules as `dequeue` but filtered by printerId so each
        // printer drains independently.
        let idx = -1;
        for (let i = 0; i < jobs.length; i++) {
          const j = jobs[i];
          if (j.printerId !== printerId) continue;
          if (j.status !== "queued") continue;
          if (j.attempts > 0) {
            const delayMs =
              RETRY_DELAYS[Math.min(j.attempts - 1, RETRY_DELAYS.length - 1)];
            const elapsed = Date.now() - j.createdAt;
            if (elapsed < delayMs * j.attempts) continue;
          }
          idx = i;
          break;
        }
        if (idx === -1) return null;

        const job = jobs[idx];

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
            const isTerminal = status === "completed" || status === "failed";
            return {
              ...j,
              status,
              lastError: error ?? j.lastError,
              // Terminal transitions start the retention clock; re-queueing
              // (retry) clears it so a retried job isn't pruned mid-flight.
              completedAt: isTerminal ? Date.now() : undefined,
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
            j.id === jobId
              ? { ...j, status: "queued" as PrintJobStatus, completedAt: undefined }
              : j,
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
              ? {
                  ...j,
                  status: "queued" as PrintJobStatus,
                  attempts: 0,
                  completedAt: undefined,
                }
              : j,
          ),
        }));
        return failedIds.length;
      },

      /**
       * Drop jobs that no longer serve a purpose: completed jobs past the
       * diagnostics-retention window, and anything past the absolute age cap.
       * Called from PrinterService when a printer's drain goes idle, so the
       * queue stays flat across a long shift without a background timer.
       * Returns how many jobs were removed.
       */
      pruneJobs: () => {
        const now = Date.now();
        const { jobs } = get();
        const kept = jobs.filter((j) => {
          if (now - j.createdAt > MAX_JOB_AGE_MS) return false;
          if (j.status !== "completed") return true;
          // Legacy jobs (pre-completedAt) fall back to createdAt.
          return now - (j.completedAt ?? j.createdAt) < COMPLETED_RETENTION_MS;
        });
        const removed = jobs.length - kept.length;
        if (removed > 0) set({ jobs: kept });
        return removed;
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
