// hooks/useCFDWSClient.ts
// WebSocket client hook for CFD client mode
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import type { CFDMessage, CFDPayload, CFDPhoneResponse, CFDTipResponse } from "@/types/cfd.types";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

const PING_INTERVAL  = 3_000;  // 3s — client detects server death in ~9-12s (was 15-20s)
const PONG_TIMEOUT   = 9_000;  // 9s — force-close if 3 pings missed
const CONNECT_TIMEOUT = 10_000;

export function useCFDWSClient() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pingTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pingTime = useRef<number>(0);
  const lastPongTime = useRef<number>(Date.now());
  const retryCount = useRef<number>(0);
  const isMounted = useRef(true);
  const isConnecting = useRef(false);
  const isInitialNetInfo = useRef(true);

  const {
    isPaired,
    connection,
    setConnectionStatus,
    setLatency,
    updateFromPayload,
  } = useCFDClientStore();

  const cleanup = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    clearInterval(pingTimer.current);
    reconnectTimer.current = undefined;
    pingTimer.current = undefined;
  }, []);

  const connect = useCallback(() => {
    // Cancel any pending reconnect timer first
    clearTimeout(reconnectTimer.current);
    reconnectTimer.current = undefined;

    if (!isPaired || !connection) return;
    if (!isMounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (isConnecting.current) return;

    // Validate pairing data before attempting connection
    const isValidIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(connection.ip ?? "");
    const isValidPort = typeof connection.port === "number" && connection.port > 0 && connection.port < 65536;
    if (!isValidIp || !isValidPort) {
      console.error("[CFD Client] Invalid pairing data, clearing");
      useCFDClientStore.getState().clearPairing();
      return;
    }

    isConnecting.current = true;

    // Close any stale/dead connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");

    const ws = new WebSocket(`ws://${connection.ip}:${connection.port}`);

    // Timeout stuck CONNECTING sockets
    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        if (__DEV__) console.error("[CFD Client] Connection timeout, force-closing");
        ws.close();
      }
    }, CONNECT_TIMEOUT);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      isConnecting.current = false;
      if (!isMounted.current) { ws.close(); return; }
      console.log("[CFD Client] Connected");
      setConnectionStatus("connected");
      retryCount.current = 0;
      lastPongTime.current = Date.now();

      // Start ping interval
      clearInterval(pingTimer.current);
      pingTimer.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;

        // Check pong timeout
        if (Date.now() - lastPongTime.current > PONG_TIMEOUT) {
          console.error("[CFD Client] Pong timeout, force-closing");
          ws.close();
          return;
        }

        pingTime.current = Date.now();
        const msg: CFDMessage = { type: "ping", timestamp: Date.now() };
        ws.send(JSON.stringify(msg));
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      try {
        const message: CFDMessage = JSON.parse(event.data);

        if (message.type === "state_update" && message.payload) {
          updateFromPayload(message.payload as CFDPayload);
        } else if (message.type === "pong") {
          lastPongTime.current = Date.now();
          setLatency(Date.now() - pingTime.current);
        }
      } catch (e) {
        console.error("[CFD Client] Parse error:", e);
      }
    };

    ws.onerror = (error) => {
      const msg = (error as any).message || "Unknown error";
      if (__DEV__) console.error(`[CFD Client] WebSocket Error: ${msg}`);
      try { ws.close(); } catch (_) {}
    };

    ws.onclose = () => {
      clearTimeout(connectTimeout);
      isConnecting.current = false;
      if (!isMounted.current) return;
      console.log("[CFD Client] Disconnected");
      setConnectionStatus("disconnected");
      cleanup();

      // Auto-reconnect with exponential backoff (100ms → 500ms → 1s → 2s → 4s → 5s cap)
      const nextDelay = retryCount.current === 0
        ? 100
        : Math.min(500 * Math.pow(2, retryCount.current - 1), 5000);
      if (__DEV__) {
        console.log(
          `[CFD Client] Reconnecting in ${nextDelay}ms... (Attempt ${retryCount.current + 1})`,
        );
      }
      retryCount.current += 1;
      reconnectTimer.current = setTimeout(connect, nextDelay);
    };

    wsRef.current = ws;
  }, [isPaired, connection, setConnectionStatus, setLatency, updateFromPayload, cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    isConnecting.current = false;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus("disconnected");
  }, [setConnectionStatus, cleanup]);

  const sendTipSelection = useCallback(
    (tipAmount: number, tipPercentage: number | null) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN || !connection) return;

      const response: CFDTipResponse = {
        stationId: connection.stationId,
        tipAmount,
        tipPercentage,
        timestamp: Date.now(),
      };

      const msg: CFDMessage = {
        type: "tip_selected",
        payload: response,
        timestamp: Date.now(),
      };

      wsRef.current.send(JSON.stringify(msg));
    },
    [connection],
  );

  const sendPhoneNumber = useCallback(
    (phone: string) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN || !connection) return;
      const payload: CFDPhoneResponse = { phone, timestamp: Date.now() };
      const msg: CFDMessage = {
        type: "phone_submitted",
        payload,
        timestamp: Date.now(),
      };
      wsRef.current.send(JSON.stringify(msg));
    },
    [connection],
  );

  const sendLoyaltySkip = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const msg: CFDMessage = { type: "loyalty_skip", timestamp: Date.now() };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Connect when paired
  useEffect(() => {
    isMounted.current = true;
    if (isPaired) {
      connect();
    }
    return () => {
      isMounted.current = false;
      disconnect();
    };
  }, [isPaired, connect, disconnect]);

  // Reconnect on app foreground; proactively close on background (RN 0.76+/Hermes bug: ws.onclose
  // may not fire when app goes to background — issue #49243 — so we close eagerly to prevent
  // zombie connections that leak pingTimer and block the isConnecting guard on the next reconnect)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isPaired && isMounted.current) {
        connect();
      } else if (state === "background" || state === "inactive") {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
          wsRef.current.onclose = null;  // prevent double-handling if onclose does fire later
          wsRef.current.onerror = null;
          wsRef.current.close();
          wsRef.current = null;
        }
        isConnecting.current = false;
        cleanup();  // clear ping/reconnect timers immediately
      }
    });
    return () => sub.remove();
  }, [isPaired, connect, cleanup]);

  // Reconnect on network restored
  // NetInfo fires immediately on subscribe — skip that initial emission
  // since the isPaired effect above already calls connect().
  useEffect(() => {
    isInitialNetInfo.current = true;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (isInitialNetInfo.current) {
        isInitialNetInfo.current = false;
        return;
      }
      if (state.isConnected && isPaired && isMounted.current) {
        retryCount.current = 0;
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          clearTimeout(reconnectTimer.current);
          connect();
        }
      }
    });
    return unsubscribe;
  }, [isPaired, connect]);

  return { sendTipSelection, sendPhoneNumber, sendLoyaltySkip, reconnect: connect, disconnect };
}
