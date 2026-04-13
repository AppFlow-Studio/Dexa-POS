// hooks/useFloorRealtime.ts
// Real-time updates for floor/table management

import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { useRealtimeChannel } from './useRealtimechannel';
import { useFloorPlanStore } from '@/stores/useFloorPlanStore';
import { useTableSessionStore } from '@/stores/useTableSessionStore';
import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import type {
  TableSessionPayload,
  TableAssignmentPayload,
  SessionEventPayload,
  OrderPayload,
  RealtimeEventType,
  UseFloorRealtimeOptions,
} from '@/types/real-time';

// Query keys for cache invalidation
export const floorQueryKeys = {
  sessions: (locationId: string) => ['floor-sessions', locationId] as const,
  tableStatuses: (locationId: string) => ['table-statuses', locationId] as const,
  sessionEvents: (sessionId: string) => ['session-events', sessionId] as const,
  sessionDetail: (sessionId: string) => ['session-detail', sessionId] as const,
} as const;

/**
 * Hook for real-time floor/table updates
 *
 * Subscribes to: `location:{locationId}:tables`
 *
 * Events handled:
 * - INSERT/UPDATE/DELETE: Session changes
 * - TABLE_ASSIGNMENT_*: Table assignment changes
 * - SESSION_EVENT: Timeline events (coursing, flags)
 * - SESSION_ORDER_UPDATE: Order updates for dine-in
 */
export function useFloorRealtime({
  locationId,
  enabled = true,
  maxReconnectAttempts,
  onSessionChange,
  onTableAssignment,
  onSessionEvent,
  onOrderUpdate,
}: UseFloorRealtimeOptions) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient();

  // Events we care about for floor view
  const events: RealtimeEventType[] = useMemo(
    () => [
      'INSERT',
      'UPDATE',
      'DELETE',
      'TABLE_ASSIGNMENT_INSERT',
      'TABLE_ASSIGNMENT_UPDATE',
      'TABLE_ASSIGNMENT_DELETE',
      'SESSION_EVENT',
      'SESSION_ORDER_UPDATE',
    ],
    []
  );

  // ====================================================================
  // DEBOUNCED INVALIDATION (batch rapid session/table updates)
  // ====================================================================

  // Debounced 300ms: Session list + table statuses
  const debouncedInvalidateSessions = useMemo(
    () =>
      debounce((locationId: string) => {
        queryClient.invalidateQueries({
          queryKey: floorQueryKeys.sessions(locationId),
        });
        queryClient.invalidateQueries({
          queryKey: floorQueryKeys.tableStatuses(locationId),
        });
      }, 300),
    [queryClient]
  );

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedInvalidateSessions.cancel();
    };
  }, [debouncedInvalidateSessions]);

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      if (__DEV__) console.log(`[FloorRealtime] Event: ${event}`, payload);

      switch (event) {
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE': {
          const sessionPayload = payload as TableSessionPayload;

          // UPDATE STORE STATE: ensures UI gets real-time data
          useFloorPlanStore.getState()._handleSessionChange(sessionPayload);
          useTableSessionStore.getState()._handleSessionChange(sessionPayload);

          // DEBOUNCED: Session list + table statuses (batch rapid updates)
          debouncedInvalidateSessions(locationId);

          // IMMEDIATE: Session detail (critical for active table view)
          if (sessionPayload.data?.session?.id) {
            queryClient.invalidateQueries({
              queryKey: floorQueryKeys.sessionDetail(sessionPayload.data.session.id),
            });
          }

          onSessionChange?.(sessionPayload);
          break;
        }

        case 'TABLE_ASSIGNMENT_INSERT':
        case 'TABLE_ASSIGNMENT_UPDATE':
        case 'TABLE_ASSIGNMENT_DELETE': {
          const assignmentPayload = payload as TableAssignmentPayload;

          useFloorPlanStore.getState()._debouncedRefresh();

          // DEBOUNCED: Session list
          debouncedInvalidateSessions(locationId);

          // IMMEDIATE: Specific session if available
          if (assignmentPayload.session_id) {
            queryClient.invalidateQueries({
              queryKey: floorQueryKeys.sessionDetail(assignmentPayload.session_id),
            });
          }

          onTableAssignment?.(assignmentPayload);
          break;
        }

        case 'SESSION_EVENT': {
          const eventPayload = payload as SessionEventPayload;

          // IMMEDIATE: Session events timeline + detail
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessionEvents(eventPayload.session_id),
          });
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessionDetail(eventPayload.session_id),
          });

          // CONDITIONAL + DEBOUNCED: Floor view only for status-affecting events
          if (
            eventPayload.event_type === 'attention_flagged' ||
            eventPayload.event_type === 'attention_cleared' ||
            eventPayload.event_type === 'course_served'
          ) {
            debouncedInvalidateSessions(locationId);
          }

          onSessionEvent?.(eventPayload);
          break;
        }

        case 'SESSION_ORDER_UPDATE': {
          const orderPayload = payload as OrderPayload;

          // DEBOUNCED: Floor sessions (order amount may have changed)
          debouncedInvalidateSessions(locationId);

          onOrderUpdate?.(orderPayload);
          break;
        }
      }
    },
    [locationId, queryClient, debouncedInvalidateSessions, onSessionChange, onTableAssignment, onSessionEvent, onOrderUpdate]
  );

  const { status, reconnect, disconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase,
    topic: `location:${locationId}:tables`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId && !!supabase,
    ...(maxReconnectAttempts != null && { maxReconnectAttempts }),
  });

  return {
    connectionStatus: status,
    reconnect,
    disconnect,
    isConnected: status.state === 'SUBSCRIBED',
    isReconnecting: status.reconnectAttempts > 0 && status.state !== 'SUBSCRIBED',
  };
}

/**
 * Hook for real-time session-specific events
 * Use this when viewing a single session's detail/timeline
 */
export function useSessionEventsRealtime({
  sessionId,
  enabled = true,
  onEvent,
}: {
  sessionId: string;
  enabled?: boolean;
  onEvent?: (payload: SessionEventPayload) => void;
}) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient();

  const events: RealtimeEventType[] = useMemo(() => ['SESSION_EVENT'], []);

  const handleMessage = useCallback(
    (_event: RealtimeEventType, payload: unknown) => {
      const eventPayload = payload as SessionEventPayload;

      queryClient.invalidateQueries({
        queryKey: floorQueryKeys.sessionEvents(sessionId),
      });

      onEvent?.(eventPayload);
    },
    [sessionId, queryClient, onEvent]
  );

  const { status, reconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase,
    topic: `session:${sessionId}:events`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!sessionId && !!supabase,
  });

  return {
    connectionStatus: status,
    reconnect,
    isConnected: status.state === 'SUBSCRIBED',
  };
}
