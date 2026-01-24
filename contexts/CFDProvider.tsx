import { CFDController } from "@/services/cfd/CFDController";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type {
  CFDCartItem,
  CFDPairingData,
  CFDPayload,
  CFDScreenState,
  CFDTipResponse,
} from "@/types/cfd.types";
import { usePathname } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEBUG = true; // Set to true for terminal logs

export type CFDServerStatus =
  | "initializing" // Setting up, not ready yet
  | "ready" // Server running, waiting for connections
  | "connected" // At least one CFD connected
  | "error" // Failed to start
  | "disabled"; // No station/location selected

interface CFDContextType {
  serverStatus: CFDServerStatus;
  isServerReady: boolean;
  isConnected: boolean;
  clientCount: number;
  serverError: string | null;
  pairingData: CFDPairingData | null;
  serverInfo: { ip: string; port: number } | null;
  tipResponse: CFDTipResponse | null;

  showTipSelection: (baseAmount?: number, presetPercentages?: number[]) => void;
  updateTip: (amount: number, percentage: number | null) => void;
  setBaseAmount: (amount: number | null) => void;
  setScreenState: (state: CFDScreenState | null) => void;
  clearTipResponse: () => void;
  showPayment: () => void;
  showProcessing: () => void;
  showApproved: () => void;
  showDeclined: () => void;
  showIdle: () => void;
}

const CFDContext = createContext<CFDContextType | null>(null);

export function CFDProvider({ children }: { children: React.ReactNode }) {
  const controllerRef = useRef<CFDController | null>(null);
  const pathname = usePathname();

  // Status states
  const [serverStatus, setServerStatus] = useState<CFDServerStatus>("disabled");
  const [isConnected, setIsConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [pairingData, setPairingData] = useState<CFDPairingData | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tipResponse, setTipResponse] = useState<CFDTipResponse | null>(null);
  const [currentTip, setCurrentTip] = useState<{
    amount: number;
    percentage: number | null;
  }>({ amount: 0, percentage: null });
  const [activeScreenState, setActiveScreenState] =
    useState<CFDScreenState | null>(null);
  const [baseAmountOverride, setBaseAmountOverride] = useState<number | null>(
    null,
  );
  const tipConfigRef = useRef<CFDPayload["tipConfig"] | null>(null);

  // Store settings
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Order store selectors
  // Order store selectors - Individual selectors for stability
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null,
  );
  const activeOrderSubtotal = useOrderStore((s) => s.activeOrderSubtotal);
  const activeOrderTax = useOrderStore((s) => s.activeOrderTax);
  const activeOrderTotal = useOrderStore((s) => s.activeOrderTotal);
  const activeOrderDiscount = useOrderStore((s) => s.activeOrderDiscount);
  const activeOrderOutstandingTotal = useOrderStore(
    (s) => s.activeOrderOutstandingTotal,
  );

  // Transform cart items to CFD format
  const cfdItems: CFDCartItem[] = useMemo(() => {
    if (!activeOrder?.items) return [];

    return activeOrder.items
      .filter((item) => !item.is_voided && item.quantity > 0)
      .map((item) => ({
        id: item.id,
        name: item.is_open_item
          ? (item.open_item_name ?? "Open Item")
          : item.name,
        quantity: item.quantity,
        // Use fallbacks for price fields to prevent $0.00
        unitPrice: Math.round((item.unitPrice || item.price || 0) * 100),
        // Calculate line total manually if subtotal is missing/zero using strict math
        lineTotal: Math.round(
          (item.subtotal ||
            (item.unitPrice || item.price || 0) * item.quantity) * 100,
        ),
        modifiers: [
          ...(item.customizations?.size
            ? [
                {
                  name: item.customizations.size.name,
                  price: Math.round(
                    (item.customizations.size.priceModifier || 0) * 100,
                  ),
                },
              ]
            : []),
          ...(item.customizations?.addOns?.map((a) => ({
            name: a.name,
            price: Math.round((a.price || 0) * 100),
          })) ?? []),
          ...(item.customizations?.modifiers?.flatMap((m) =>
            m.options.map((o) => ({
              name: o.name,
              price: Math.round((o.price || 0) * 100),
            })),
          ) ?? []),
        ],
        notes: item.customizations?.notes,
      }));
  }, [activeOrder?.items]);

  // Initialize CFD controller
  useEffect(() => {
    // Check prerequisites
    if (
      !selectedStation?.id ||
      !selectedStore?.id ||
      !selectedStore?.name ||
      !selectedStation?.station_name
    ) {
      setServerStatus("disabled");
      setPairingData(null);
      return;
    }

    setServerStatus("initializing");
    setServerError(null);

    const controller = new CFDController({
      stationId: selectedStation.id,
      stationName: selectedStation.station_name,
      locationId: selectedStore.id,
      branding: {
        restaurantName: selectedStore.name,
        locationCode: selectedStore.code,
        logoUrl: null,
        primaryColor: "#10b981",
      },
      port: 8080,
    });

    controllerRef.current = controller;

    controller
      .start({
        onCFDConnected: (clientId) => {
          console.log("[useCFD] CFD connected:", clientId);
          setIsConnected(true);
          setClientCount(controller.clientCount);
          setServerStatus("connected");
        },
        onCFDDisconnected: (clientId) => {
          console.log("[useCFD] CFD disconnected:", clientId);
          const count = controller.clientCount;
          setClientCount(count);
          setIsConnected(count > 0);
          setServerStatus(count > 0 ? "connected" : "ready");
        },
        onTipSelected: (response: CFDTipResponse) => {
          console.log("[useCFD] Tip selected:", response);
          setTipResponse(response);
        },
      })
      .then((info) => {
        console.log("[useCFD] Server started:", info);
        setPairingData(controller.getPairingData());
        setServerStatus("ready");
      })
      .catch((error) => {
        console.error("[useCFD] Server failed to start:", error);
        setServerStatus("error");
        setServerError(error.message);
      });

    return () => {
      console.log("[useCFD] Stopping Server...");
      controller.stop();
      controllerRef.current = null;
      setServerStatus("disabled");
      setPairingData(null);
      setIsConnected(false);
      setClientCount(0);
    };
  }, [
    selectedStation?.id,
    selectedStore?.id,
    selectedStore?.name,
    selectedStation?.station_name,
  ]);

  // Auto-sync order to CFD
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !isConnected) return;

    // A "Sales Screen" indicates the cashier is actively taking or editing an order.
    // If we're on a dashboard or settings, the customer shouldn't see order details.
    const isSalesScreen = pathname.includes("order-processing");

    // We show order data IF:
    // 1. We are in an active transaction state (Tip Selection, Payment, etc.)
    // 2. We are on the Sales screen and have an active order.
    const shouldShowOrderData =
      !!activeScreenState || (isSalesScreen && !!activeOrder);

    const currentBase = baseAmountOverride ?? activeOrderSubtotal;

    if (DEBUG) {
      console.log(
        `[CFD Sync] State: ${activeScreenState || "auto"}, Path: ${pathname}, Visible: ${shouldShowOrderData}`,
      );
    }

    if (!shouldShowOrderData) {
      controller.showIdle();
      return;
    }

    // items should always be synced if we're showing order data
    controller.updateOrder({
      screenState: activeScreenState || undefined,
      orderNumber:
        activeOrder?.display_number ?? activeOrder?.order_number ?? null,
      orderType: activeOrder?.order_type ?? null,
      guestCount: activeOrder?.guest_count ?? null,
      items: cfdItems,
      subtotal: Math.round(currentBase * 100),
      discountAmount: Math.round(activeOrderDiscount * 100),
      taxAmount: Math.round(activeOrderTax * 100),
      tipAmount: Math.round(currentTip.amount * 100),
      tipPercentage: currentTip.percentage,
      total: Math.round((activeOrderTotal + currentTip.amount) * 100),
      outstandingTotal: Math.round(
        (activeOrderOutstandingTotal + currentTip.amount) * 100,
      ),
      amountPaid: Math.round((activeOrder?.amount_paid ?? 0) * 100),
      tipConfig: tipConfigRef.current ?? undefined,
    });
  }, [
    isConnected,
    activeOrder,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    currentTip,
    activeScreenState,
    baseAmountOverride,
    pathname, // Essential for responding to screen changes
  ]);

  // ==================== EXPOSED METHODS ====================

  const showTipSelection = useCallback(
    (baseAmount?: number, presetPercentages?: number[]) => {
      const currentBase = baseAmount ?? activeOrderSubtotal;
      setBaseAmountOverride(baseAmount ?? null);
      setActiveScreenState("tip_selection");

      const config = {
        subtotalForTip: Math.round(currentBase * 100), // CONVERT TO CENTS
        presetPercentages: presetPercentages || [15, 18, 20, 25],
        allowCustom: true,
      };
      tipConfigRef.current = config;
      controllerRef.current?.showTipSelection(
        config.subtotalForTip,
        config.presetPercentages,
      );
    },
    [activeOrderSubtotal],
  );

  const updateTip = useCallback((amount: number, percentage: number | null) => {
    setCurrentTip({ amount, percentage });
  }, []);

  const setBaseAmount = useCallback((amount: number | null) => {
    setBaseAmountOverride(amount);
  }, []);

  const setScreenState = useCallback((state: CFDScreenState | null) => {
    setActiveScreenState(state);
  }, []);

  const clearTipResponse = useCallback(() => {
    setTipResponse(null);
  }, []);

  const showPayment = useCallback(() => {
    setActiveScreenState("payment");
    controllerRef.current?.showPayment();
  }, []);

  const showProcessing = useCallback(() => {
    setActiveScreenState("processing");
    controllerRef.current?.showProcessing();
  }, []);

  const showApproved = useCallback(() => {
    setActiveScreenState("approved");
    controllerRef.current?.showApproved();
  }, []);

  const showDeclined = useCallback(() => {
    setActiveScreenState("declined");
    controllerRef.current?.showDeclined();
  }, []);

  const showIdle = useCallback(() => {
    setActiveScreenState(null);
    setBaseAmountOverride(null);
    setCurrentTip({ amount: 0, percentage: null });
    controllerRef.current?.showIdle();
  }, []);

  const value = {
    serverStatus,
    isServerReady: serverStatus === "ready" || serverStatus === "connected",
    isConnected,
    clientCount,
    serverError,
    pairingData,
    serverInfo: controllerRef.current?.getServerInfo() ?? null,
    tipResponse,
    clearTipResponse,
    showTipSelection,
    updateTip,
    setBaseAmount,
    setScreenState,
    showPayment,
    showProcessing,
    showApproved,
    showDeclined,
    showIdle,
  };

  return <CFDContext.Provider value={value}>{children}</CFDContext.Provider>;
}

export function useCFD() {
  const context = useContext(CFDContext);
  if (!context) {
    throw new Error("useCFD must be used within a CFDProvider");
  }
  return context;
}
