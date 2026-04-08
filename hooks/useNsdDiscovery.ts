// hooks/useNsdDiscovery.ts
// React hook for NSD service discovery (CFD client mode)
import {
  NsdDiscovery,
  nsdDiscoveryEvents,
  type NsdServiceInfo,
} from "@/native/NsdDiscovery";
import { useCallback, useEffect, useRef, useState } from "react";

const DISCOVERY_TIMEOUT = 10000; // 10s auto-stop

export function useNsdDiscovery() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [services, setServices] = useState<NsdServiceInfo[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDiscovery = useCallback(async () => {
    setServices([]);
    setIsDiscovering(true);

    try {
      await NsdDiscovery.startDiscovery();
    } catch (e) {
      if (__DEV__) console.error("[NSD] Start discovery failed:", e);
      setIsDiscovering(false);
      return;
    }

    // Auto-stop after timeout
    timeoutRef.current = setTimeout(async () => {
      try {
        await NsdDiscovery.stopDiscovery();
      } catch {}
      setIsDiscovering(false);
    }, DISCOVERY_TIMEOUT);
  }, []);

  const stopDiscovery = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      await NsdDiscovery.stopDiscovery();
    } catch {}
    setIsDiscovering(false);
  }, []);

  useEffect(() => {
    if (!nsdDiscoveryEvents) return;

    const foundSub = nsdDiscoveryEvents.addListener(
      "onServiceFound",
      (info: NsdServiceInfo) => {
        setServices((prev) => {
          // Deduplicate by stationId
          const exists = prev.some((s) => s.stationId === info.stationId);
          if (exists) {
            return prev.map((s) =>
              s.stationId === info.stationId ? info : s,
            );
          }
          return [...prev, info];
        });
      },
    );

    const lostSub = nsdDiscoveryEvents.addListener(
      "onServiceLost",
      ({ serviceName }: { serviceName: string }) => {
        setServices((prev) =>
          prev.filter((s) => s.serviceName !== serviceName),
        );
      },
    );

    return () => {
      foundSub.remove();
      lostSub.remove();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      NsdDiscovery.stopDiscovery().catch(() => {});
    };
  }, []);

  return { isDiscovering, services, startDiscovery, stopDiscovery };
}
