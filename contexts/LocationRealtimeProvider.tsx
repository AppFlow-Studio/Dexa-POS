// providers/LocationRealtimeProvider.tsx
// Centralized provider for all location-scoped realtime subscriptions

import { useFloorRealtime } from '@/hooks/realtime/useFloorRealtime';
import { createContext, ReactNode, useCallback, useContext } from 'react';
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
  callbacks,
}: LocationRealtimeProviderProps) {
  // Floor realtime subscription
  const floorRealtime = useFloorRealtime({
    locationId,
    enabled,
    onSessionChange: callbacks?.onSessionChange,
    onTableAssignment: callbacks?.onTableAssignment,
    onSessionEvent: callbacks?.onSessionEvent,
    onOrderUpdate: callbacks?.onOrderChange,
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
    onOrderChange: callbacks?.onOrderChange,
    onPaymentChange: callbacks?.onPaymentChange,
  });

  // Reconnect all channels
  const reconnectAll = useCallback(() => {
    console.log('[LocationRealtime] Reconnecting all channels...');
    floorRealtime.reconnect();
    // waitlistRealtime.reconnect();
    ordersRealtime.reconnect();
  }, [floorRealtime]);

  // Disconnect all channels
  const disconnectAll = useCallback(() => {
    console.log('[LocationRealtime] Disconnecting all channels...');
    floorRealtime.disconnect();
    // waitlistRealtime.disconnect();
    ordersRealtime.disconnect();
  }, [floorRealtime]);

  // Aggregate status
  const allConnected =
    floorRealtime.isConnected  && 
    // waitlistRealtime.isConnected &&
    ordersRealtime.isConnected;

  const isReconnecting =
    floorRealtime.isReconnecting || 
    // waitlistRealtime.isReconnecting ||
    ordersRealtime.isReconnecting;

  const value: LocationRealtimeContextValue = {
    floor: {
      status: floorRealtime.connectionStatus,
      isConnected: floorRealtime.isConnected,
      isReconnecting: floorRealtime.isReconnecting,
      reconnect: floorRealtime.reconnect,
    },
    // waitlist: {
    //   status: waitlistRealtime.connectionStatus,
    //   isConnected: waitlistRealtime.isConnected,
    //   isReconnecting: waitlistRealtime.isReconnecting,
    //   reconnect: waitlistRealtime.reconnect,
    // },
    orders: {
      status: ordersRealtime.connectionStatus,
      isConnected: ordersRealtime.isConnected,
      isReconnecting: ordersRealtime.isReconnecting,
      reconnect: ordersRealtime.reconnect,
    },
    reconnectAll,
    disconnectAll,
    allConnected,
    isReconnecting,
    locationId,
  };

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