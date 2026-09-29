// providers/LocationRealtimeProvider.tsx
// Centralized provider for all location-scoped realtime subscriptions

import { useFloorRealtime } from '@/hooks/realtime/useFloorRealtime';
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';
// import { useWaitlistRealtime } from '@/hooks/useWaitlistRealtime';
// import { useOrdersRealtime } from '@/hooks/useOrdersRealtime';
import { useOrdersRealtime } from '@/hooks/realtime/useOrdersRealtime';
import type {
  ChannelStatus,
  OrderPayload,
  PaymentPayload,
  SessionEventPayload,
  TableAssignmentPayload,
  TableSessionPayload,
  WaitlistPayload,
} from '@/types/real-time';

// ============================================================================
// Types
// ============================================================================

interface RealtimeChannelState {
  status: ChannelStatus;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnect: () => void;
}

interface LocationRealtimeContextValue {
  /** Floor/tables channel state */
  floor: RealtimeChannelState;
  /** Waitlist channel state */
//   waitlist: RealtimeChannelState;
  /** Orders channel state */
  orders: RealtimeChannelState;
  /** Reconnect all channels */
  reconnectAll: () => void;
  /** Disconnect all channels */
  disconnectAll: () => void;
  /** True if all channels are connected */
  allConnected: boolean;
  /** True if any channel is attempting to reconnect */
  isReconnecting: boolean;
  /** Location ID this provider is scoped to */
  locationId: string;
}

interface LocationRealtimeProviderProps {
  /** Location ID to scope subscriptions */
  locationId: string;
  children: ReactNode;
  /** Enable/disable all subscriptions */
  enabled?: boolean;
  /**
   * Join the floor/tables channel (default true). Off for a station with no
   * tables (the kiosk), which would otherwise receive every table-session
   * change in the location.
   */
  floor?: boolean;
  /** Max reconnect attempts for realtime channels (default 5, increase for always-on KDS) */
  maxReconnectAttempts?: number;
  /** Callbacks for handling events (optional) */
  callbacks?: {
    onSessionChange?: (payload: TableSessionPayload) => void;
    onTableAssignment?: (payload: TableAssignmentPayload) => void;
    onSessionEvent?: (payload: SessionEventPayload) => void;
    onWaitlistChange?: (payload: WaitlistPayload) => void;
    onOrderChange?: (payload: OrderPayload) => void;
    onPaymentChange?: (payload: PaymentPayload) => void;
  };
}

// ============================================================================
// Context
// ============================================================================

const LocationRealtimeContext = createContext<LocationRealtimeContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

/**
 * Provider that manages all location-scoped realtime subscriptions
 *
 * Wraps your location-specific screens to provide:
 * - Floor/table updates
 * - Waitlist updates
 * - Order/payment updates
 *
 * @example
 * ```tsx
 * <LocationRealtimeProvider locationId={currentLocationId}>
 *   <FloorPlanScreen />
 * </LocationRealtimeProvider>
 * ```
 */
export function LocationRealtimeProvider({
  locationId,
  children,
  enabled = true,
  floor = true,
  maxReconnectAttempts,
  callbacks,
}: LocationRealtimeProviderProps) {
  // Floor realtime subscription
  const floorRealtime = useFloorRealtime({
    locationId,
    enabled: enabled && floor,
    maxReconnectAttempts,
    onSessionChange: callbacks?.onSessionChange,
    onTableAssignment: callbacks?.onTableAssignment,
    onSessionEvent: callbacks?.onSessionEvent,
  });

  // Waitlist realtime subscription
//   const waitlistRealtime = useWaitlistRealtime({
//     locationId,
//     enabled,
//     onWaitlistChange: callbacks?.onWaitlistChange,
//   });

//   // Orders realtime subscription
  const ordersRealtime = useOrdersRealtime({
    locationId,
    enabled,
    maxReconnectAttempts,
    onOrderChange: callbacks?.onOrderChange,
    onPaymentChange: callbacks?.onPaymentChange,
  });

  // Destructured so the callbacks and the memo below depend on stable pieces.
  // The hooks return a fresh object every render; `reconnect` / `disconnect`
  // are stable callbacks and `connectionStatus` only changes with the channel.
  const {
    connectionStatus: floorStatus,
    isConnected: floorConnected,
    isReconnecting: floorReconnecting,
    reconnect: reconnectFloor,
    disconnect: disconnectFloor,
  } = floorRealtime;
  const {
    connectionStatus: ordersStatus,
    isConnected: ordersConnected,
    isReconnecting: ordersReconnecting,
    reconnect: reconnectOrders,
    disconnect: disconnectOrders,
  } = ordersRealtime;

  // Reconnect all channels
  const reconnectAll = useCallback(() => {
    if (__DEV__) console.log('[LocationRealtime] Reconnecting all channels...');
    reconnectFloor();
    // waitlistRealtime.reconnect();
    reconnectOrders();
  }, [reconnectFloor, reconnectOrders]);

  // Disconnect all channels
  const disconnectAll = useCallback(() => {
    if (__DEV__) console.log('[LocationRealtime] Disconnecting all channels...');
    disconnectFloor();
    // waitlistRealtime.disconnect();
    disconnectOrders();
  }, [disconnectFloor, disconnectOrders]);

  // Memoized: a new value object every render re-rendered every consumer —
  // each handheld page's connection banner, the recovery bridges — whenever
  // the provider's parent re-rendered (the main layout does on every
  // navigation), not only when a channel actually changed.
  const value = useMemo<LocationRealtimeContextValue>(
    () => ({
      floor: {
        status: floorStatus,
        isConnected: floorConnected,
        isReconnecting: floorReconnecting,
        reconnect: reconnectFloor,
      },
      // waitlist: { ...waitlistRealtime },
      orders: {
        status: ordersStatus,
        isConnected: ordersConnected,
        isReconnecting: ordersReconnecting,
        reconnect: reconnectOrders,
      },
      reconnectAll,
      disconnectAll,
      allConnected: (!floor || floorConnected) && ordersConnected,
      isReconnecting: floorReconnecting || ordersReconnecting,
      locationId,
    }),
    [
      floor,
      floorStatus,
      floorConnected,
      floorReconnecting,
      reconnectFloor,
      ordersStatus,
      ordersConnected,
      ordersReconnecting,
      reconnectOrders,
      reconnectAll,
      disconnectAll,
      locationId,
    ],
  );

  return (
    <LocationRealtimeContext.Provider value={value}>
      {children}
    </LocationRealtimeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access location realtime state
 * Must be used within LocationRealtimeProvider
 */
export function useLocationRealtime(): LocationRealtimeContextValue {
  const context = useContext(LocationRealtimeContext);

  if (!context) {
    throw new Error(
      'useLocationRealtime must be used within a LocationRealtimeProvider'
    );
  }

  return context;
}

/**
 * Hook to check if a specific channel is connected
 */
export function useIsChannelConnected(
  channel: 'floor' | 'waitlist' | 'orders'
): boolean {
  const { floor, orders } = useLocationRealtime();

  switch (channel) {
    case 'floor':
      return floor.isConnected;
    // case 'waitlist':
    //   return waitlist.isConnected;
    case 'orders':
      return orders.isConnected;
    default:
      return false;
  }
}