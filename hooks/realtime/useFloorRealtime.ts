// hooks/useFloorRealtime.ts
// Real-time updates for floor/table management

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  buildChannelTopic,
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
  onSessionChange,
  onTableAssignment,
  onSessionEvent,
  onOrderUpdate,
}: UseFloorRealtimeOptions) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient(); // Call at component level (not inside callbacks)

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

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: RealtimeEventType, payload: unknown) => {
      console.log(`[FloorRealtime] Event: ${event}`, payload);

      switch (event) {
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE': {
          // Session changes - invalidate queries and call callback
          const sessionPayload = payload as TableSessionPayload;

          // UPDATE STORE STATE: This ensures UI gets real-time data
          const store = useFloorPlanStore.getState();
          store._handleSessionChange(sessionPayload);

          // Propagate to session store so individual events don't lag
          useTableSessionStore.getState()._handleSessionChange(sessionPayload);

          // Invalidate floor sessions list
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessions(locationId),
          });

          // Invalidate table statuses (for floor plan visual)
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.tableStatuses(locationId),
          });

          // If we have session ID, also invalidate detail view
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

          const store = useFloorPlanStore.getState();
          store._debouncedRefresh();

          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessions(locationId),
          });

          // Invalidate specific session if available
          if (assignmentPayload.session_id) {
            queryClient.invalidateQueries({
              queryKey: floorQueryKeys.sessionDetail(assignmentPayload.session_id),
            });
          }

          onTableAssignment?.(assignmentPayload);
          break;
        }

        case 'SESSION_EVENT': {
          // Timeline event (coursing, flags, etc.)
          const eventPayload = payload as SessionEventPayload;

          // Invalidate session events timeline
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessionEvents(eventPayload.session_id),
          });

          // Also invalidate session detail for status badge updates
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessionDetail(eventPayload.session_id),
          });

          // If attention or status changed, invalidate floor view
          if (
            eventPayload.event_type === 'attention_flagged' ||
            eventPayload.event_type === 'attention_cleared' ||
            eventPayload.event_type === 'course_served'
          ) {
            queryClient.invalidateQueries({
              queryKey: floorQueryKeys.sessions(locationId),
            });
          }

          onSessionEvent?.(eventPayload);
          break;
        }

        case 'SESSION_ORDER_UPDATE': {
          // Order linked to session was updated
          const orderPayload = payload as OrderPayload;

          // Invalidate floor sessions (order amount may have changed)
          queryClient.invalidateQueries({
            queryKey: floorQueryKeys.sessions(locationId),
          });

          onOrderUpdate?.(orderPayload);
          break;
        }
      }
    },
    [locationId, queryClient, onSessionChange, onTableAssignment, onSessionEvent, onOrderUpdate]
  );

  const { status, reconnect, disconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase, // Pass supabase client as prop
    topic: `location:${locationId}:tables`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!locationId && !!supabase, // Add supabase check
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
  const supabase = useSupabaseClient(); // Call at component level

  const events: RealtimeEventType[] = useMemo(() => ['SESSION_EVENT'], []);

  const handleMessage = useCallback(
    (_event: RealtimeEventType, payload: unknown) => {
      const eventPayload = payload as SessionEventPayload;

      // Invalidate session events query
      queryClient.invalidateQueries({
        queryKey: floorQueryKeys.sessionEvents(sessionId),
      });

      onEvent?.(eventPayload);
    },
    [sessionId, queryClient, onEvent]
  );

  // Note: This subscribes to session-specific channel for granular updates
  const { status, reconnect } = useRealtimeChannel<unknown>({
    supabaseClient: supabase, // Pass supabase client as prop
    topic: `session:${sessionId}:events`,
    events,
    onMessage: handleMessage,
    enabled: enabled && !!sessionId && !!supabase, // Add supabase check
  });

  return {
    connectionStatus: status,
    reconnect,
    isConnected: status.state === 'SUBSCRIBED',
  };
}