// hooks/useRealtimeChannel.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { registerResumeTask } from '@/lib/lifecycle/appLifecycleCoordinator';
import { getSupabaseSessionState } from '@/lib/auth/supabaseTokenCache';
import {
  KEY_RT_CHANNEL_DISCONNECT,
  KEY_RT_CHANNEL_SUBSCRIBED,
  KEY_RT_DISCONNECTED_MS,
} from '@/lib/telemetry/keys';
import { recordCount, recordSample } from '@/lib/telemetry/registry';
import {
  getRawIsOnline,
  subscribeOnlineStatus,
} from '@/services/offlineSyncService';
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
  /**
   * Attempts after which a "still retrying" warning breadcrumb is emitted.
   * Reconnection itself never stops (capped 60 s backoff with jitter).
   */
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseRealtimeChannelReturn {
  status: ChannelStatus;
  reconnect: () => void;
  disconnect: () => void;
}

const MAX_BACKOFF_MS = 60_000; // Cap exponential backoff at 60 seconds
// Longest any subscribe/reconnect path waits on the token callback. The token
// cache itself bounds a Clerk mint to 10 s; this is the belt to that suspender
// so a stuck auth can never pin a (re)subscribe.
const SET_AUTH_TIMEOUT_MS = 10_000;

/**
 * `realtime.setAuth()` re-reads the client's accessToken callback and pushes a
 * changed token to every joined channel. Bounded + never throws: a slow or
 * failing mint must not block the (re)subscribe that follows it — the join
 * simply carries the last token realtime-js holds.
 */
async function setAuthBounded(
  supabaseClient: SupabaseClient,
  context: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      supabaseClient.realtime.setAuth(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SET_AUTH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.error(`[Realtime] setAuth failed (${context}):`, error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function channelBreadcrumb(
  message: string,
  level: 'info' | 'warning',
  data: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({ category: 'realtime.channel', level, message, data });
  } catch {
    /* telemetry must never break the channel */
  }
}

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
  // True while we are deliberately NOT joining because Clerk reported no
  // session. Keeps subscribe()'s finally-block from re-entering immediately.
  const authWaitRef = useRef(false);
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

  // Wall-clock start of the current disconnected stretch, or null while
  // SUBSCRIBED. Drives rt.disconnected_ms.
  const disconnectedSinceRef = useRef<number | null>(null);

  // Update status and notify parent
  const updateStatus = useCallback((updates: Partial<ChannelStatus>) => {
    // Channel-lifecycle telemetry. Recorded here rather than in an effect
    // because this is the single funnel every state change passes through, and
    // statusRef still holds the PREVIOUS state at this point. Counting
    // edges (not polling state) is what makes rt.disconnected_ms meaningful:
    // the floor fallback poll's cost is a direct function of it.
    if (updates.state) {
      const prevState = statusRef.current;
      const nextState = updates.state;
      if (prevState === 'SUBSCRIBED' && nextState !== 'SUBSCRIBED') {
        disconnectedSinceRef.current = Date.now();
        recordCount(KEY_RT_CHANNEL_DISCONNECT);
      } else if (prevState !== 'SUBSCRIBED' && nextState === 'SUBSCRIBED') {
        recordCount(KEY_RT_CHANNEL_SUBSCRIBED);
        if (disconnectedSinceRef.current !== null) {
          recordSample(
            KEY_RT_DISCONNECTED_MS,
            Date.now() - disconnectedSinceRef.current,
          );
          disconnectedSinceRef.current = null;
        }
      }
      // Production-visible trail of every transition (console.log is stripped
      // from preview/production builds, so breadcrumbs are the only positive
      // signal that a channel came back).
      if (prevState !== nextState) {
        channelBreadcrumb(
          `${topic} ${prevState}→${nextState}`,
          nextState === 'SUBSCRIBED' ? 'info' : 'warning',
          {
            topic,
            attempts: reconnectAttemptsRef.current,
            error: updates.lastError?.message ?? null,
            disconnectedMs:
              disconnectedSinceRef.current !== null
                ? Date.now() - disconnectedSinceRef.current
                : null,
          },
        );
      }
    }

    setStatus(prev => {
      const newStatus = { ...prev, ...updates };
      if (updates.state) {
        statusRef.current = updates.state;
      }
      onStatusChangeRef.current?.(newStatus);
      return newStatus;
    });
  }, [topic]);

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

      // Set auth token for Realtime Authorization (bounded — see setAuthBounded)
      await setAuthBounded(supabaseClient, 'subscribe');
      if (
        attempt !== subscriptionAttemptRef.current ||
        !shouldBeConnectedRef.current
      ) {
        return;
      }

      // Auth-aware exit: Clerk answered "no session" (signed out / revoked).
      // The layout redirects to /login and unmounts us within the ClerkGate
      // grace window; until then, do not hammer the socket with credential-
      // less joins — idle and re-check every MAX_BACKOFF_MS instead. A token
      // that exists but is REJECTED is deliberately not treated as an exit:
      // that is the transient-mint case, and each retry mints a fresh one.
      if (getSupabaseSessionState() === 'none') {
        authWaitRef.current = true;
        updateStatus({
          state: 'CHANNEL_ERROR',
          lastError: new Error('No auth session — waiting for sign-in'),
        });
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          authWaitRef.current = false;
          if (shouldBeConnectedRef.current) subscribeRef.current();
        }, MAX_BACKOFF_MS);
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
      if (
        shouldBeConnectedRef.current &&
        !channelRef.current &&
        !authWaitRef.current
      ) {
        subscribeRef.current();
      }
    });

    subscribePromiseRef.current = promise;
    return promise;
  }, [supabaseClient, topic, updateStatus]);

  // Keep subscribeRef in sync for AppState effect
  subscribeRef.current = subscribe;

  // Reconnection logic: exponential backoff with ±50% jitter, capped at 60s,
  // and it NEVER gives up. The old cap (15/20 attempts ≈ 11–19 min) left the
  // channel permanently dark until a NetInfo transition, a foreground or a
  // remount — a KDS that lost its socket during a long Wi-Fi blip without a
  // NetInfo edge stayed blind. `maxReconnectAttempts` now only marks when the
  // "still retrying" warning is emitted. Jitter from attempt 1 keeps a fleet
  // from re-joining in lock-step after a Supabase-side blip.
  const handleReconnect = useCallback(() => {
    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const attempt = reconnectAttemptsRef.current;
    const base = Math.min(
      reconnectDelay * Math.pow(2, Math.min(attempt, 10)),
      MAX_BACKOFF_MS,
    );
    const delay = Math.round(base * (0.5 + Math.random()));
    reconnectAttemptsRef.current += 1;

    if (reconnectAttemptsRef.current === maxReconnectAttempts) {
      console.warn(
        `[Realtime] ${topic}: ${maxReconnectAttempts} reconnect attempts, still retrying (≤${MAX_BACKOFF_MS / 1000}s apart)`,
      );
      channelBreadcrumb('reconnect_budget_exhausted_still_retrying', 'warning', {
        topic,
        attempts: reconnectAttemptsRef.current,
      });
    }

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
      // Refresh auth token before re-subscribing (bounded, never throws)
      await setAuthBounded(supabaseClient, 'reconnect');
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
    authWaitRef.current = false;
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

    const refreshInterval = setInterval(() => {
      void setAuthBounded(supabaseClient, 'interval');
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [enabled, status.state, supabaseClient]);

  // Network state awareness: reconnect when network restores
  useEffect(() => {
    if (!enabled) return;

    // Uses the app's single network source (offlineSyncService owns
    // NetInfo.configure) instead of a per-channel raw NetInfo subscription —
    // with 3 channels live on a POS station that was 3 duplicate subscribers
    // reacting to the same event.
    const unsubscribe = subscribeOnlineStatus(() => {
      if (getRawIsOnline() && statusRef.current !== 'SUBSCRIBED') {
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

    // Realtime state is an `immediate`-bucket concern per the coordinator's
    // priority staging: a dead channel means missed orders, and the frame /
    // interaction buckets behind it assume a live socket. Task id is
    // topic-scoped because a POS station runs three of these concurrently.
    const unregister = registerResumeTask({
      id: `realtime.reconnect:${topic}`,
      bucket: 'immediate',
      run: async () => {
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
          // Channel appears healthy - proactively refresh auth token. Awaited
          // so the immediate bucket doesn't report settled while the socket is
          // still re-authenticating.
          if (__DEV__) console.log(`[Realtime] App foregrounded, ${topic} still SUBSCRIBED, refreshing auth`);
          await setAuthBounded(supabaseClient, 'foreground');
        }
      },
    });

    return () => {
      isMounted = false;
      unregister();
    };
  }, [enabled, supabaseClient, topic]);

  return { status, reconnect, disconnect };
}
