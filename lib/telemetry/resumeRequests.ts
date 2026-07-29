/**
 * Resume-window request accounting.
 *
 * Acceptance criterion for the lifecycle-coordinator work is "concurrent
 * request count on resume recorded before/after". That needs two numbers the
 * existing telemetry didn't have:
 *
 *   resume.requests        — how many HTTP requests a resume issued in total
 *   resume.peak_concurrent — the high-water mark of simultaneously in-flight
 *                            requests inside that window
 *
 * The second is the one that actually characterizes a storm: 11 requests
 * issued serially over 3s is fine, 11 landing at once behind a cold token
 * exchange is the bug.
 *
 * Counting is unconditional and O(1) — two integer updates per request — so
 * the numbers are comparable between builds without a flag to remember.
 * Nothing is recorded unless a resume window is open, so steady-state traffic
 * costs one boolean check.
 *
 * LEAF MODULE: imports only the telemetry registry and keys.
 */
import {
  KEY_RESUME_PEAK_CONCURRENT,
  KEY_RESUME_REQUESTS,
} from "@/lib/telemetry/keys";
import { recordSample } from "@/lib/telemetry/registry";

let inFlight = 0;

let windowOpen = false;
let windowRequests = 0;
let windowPeakConcurrent = 0;

/**
 * Called by the coordinator when a resume drain begins. Re-opening an already
 * open window (resume arriving mid-drain) closes the previous one first so
 * each recorded window maps to exactly one drain.
 */
export function openResumeRequestWindow(): void {
  if (windowOpen) closeResumeRequestWindow();
  windowOpen = true;
  windowRequests = 0;
  // Seed the peak with whatever is already in flight — requests started just
  // before the resume edge still contend with it.
  windowPeakConcurrent = inFlight;
}

/** Called by the coordinator when the drain settles or aborts. */
export function closeResumeRequestWindow(): void {
  if (!windowOpen) return;
  windowOpen = false;
  recordSample(KEY_RESUME_REQUESTS, windowRequests);
  recordSample(KEY_RESUME_PEAK_CONCURRENT, windowPeakConcurrent);
  windowRequests = 0;
  windowPeakConcurrent = 0;
}

/** Instrumented-fetch hook: a request is about to go out. */
export function noteRequestStart(): void {
  inFlight++;
  if (windowOpen) {
    windowRequests++;
    if (inFlight > windowPeakConcurrent) windowPeakConcurrent = inFlight;
  }
}

/** Instrumented-fetch hook: a request settled (resolved or rejected). */
export function noteRequestEnd(): void {
  if (inFlight > 0) inFlight--;
}

/** Diagnostic: requests in flight right now. */
export function getInFlightRequestCount(): number {
  return inFlight;
}

/** Test-only reset. */
export function resetResumeRequestsForTests(): void {
  inFlight = 0;
  windowOpen = false;
  windowRequests = 0;
  windowPeakConcurrent = 0;
}
