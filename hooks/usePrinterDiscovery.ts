import { useCallback, useEffect, useRef, useState } from "react";

import { isValidIpv4 } from "@/components/settings/ManualIpPanel";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import {
  addBuiltinPrinter,
  addStarPrinter,
  testPrinterConnection,
} from "@/services/hardware/printerProvisioning";
import type { DeviceCapabilities } from "@/services/hardware/deviceDetection";
import {
  discoverStarPrinters,
  probeStarPrinterByIp,
  stopDiscovery,
  type DiscoveredStarPrinter,
} from "@/services/printing/discovery/StarPrinterDiscovery";
import { PrinterService } from "@/services/printing/PrinterService";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { PrinterConfig } from "@/types/printer";

const SCAN_DURATION_S = 10;

export interface PrinterDiscoveryScanState {
  isScanning: boolean;
  scanSecondsRemaining: number | null;
  scanError: string | null;
  provisioningStarIp: string | null;
  provisioningBuiltin: boolean;
  isProbing: boolean;
  manualIpError: string | null;
  retryingPrinterId: string | null;
  testPrintingId: string | null;
}

export interface UsePrinterDiscovery {
  scanState: PrinterDiscoveryScanState;
  storedPrinters: PrinterConfig[];
  discoveredPrinters: DiscoveredStarPrinter[];
  scan: () => Promise<void>;
  provisionStar: (
    discovered: DiscoveredStarPrinter,
    role?: "receipt" | "kitchen" | "both",
  ) => Promise<void>;
  provisionBuiltin: (capabilities: DeviceCapabilities) => Promise<void>;
  addByManualIp: (
    ip: string,
    role: "receipt" | "kitchen" | "both",
  ) => Promise<void>;
  clearManualIpError: () => void;
  testPrint: (printer: PrinterConfig) => Promise<void>;
  retryConnection: (printer: PrinterConfig) => Promise<{ online: boolean; inUse?: boolean; error?: string } | null>;
}

// Centralized provisioning / scanning / test-print hook. Replaces the inlined
// glue that was previously living in devices-connections.tsx so the new unified
// /settings/printers screen and the (now slimmer) devices-connections screen
// share one source of truth for these operations.
export function usePrinterDiscovery(): UsePrinterDiscovery {
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  const storedPrinters = usePrinterStore((s) => s.printers);
  const discoveredPrinters = usePrinterStore((s) => s.discoveredPrinters);
  const isScanning = usePrinterStore((s) => s.isScanning);
  const setIsScanning = usePrinterStore((s) => s.setIsScanning);
  const setDiscoveredPrinters = usePrinterStore(
    (s) => s.setDiscoveredPrinters,
  );
  const addDiscoveredPrinter = usePrinterStore((s) => s.addDiscoveredPrinter);
  const fetchPrinters = usePrinterStore((s) => s.fetchPrinters);
  const updatePrinterConfig = usePrinterStore((s) => s.updatePrinterConfig);

  const [scanSecondsRemaining, setScanSecondsRemaining] = useState<number | null>(
    null,
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [provisioningStarIp, setProvisioningStarIp] = useState<string | null>(
    null,
  );
  const [provisioningBuiltin, setProvisioningBuiltin] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [manualIpError, setManualIpError] = useState<string | null>(null);
  const [retryingPrinterId, setRetryingPrinterId] = useState<string | null>(
    null,
  );
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cancel any in-flight LAN scan when the hook unmounts so a backgrounded
  // screen doesn't continue holding multicast resources.
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      stopDiscovery();
    };
  }, []);

  const scan = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    setDiscoveredPrinters([]);
    setScanSecondsRemaining(SCAN_DURATION_S);

    countdownRef.current = setInterval(() => {
      setScanSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      await discoverStarPrinters(SCAN_DURATION_S * 1000, {
        onPrinterFound: (printer) => addDiscoveredPrinter(printer),
      });
    } catch (e: any) {
      setScanError(e?.message || "Discovery failed");
    } finally {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setScanSecondsRemaining(null);
      setIsScanning(false);
    }
  }, [addDiscoveredPrinter, setDiscoveredPrinters, setIsScanning]);

  const provisionStar = useCallback(
    async (
      discovered: DiscoveredStarPrinter,
      role: "receipt" | "kitchen" | "both" = discovered.capabilities.suggestedRole,
    ) => {
      if (!selectedStation || !selectedStore) return;
      setProvisioningStarIp(discovered.ipAddress);
      try {
        const isBoth = role === "both";
        const provisionRole: "receipt" | "kitchen" = isBoth ? "receipt" : role;
        const printerId = await addStarPrinter(
          supabase,
          selectedStation.id,
          selectedStore.id,
          selectedStore.merchant_id,
          discovered,
          provisionRole,
        );
        if (printerId) {
          if (isBoth) {
            await updatePrinterConfig(printerId, { isDefaultKitchen: true });
          }
          await fetchPrinters(selectedStore.id);
          toastService.show({
            title: "Printer Added",
            message: `${discovered.modelName} added as ${
              isBoth ? "receipt + kitchen" : provisionRole
            }.`,
            type: "success",
          });
        } else {
          toastService.show({
            title: "Failed",
            message: "Could not add printer.",
            type: "error",
          });
        }
      } catch (e: any) {
        toastService.show({
          title: "Error",
          message: e?.message || "Provisioning failed",
          type: "error",
        });
      } finally {
        setProvisioningStarIp(null);
      }
    },
    [
      fetchPrinters,
      selectedStation,
      selectedStore,
      supabase,
      updatePrinterConfig,
    ],
  );

  const provisionBuiltin = useCallback(
    async (capabilities: DeviceCapabilities) => {
      if (!selectedStation || !selectedStore) return;
      setProvisioningBuiltin(true);
      try {
        const printerId = await addBuiltinPrinter(
          supabase,
          selectedStation.id,
          selectedStore.id,
          selectedStore.merchant_id,
          capabilities,
        );
        if (printerId) {
          await fetchPrinters(selectedStore.id);
          toastService.show({
            title: "Built-in Printer Added",
            message: "Ready to print.",
            type: "success",
          });
        }
      } catch (e: any) {
        toastService.show({
          title: "Error",
          message: e?.message || "Provisioning failed",
          type: "error",
        });
      } finally {
        setProvisioningBuiltin(false);
      }
    },
    [fetchPrinters, selectedStation, selectedStore, supabase],
  );

  const addByManualIp = useCallback(
    async (rawIp: string, role: "receipt" | "kitchen" | "both") => {
      const ip = rawIp.trim();
      if (!ip || !selectedStation || !selectedStore) return;
      if (!isValidIpv4(ip)) {
        setManualIpError("Invalid IP format.");
        return;
      }
      if (
        storedPrinters.some(
          (p) =>
            p.printerType === "star_micronics" && p.networkAddress === ip,
        )
      ) {
        setManualIpError(
          "Printer already available at this location. Use the receipt picker to assign it.",
        );
        return;
      }

      setIsProbing(true);
      setManualIpError(null);
      try {
        const discovered = await probeStarPrinterByIp(ip);
        const isBoth = role === "both";
        const provisionRole: "receipt" | "kitchen" = isBoth ? "receipt" : role;
        const printerId = await addStarPrinter(
          supabase,
          selectedStation.id,
          selectedStore.id,
          selectedStore.merchant_id,
          discovered,
          provisionRole,
        );
        if (printerId) {
          if (isBoth) {
            await updatePrinterConfig(printerId, { isDefaultKitchen: true });
          }
          await fetchPrinters(selectedStore.id);
          toastService.show({
            title: "Printer Added",
            message: `${discovered.modelName} at ${ip} added${
              isBoth ? " as receipt + kitchen" : ""
            }.`,
            type: "success",
          });
        } else {
          setManualIpError("Failed to add printer.");
        }
      } catch (e: any) {
        // probeStarPrinterByIp tags reachable-but-in-use errors with code IN_USE.
        // Surface a distinct message so the user knows the printer is alive,
        // just held by a peer.
        if (e?.code === "IN_USE") {
          setManualIpError(e?.message ?? "Printer is in use by another device.");
        } else {
          setManualIpError(e?.message || "Failed to connect");
        }
      } finally {
        setIsProbing(false);
      }
    },
    [
      fetchPrinters,
      selectedStation,
      selectedStore,
      storedPrinters,
      supabase,
      updatePrinterConfig,
    ],
  );

  const clearManualIpError = useCallback(() => setManualIpError(null), []);

  const testPrint = useCallback(async (printer: PrinterConfig) => {
    setTestPrintingId(printer.id);
    try {
      await PrinterService.printTestPage(printer);
    } catch (e) {
      console.warn("[usePrinterDiscovery] Test print failed:", e);
    } finally {
      setTestPrintingId(null);
    }
  }, []);

  const retryConnection = useCallback(
    async (printer: PrinterConfig) => {
      setRetryingPrinterId(printer.id);
      try {
        const result = await testPrinterConnection(supabase, printer);
        if (selectedStore?.id) await fetchPrinters(selectedStore.id);
        return result;
      } catch (e: any) {
        toastService.show({
          title: "Connection Failed",
          message: e?.message || "Unable to connect.",
          type: "error",
        });
        return null;
      } finally {
        setRetryingPrinterId(null);
      }
    },
    [fetchPrinters, selectedStore?.id, supabase],
  );

  return {
    scanState: {
      isScanning,
      scanSecondsRemaining,
      scanError,
      provisioningStarIp,
      provisioningBuiltin,
      isProbing,
      manualIpError,
      retryingPrinterId,
      testPrintingId,
    },
    storedPrinters,
    discoveredPrinters,
    scan,
    provisionStar,
    provisionBuiltin,
    addByManualIp,
    clearManualIpError,
    testPrint,
    retryConnection,
  };
}
