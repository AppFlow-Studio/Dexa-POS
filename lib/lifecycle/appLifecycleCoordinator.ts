/**
 * Application lifecycle coordinator.
 *
 * Replaces ~20 independent AppState listeners that each fired their own
 * recovery work the instant the app foregrounded. That storm is what delayed
 * the first tap after screen-off: auth refresh, realtime re-subscribe, offline
 * queue replay, heartbeat, terminal + printer health probes, order reconcile,
 * settings/employee refresh and a synchronous order-store prune all landed on
 * the same tick, and every network item queued behind one cold Clerk token
 * exchange.
 *
 * See tasks/appstate-netinfo-listener-inventory.md for the pre-migration
 * census and the per-site behavior this preserves.
 *
 * Design:
 *  - ONE AppState subscription for the whole app.
 *  - ONE network-state source: subscribeOnlineStatus/getRawIsOnline from
 *    offlineSyncService (which owns NetInfo.configure). No new NetInfo
 *    subscriptions anywhere else.
 *  - Subsystems register an idempotent task with a bucket. Buckets drain in
 *    order; a bucket never starts until the previous one has settled.
 *
 * Bucket schedule:
 *   immediate    -> awaited, synchronously scheduled on the resume tick
 *   frame        -> requestAnimationFrame after immediate settles
 *   interactions -> InteractionManager.runAfterInteractions after frame
 *   background   -> idle timeout after interactions
 *
 * LEAF-ISH: imports the telemetry registry and offlineSyncService's network
 * accessors only. Must not import stores or React — subsystems register into
 * it, it never reaches into them.
 */
import { AppState, AppStateStatus, InteractionManager } from "react-native";
import {
  KEY_RESUME_BUCKET_MS,
  KEY_RESUME_TASK_MS,
  KEY_RESUME_TASK_ERROR,
  KEY_RESUME_TASKS_RUN,
  KEY_RESUME_TASKS_SKIPPED,
  resumeBucketKeyIds,
} from "@/lib/telemetry/keys";
import { recordCount, recordSample, recordSpan } from "@/lib/telemetry/registry";
import {
  closeResumeRequestWindow,
  openResumeRequestWindow,
} from "@/lib/telemetry/resumeRequests";

// ============================================================================
// TYPES
// ============================================================================

export type ResumeBucket =
  | "immediate"
  | "frame"
  | "interactions"
  | "background";

export const BUCKET_ORDER: readonly ResumeBucket[] = [
  "immediate",
  "frame",
  "interactions",
  "background",
] as const;

export interface ResumeTask {
  /** Stable unique id. Re-registering the same id replaces the task. */
  id: string;
  bucket: ResumeBucket;
  /**
   * The recovery work. MUST be idempotent — it can run on every resume, and a
   * resume that arrives mid-drain will re-run it on the next pass.
   *
   * Rejections are recorded and swallowed: one subsystem failing to recover
   * must never stall the buckets behind it.
   */
  run: () => void | Promise<void>;
  /**
   * Optional predicate. Returning false skips the task for this resume without
   * counting as a failure — this is where per-subsystem staleness windows
   * live (settings/employees 5min, active orders 2min, etc).
   */
  shouldRun?: () => boolean;
  /**
   * When true the task only runs if the shared network source reports online.
   * Offline resumes skip it rather than firing a request that will fail.
   */
  requiresNetwork?: boolean;
}

export interface SuspendTask {
  /** Stable unique id. Re-registering the same id replaces the task. */
  id: string;
  /**
   * Work to do as the app leaves the foreground: flush, pause timers, release
   * hardware. Runs synchronously in registration order on the background edge
   * — the OS may kill the process shortly after, so this is not the place for
   * anything that needs to await a network round-trip.
   */
  run: () => void;
}

// ============================================================================
// STATE
// ============================================================================

const tasks = new Map<string, ResumeTask>();
const suspendTasks = new Map<string, SuspendTask>();

let appStateSubscription: { remove: () => void } | null = null;
let started = false;

/** Bumped on every resume; in-flight drains compare against it and abort. */
let resumeGeneration = 0;
let draining = false;

let lastAppState: AppStateStatus = "active";

/**
 * True once a genuine `background` has been seen, cleared when we drain on the
 * next `active`. Distinguishes a real screen-off/lock from an `inactive`
 * flicker so only the former triggers recovery.
 */
let sawBackground = false;

/** Set by app/_layout.tsx so the coordinator can read online state. */
let isOnlineFn: () => boolean = () => true;

/** Scheduled handles for the non-immediate buckets, so a new resume can cancel. */
let frameHandle: ReturnType<typeof requestAnimationFrame> | null = null;
let interactionHandle: { cancel: () => void } | null = null;
let idleHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Delay before the background bucket runs, measured from when interactions
 * settle. Long enough that the operator's first tap wins the race.
 */
const BACKGROUND_BUCKET_DELAY_MS = 2_000;

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register (or replace) a resume task. Returns an unregister function.
 *
 * Safe to call before start() — tasks registered at module-init time are
 * picked up by the first resume.
 */
export function registerResumeTask(task: ResumeTask): () => void {
  tasks.set(task.id, task);
  return () => {
    // Only delete if this exact task is still the registered one, so a
    // remount that re-registered under the same id isn't torn down by the
    // previous instance's cleanup.
    if (tasks.get(task.id) === task) {
      tasks.delete(task.id);
    }
  };
}

/**
 * Register (or replace) a suspend task, run on the foreground->background
 * edge. Returns an unregister function.
 */
export function registerSuspendTask(task: SuspendTask): () => void {
  suspendTasks.set(task.id, task);
  return () => {
    if (suspendTasks.get(task.id) === task) {
      suspendTasks.delete(task.id);
    }
  };
}

/** Test/diagnostic helper: currently registered task ids by bucket. */
export function getRegisteredTaskIds(): Record<ResumeBucket, string[]> {
  const out: Record<ResumeBucket, string[]> = {
    immediate: [],
    frame: [],
    interactions: [],
    background: [],
  };
  for (const task of tasks.values()) out[task.bucket].push(task.id);
  return out;
}

// ============================================================================
// DRAIN
// ============================================================================

function tasksForBucket(bucket: ResumeBucket): ResumeTask[] {
  const out: ResumeTask[] = [];
  for (const task of tasks.values()) {
    if (task.bucket === bucket) out.push(task);
  }
  return out;
}

/**
 * Run one bucket to settlement. Every task starts concurrently within the
 * bucket — the serialization that matters is BETWEEN buckets, not inside one.
 * Failures are recorded and swallowed.
 */
async function runBucket(
  bucket: ResumeBucket,
  generation: number,
): Promise<void> {
  const bucketTasks = tasksForBucket(bucket);
  if (bucketTasks.length === 0) return;

  const online = isOnlineFn();
  const startedAt = Date.now();

  await Promise.all(
    bucketTasks.map(async (task) => {
      if (task.requiresNetwork && !online) {
        recordCount(KEY_RESUME_TASKS_SKIPPED);
        return;
      }
      try {
        if (task.shouldRun && !task.shouldRun()) {
          recordCount(KEY_RESUME_TASKS_SKIPPED);
          return;
        }
      } catch {
        // A throwing gate is treated as "don't run" — never let a predicate
        // bug take down the drain.
        recordCount(KEY_RESUME_TASKS_SKIPPED);
        return;
      }

      const taskStartedAt = Date.now();
      try {
        await task.run();
        recordCount(KEY_RESUME_TASKS_RUN);
      } catch (err) {
        recordCount(KEY_RESUME_TASK_ERROR);
        console.warn(
          `[LifecycleCoordinator] resume task "${task.id}" failed:`,
          err,
        );
      } finally {
        recordSpan(KEY_RESUME_TASK_MS, Date.now() - taskStartedAt);
      }
    }),
  );

  // Only attribute the bucket span if this drain is still the current one.
  if (generation === resumeGeneration) {
    const elapsed = Date.now() - startedAt;
    recordSample(KEY_RESUME_BUCKET_MS, elapsed);
    recordSample(resumeBucketKeyIds(bucket), elapsed);
  }
}

function cancelScheduled(): void {
  if (frameHandle !== null) {
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }
  if (interactionHandle !== null) {
    interactionHandle.cancel();
    interactionHandle = null;
  }
  if (idleHandle !== null) {
    clearTimeout(idleHandle);
    idleHandle = null;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    frameHandle = requestAnimationFrame(() => {
      frameHandle = null;
      resolve();
    });
  });
}

function afterInteractions(): Promise<void> {
  return new Promise((resolve) => {
    interactionHandle = InteractionManager.runAfterInteractions(() => {
      interactionHandle = null;
      resolve();
    });
  });
}

function afterIdle(): Promise<void> {
  return new Promise((resolve) => {
    idleHandle = setTimeout(() => {
      idleHandle = null;
      resolve();
    }, BACKGROUND_BUCKET_DELAY_MS);
  });
}

/**
 * Drain all buckets in order for one resume. A newer resume bumps the
 * generation and this drain aborts at the next checkpoint rather than
 * interleaving two passes.
 */
async function drain(generation: number): Promise<void> {
  draining = true;
  try {
    await runBucket("immediate", generation);
    if (generation !== resumeGeneration) return;

    await nextFrame();
    if (generation !== resumeGeneration) return;
    await runBucket("frame", generation);
    if (generation !== resumeGeneration) return;

    await afterInteractions();
    if (generation !== resumeGeneration) return;
    await runBucket("interactions", generation);
    if (generation !== resumeGeneration) return;

    await afterIdle();
    if (generation !== resumeGeneration) return;
    await runBucket("background", generation);
  } finally {
    if (generation === resumeGeneration) {
      draining = false;
      // Close only for the current drain — an aborted older drain must not
      // close the window a newer resume just opened.
      closeResumeRequestWindow();
    }
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Kick a resume drain. Exported for the sign-in path and tests — the normal
 * trigger is the AppState listener below.
 */
export function triggerResume(): void {
  resumeGeneration++;
  cancelScheduled();
  openResumeRequestWindow();
  void drain(resumeGeneration);
}

function handleAppStateChange(next: AppStateStatus): void {
  const wasForeground = lastAppState === "active";
  lastAppState = next;

  if (next === "active") {
    // Drain only after a REAL background, not after `inactive`. iOS emits
    // `inactive` for transient interruptions (control center, notification
    // shade, an incoming call banner) with no background in between; firing
    // the whole recovery pass on those is the storm this exists to prevent.
    // A genuine screen-off/lock always passes through `background`.
    if (sawBackground) {
      sawBackground = false;
      triggerResume();
    }
  } else {
    if (next === "background") sawBackground = true;
    // Abort any in-flight drain — its remaining buckets are pointless once
    // we're backgrounded, and letting them land keeps timers alive.
    resumeGeneration++;
    cancelScheduled();
    draining = false;
    closeResumeRequestWindow();

    // Suspend work runs on the FIRST leave-foreground edge, including
    // `inactive`. Unlike resume, flushing early is the safe direction: MMKV
    // persistence and timer teardown must happen before the OS can kill us,
    // and iOS gives no guarantee that `background` arrives after `inactive`.
    // Guarded on wasForeground so active->inactive->background flushes once.
    if (wasForeground) runSuspendTasks();
  }
}

/**
 * Run every suspend task. Synchronous and individually guarded — the process
 * may be killed moments later, so one throwing handler must not prevent the
 * rest from flushing their state.
 */
function runSuspendTasks(): void {
  for (const task of suspendTasks.values()) {
    try {
      task.run();
    } catch (err) {
      console.warn(
        `[LifecycleCoordinator] suspend task "${task.id}" failed:`,
        err,
      );
    }
  }
}

/**
 * Install the single AppState listener. Idempotent.
 *
 * @param getIsOnline shared network-state accessor (offlineSyncService's
 *        getRawIsOnline) used to gate `requiresNetwork` tasks.
 */
export function startAppLifecycleCoordinator(
  getIsOnline: () => boolean,
): void {
  if (started) return;
  started = true;
  isOnlineFn = getIsOnline;
  lastAppState = AppState.currentState;
  appStateSubscription = AppState.addEventListener(
    "change",
    handleAppStateChange,
  );
}

/** Tear down. Used by tests and the app-unmount path. */
export function stopAppLifecycleCoordinator(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
  started = false;
  resumeGeneration++;
  cancelScheduled();
  draining = false;
  closeResumeRequestWindow();
}

/** Test-only: full reset including the task registry. */
export function resetAppLifecycleCoordinatorForTests(): void {
  stopAppLifecycleCoordinator();
  tasks.clear();
  suspendTasks.clear();
  resumeGeneration = 0;
  lastAppState = "active";
  isOnlineFn = () => true;
}

/** Diagnostic: is a resume drain currently in flight? */
export function isDraining(): boolean {
  return draining;
}
