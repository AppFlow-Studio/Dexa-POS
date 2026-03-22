// hooks/useCFDWSClient.ts
// WebSocket client hook for CFD client mode
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import type { CFDMessage, CFDPayload, CFDTipResponse } from "@/types/cfd.types";
import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

const PING_INTERVAL = 5000;
const PONG_TIMEOUT = 15000; // Force-close if 3 pings missed

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
    if (!isPaired || !connection) return;
    if (!isMounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (isConnecting.current) return;

    isConnecting.current = true;

    // Close any stale/dead connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus("connecting");

    const ws = new WebSocket(`ws://${connection.ip}:${connection.port}`);

    ws.onopen = () => {
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
    };

    ws.onclose = () => {
      isConnecting.current = false;
      if (!isMounted.current) return;
      console.log("[CFD Client] Disconnected");
      setConnectionStatus("disconnected");
      cleanup();

      // Auto-reconnect with exponential backoff (500ms → 5s)
      const nextDelay = Math.min(500 * Math.pow(2, retryCount.current), 5000);
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

  // Reconnect on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isPaired && isMounted.current) {
        connect();
      }
    });
    return () => sub.remove();
  }, [isPaired, connect]);

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

  return { sendTipSelection, reconnect: connect, disconnect };
}
