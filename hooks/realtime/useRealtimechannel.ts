// hooks/useRealtimeChannel.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';
import type {
  RealtimeChannelTopic,
  RealtimeEventType,
  ChannelState,
  ChannelStatus
} from '@/types/real-time';

interface UseRealtimeChannelOptions<T> {
  supabaseClient: SupabaseClient; // NEW: Required prop to avoid hooks violation
  topic: RealtimeChannelTopic;
  events: RealtimeEventType[];
  onMessage: (event: RealtimeEventType, payload: T) => void;
  onStatusChange?: (status: ChannelStatus) => void;
  enabled?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseRealtimeChannelReturn {
  status: ChannelStatus;
  reconnect: () => void;
  disconnect: () => void;
}

export function useRealtimeChannel<T>({
  supabaseClient, // NEW: Accept as prop instead of calling hook
  topic,
  events,
  onMessage,
  onStatusChange,
  enabled = true,
  maxReconnectAttempts = 5,
  reconnectDelay = 2000,
}: UseRealtimeChannelOptions<T>): UseRealtimeChannelReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const [status, setStatus] = useState<ChannelStatus>({
    topic,
    state: 'CLOSED',
    lastError: null,
    reconnectAttempts: 0,
    subscribedAt: null,
  });

  // Update status and notify parent
  const updateStatus = useCallback((updates: Partial<ChannelStatus>) => {
    setStatus(prev => {
      const newStatus = { ...prev, ...updates };
      onStatusChange?.(newStatus);
      return newStatus;
    });
  }, [onStatusChange]);

  // Core subscription logic
  const subscribe = useCallback(async () => {
    // FIXED: Use prop instead of calling hook inside callback
    // Clean up existing channel
    if (channelRef.current) {
      await supabaseClient.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Set auth token for Realtime Authorization
    await supabaseClient.realtime.setAuth();

    // Create new channel with private config
    const channel = supabaseClient.channel(topic, {
      config: { private: true },
    });

    // Register event handlers
    events.forEach(event => {
      channel.on('broadcast', { event }, (payload) => {
        onMessage(event, payload.payload as T);
      });
    });

    // Handle subscription state changes
    channel.subscribe((state, err) => {
      console.log(`[Realtime] Channel ${topic} state: ${state}`, `${err ? err : ''}`);

      switch (state) {
        case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
          reconnectAttemptsRef.current = 0;
          updateStatus({
            state: 'SUBSCRIBED',
            lastError: null,
            reconnectAttempts: 0,
            subscribedAt: new Date(),
          });
          break;

        case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
          updateStatus({ state: 'TIMED_OUT' });
          handleReconnect();
          break;

        case REALTIME_SUBSCRIBE_STATES.CLOSED:
          updateStatus({ state: 'CLOSED' });
          break;

        case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
          updateStatus({
            state: 'CHANNEL_ERROR',
            lastError: err || new Error('Channel error'),
          });
          handleReconnect();
          break;
      }
    });

    channelRef.current = channel;
  }, [supabaseClient, topic, events, onMessage, updateStatus]);

  // Reconnection logic with exponential backoff
  const handleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn(`[Realtime] Max reconnect attempts reached for ${topic}`);
      updateStatus({
        state: 'CHANNEL_ERROR',
        lastError: new Error('Max reconnection attempts reached'),
      });
      return;
    }

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Calculate delay with exponential backoff
    const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
    reconnectAttemptsRef.current += 1;

    updateStatus({
      reconnectAttempts: reconnectAttemptsRef.current,
    });

    console.log(`[Realtime] Reconnecting ${topic} in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      // FIXED: Use prop instead of calling hook inside setTimeout
      // Unsubscribe first (Reddit pattern)
      if (channelRef.current) {
        await supabaseClient.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      // Re-subscribe
      subscribe();
    }, delay);
  }, [supabaseClient, topic, maxReconnectAttempts, reconnectDelay, subscribe, updateStatus]);

  // Manual reconnect trigger
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    subscribe();
  }, [subscribe]);

  // Disconnect
  const disconnect = useCallback(async () => {
    // FIXED: Use prop instead of calling hook inside callback
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (channelRef.current) {
      await supabaseClient.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    updateStatus({ state: 'CLOSED', subscribedAt: null });
  }, [supabaseClient, updateStatus]);

  // Main effect
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    subscribe();

    return () => {
      disconnect();
    };
  }, [enabled, subscribe, disconnect]);

  return { status, reconnect, disconnect };
}