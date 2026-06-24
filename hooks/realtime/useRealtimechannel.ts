// hooks/useRealtimeChannel.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES, SupabaseClient } from '@supabase/supabase-js';
import type {
  RealtimeChannelTopic,
  RealtimeEventType,
  ChannelState,
  ChannelStatus
} from '@/types/real-time';

interface UseRealtimeChannelOptions<T> {
  supabaseClient: SupabaseClient;
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

const MAX_BACKOFF_MS = 60_000; // Cap exponential backoff at 60 seconds

export function useRealtimeChannel<T>({
  supabaseClient,
  topic,
  events,
  onMessage,
  onStatusChange,
  enabled = true,
  maxReconnectAttempts = 15,
  reconnectDelay = 2000,
}: UseRealtimeChannelOptions<T>): UseRealtimeChannelReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribeRef = useRef<() => void>(() => {});
  const subscribePromiseRef = useRef<Promise<void> | null>(null);
  const subscriptionAttemptRef = useRef(0);
  const shouldBeConnectedRef = useRef(false);
  const statusRef = useRef<ChannelState>('CLOSED');
  const isIntentionalCloseRef = useRef(false);
  // Pending requestAnimationFrame handles for deferred broadcast dispatch, so
  // they can be cancelled on teardown (otherwise a frame scheduled just before
  // unmount/disconnect still fires its callback after the channel is gone).
  const pendingFramesRef = useRef<Set<number>>(new Set());

  // Stabilize callbacks and events via refs to prevent channel teardown on parent re-renders
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

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
      if (updates.state) {
        statusRef.current = updates.state;
      }
      onStatusChangeRef.current?.(newStatus);
      return newStatus;
    });
  }, []);

  // Core subscription logic
  const subscribe = useCallback(() => {
    shouldBeConnectedRef.current = true;
    if (subscribePromiseRef.current) return subscribePromiseRef.current;

    const attempt = ++subscriptionAttemptRef.current;
    const promise = (async () => {
      // Clean up existing channel
      if (channelRef.current) {
        isIntentionalCloseRef.current = true;
        await supabaseClient.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      isIntentionalCloseRef.current = false;

      // Set auth token for Realtime Authorization
      await supabaseClient.realtime.setAuth();
      if (
        attempt !== subscriptionAttemptRef.current ||
        !shouldBeConnectedRef.current
      ) {
        return;
      }

      // Create new channel with private config
      const channel = supabaseClient.channel(topic, {
        config: { private: true },
      });
      // Assign before subscribing so concurrent triggers can see the channel.
      channelRef.current = channel;

      // Register event handlers
      eventsRef.current.forEach(event => {
        if (__DEV__) console.log(`[Realtime] Registering handler for event: ${event} on ${topic}`);
        channel.on('broadcast', { event }, (payload) => {
          if (__DEV__) console.log(`[Realtime] Received event: ${event} on ${topic}`);
          // Defer to next frame to avoid re-render storms when broadcasts
          // arrive during screen transitions or reconnect hydration. Track the
          // handle so teardown can cancel a frame that hasn't fired yet.
          const frame = requestAnimationFrame(() => {
            pendingFramesRef.current.delete(frame);
            onMessageRef.current(event, payload.payload as T);
          });
          pendingFramesRef.current.add(frame);
        });
      });

      // Handle subscription state changes
      channel.subscribe((state, err) => {
        if (__DEV__) console.log(`[Realtime] Channel ${topic} state: ${state}`, `${err ? err : ''}`);

        switch (state) {
          case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
            reconnectAttemptsRef.current = 0;
            if (__DEV__) {
              console.log(`[Realtime] Successfully subscribed to ${topic}`, {
                registeredEvents: events,
                channelState: state,
              });
            }
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
            if (!isIntentionalCloseRef.current) {
              handleReconnect();
            }
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
    })().finally(() => {
      if (subscribePromiseRef.current === promise) {
        subscribePromiseRef.current = null;
      }
      if (shouldBeConnectedRef.current && !channelRef.current) {
        subscribeRef.current();
      }
    });

    subscribePromiseRef.current = promise;
    return promise;
  }, [supabaseClient, topic, updateStatus]);

  // Keep subscribeRef in sync for AppState effect
  subscribeRef.current = subscribe;

  // Reconnection logic with exponential backoff (capped at 60s)
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

    // Calculate delay with exponential backoff, capped at MAX_BACKOFF_MS
    const delay = Math.min(
      reconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
      MAX_BACKOFF_MS,
    );
    reconnectAttemptsRef.current += 1;

    updateStatus({
      reconnectAttempts: reconnectAttemptsRef.current,
    });

    if (__DEV__) console.log(`[Realtime] Reconnecting ${topic} in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      // Unsubscribe first
      if (channelRef.current) {
        isIntentionalCloseRef.current = true;
        await supabaseClient.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      // Refresh auth token before re-subscribing
      try {
        await supabaseClient.realtime.setAuth();
      } catch (error) {
        console.error('[Realtime] Failed to refresh auth token on reconnect:', error);
      }
      // Re-subscribe
      subscribeRef.current();
    }, delay);
  }, [supabaseClient, topic, maxReconnectAttempts, reconnectDelay, updateStatus]);

  // Manual reconnect trigger
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    subscribe();
  }, [subscribe]);

  // Disconnect
  const disconnect = useCallback(async () => {
    shouldBeConnectedRef.current = false;
    subscriptionAttemptRef.current += 1;
    isIntentionalCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    // Cancel any deferred broadcast dispatches that haven't fired yet.
    for (const frame of pendingFramesRef.current) cancelAnimationFrame(frame);
    pendingFramesRef.current.clear();
    if (channelRef.current) {
      // Capture + detach synchronously before nulling the ref. removeChannel
      // is async, but React cleanups don't await — if this cleanup is followed
      // immediately by a re-subscribe (store/auth/topic transition), the new
      // subscribe() would see channelRef.current === null and skip removing
      // this channel, orphaning it on the shared socket (a real leak that
      // compounds over uptime). unsubscribe() is synchronous and detaches the
      // channel's handlers right away; removeChannel then frees it fully.
      const stale = channelRef.current;
      channelRef.current = null;
      try {
        stale.unsubscribe();
      } catch {
        /* best-effort sync teardown */
      }
      await supabaseClient.removeChannel(stale);
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

  // Periodic auth token refresh (10 min). On failure force reconnect
  // so we don't leave the channel in a half-dead state with expired token.
  useEffect(() => {
    if (!enabled || status.state !== 'SUBSCRIBED') return;

    const refreshInterval = setInterval(async () => {
      try {
        await supabaseClient.realtime.setAuth();
      } catch (error) {
        console.error('[Realtime] Failed to refresh auth token:', error);
        handleReconnect();
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [enabled, status.state, supabaseClient, handleReconnect]);

  // Network state awareness: reconnect when network restores
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && statusRef.current !== 'SUBSCRIBED') {
        if (__DEV__) console.log(`[Realtime] Network restored, reconnecting ${topic}`);
        // Reset reconnect budget and reconnect immediately
        reconnectAttemptsRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        subscribeRef.current();
      }
    });

    return () => unsubscribe();
  }, [enabled, topic]);

  // Reconnect channels when app returns to foreground
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') return;

      // Reset reconnect budget - attempts were likely wasted while suspended
      reconnectAttemptsRef.current = 0;

      // Clear any stale reconnect timeout to prevent double-subscribe race
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const currentState = statusRef.current;
      const channel = channelRef.current;

      if (!channel || currentState !== 'SUBSCRIBED') {
        // Channel is dead or missing - full reconnect after short delay for network restoration
        if (__DEV__) console.log(`[Realtime] App foregrounded, reconnecting ${topic} (state: ${currentState})`);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) {
            subscribeRef.current();
          }
        }, 1000);
      } else {
        // Channel appears healthy - proactively refresh auth token
        if (__DEV__) console.log(`[Realtime] App foregrounded, ${topic} still SUBSCRIBED, refreshing auth`);
        supabaseClient.realtime.setAuth().catch((error) => {
          console.error(`[Realtime] Failed to refresh auth for ${topic} on foreground:`, error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [enabled, supabaseClient, topic]);

  return { status, reconnect, disconnect };
}
