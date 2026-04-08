/**
 * Session Conflict Detection Service
 *
 * Pure service (no hooks, no zustand) that detects and categorizes
 * session-level conflicts between local and remote table sessions.
 *
 * Follows the same pattern as conflictDetectionService.ts.
 */

import type { SessionConflict, SessionConflictType } from "@/types/conflict-resolution";

// ============================================================================
// TYPES (local to service, inputs for detection)
// ============================================================================

export interface LocalSessionState {
  id: string;
  status: string;
  orderId?: string;
  hasItems: boolean;
  hasPayments: boolean;
}

export interface RemoteSessionState {
  id: string;
  status: string;
  orderId?: string;
}

// ============================================================================
// MAIN DETECTION
// ============================================================================

/**
 * Detect a session conflict between local and remote state for a table.
 * Returns null if no conflict.
 */
export function detectSessionConflict(
  tableId: string,
  localSession: LocalSessionState,
  remoteSession: RemoteSessionState,
  tableName?: string,
): SessionConflict | null {
  // Same session, same status — no conflict
  if (
    localSession.id === remoteSession.id &&
    localSession.status === remoteSession.status
  ) {
    return null;
  }

  const conflictType = categorizeSessionConflict(localSession, remoteSession);
  const { severity, resolution, autoResolved } = resolveSessionConflict(
    conflictType,
    localSession,
  );

  return {
    id: `session_conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    tableId,
    tableName,
    conflictType,
    localSession: {
      id: localSession.id,
      status: localSession.status,
      orderId: localSession.orderId,
      hasItems: localSession.hasItems,
      hasPayments: localSession.hasPayments,
    },
    remoteSession: {
      id: remoteSession.id,
      status: remoteSession.status,
      orderId: remoteSession.orderId,
    },
    severity,
    resolution,
    detectedAt: new Date().toISOString(),
    autoResolved,
  };
}

// ============================================================================
// CATEGORIZATION
// ============================================================================

function categorizeSessionConflict(
  local: LocalSessionState,
  remote: RemoteSessionState,
): SessionConflictType {
  // Different session IDs = either duplicate or lifecycle divergence
  if (local.id !== remote.id) {
    // If local session looks completed (cleared/paid) and remote has a new session
    const completedStatuses = ["cleared", "paid", "closed", "cleaning"];
    if (completedStatuses.includes(local.status)) {
      return "lifecycle_divergence";
    }
    return "duplicate_session";
  }

  // Same session, different states
  return "concurrent_modification";
}

// ============================================================================
// RESOLUTION LOGIC
// ============================================================================

/**
 * Resolution rules per design decision:
 *
 * | Conflict          | Local State             | Resolution       | Auto? |
 * |-------------------|-------------------------|------------------|-------|
 * | Duplicate         | Empty (no items)        | accept_remote    | Yes   |
 * | Duplicate         | Has items, no payments  | create_separate  | Yes   |
 * | Duplicate         | Has payments            | create_separate  | Yes*  |
 * | Divergence        | Completed               | accept_remote    | Yes   |
 * | Concurrent        | Same session            | accept_remote    | Yes   |
 *
 * *With warning toast for payment conflicts
 */
function resolveSessionConflict(
  conflictType: SessionConflictType,
  local: LocalSessionState,
): {
  severity: "critical" | "warning" | "info";
  resolution: "accept_remote" | "create_separate" | "prompt_user";
  autoResolved: boolean;
} {
  switch (conflictType) {
    case "duplicate_session": {
      if (!local.hasItems) {
        // Empty order — just accept remote, discard local
        return { severity: "info", resolution: "accept_remote", autoResolved: true };
      }
      if (local.hasPayments) {
        // Has payments — create separate but warn
        return { severity: "warning", resolution: "create_separate", autoResolved: true };
      }
      // Has items, no payments — create separate order
      return { severity: "info", resolution: "create_separate", autoResolved: true };
    }

    case "lifecycle_divergence":
      // Local completed, remote has new session — accept remote
      return { severity: "info", resolution: "accept_remote", autoResolved: true };

    case "concurrent_modification":
      // Same session, different states — accept remote (more advanced status)
      return { severity: "info", resolution: "accept_remote", autoResolved: true };

    default:
      return { severity: "info", resolution: "accept_remote", autoResolved: true };
  }
}

// ============================================================================
// TOAST MESSAGE GENERATION
// ============================================================================

/**
 * Generate a user-facing toast message for a session conflict.
 */
export function getSessionConflictToastMessage(conflict: SessionConflict): {
  title: string;
  message: string;
  type: "success" | "error" | "warning";
} {
  const tableName = conflict.tableName || `Table ${conflict.tableId.slice(0, 6)}`;

  switch (conflict.conflictType) {
    case "duplicate_session":
      if (conflict.localSession.hasPayments) {
        return {
          title: "Payment Conflict",
          message: `Payment conflict on ${tableName} — check order history`,
          type: "warning",
        };
      }
      if (conflict.localSession.hasItems) {
        return {
          title: "Order Saved",
          message: `Offline order for ${tableName} saved as separate order`,
          type: "warning",
        };
      }
      return {
        title: "Table Synced",
        message: `${tableName} already seated by another station`,
        type: "success",
      };

    case "lifecycle_divergence":
      return {
        title: "Table Synced",
        message: `${tableName} synced — new guests accepted`,
        type: "success",
      };

    case "concurrent_modification":
      return {
        title: "Table Updated",
        message: `${tableName} updated by another station`,
        type: "success",
      };

    default:
      return {
        title: "Table Synced",
        message: `${tableName} was updated`,
        type: "success",
      };
  }
}
