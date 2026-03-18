import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  updateSecondaryDisplay,
  dismissSecondaryDisplay,
} from "@/native/SecondaryDisplay";
import type { SecondaryDisplayData } from "@/native/SecondaryDisplay";
import { detectNativeHardware } from "@/native/HardwareDetection";
import { getCachedCapabilities } from "@/services/hardware/deviceDetection";
import { CFDController } from "@/services/cfd/CFDController";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type {
    CFDCartItem,
    CFDPairingData,
    CFDPayload,
    CFDScreenState,
    CFDTipResponse,
} from "@/types/cfd.types";
import type { CartItem } from "@/lib/types";
import { usePathname } from "expo-router";
import { debounce } from "lodash";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

const DEBUG = __DEV__;

function Log(msg: string) {
  if (DEBUG) console.log(msg);
}

function formatModifiersForBuiltinCfd(item: CartItem): string[] {
  const mods: string[] = [];
  if (item.customizations?.size) {
    const price = item.customizations.size.priceModifier || 0;
    mods.push(
      `${item.customizations.size.name}${price ? ` (+$${price.toFixed(2)})` : ""}`,
    );
  }
  item.customizations?.addOns?.forEach((a) => {
    mods.push(`${a.name}${a.price ? ` (+$${a.price.toFixed(2)})` : ""}`);
  });
  item.customizations?.modifiers?.forEach((m) => {
    m.options.forEach((o) => {
      mods.push(`${o.name}${o.price ? ` (+$${o.price.toFixed(2)})` : ""}`);
    });
  });
  return mods;
}

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
  const lastPayloadHashRef = useRef("");
  const debouncedUpdateRef = useRef(
    debounce((ctrl: CFDController, params: any) => {
      const hash = JSON.stringify(params);
      if (hash === lastPayloadHashRef.current) return;
      lastPayloadHashRef.current = hash;
      ctrl.updateOrder(params);
    }, 150)
  );

  // Store settings
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const organizationLogoUrl = useStoreSettingsStore(
    (s) => s.organizationLogoUrl
  );
  const tipPresetPercentages = useStoreSettingsStore(
    (s) => s.tipPresetPercentages
  );

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
        logoUrl: organizationLogoUrl,
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
    organizationLogoUrl,
  ]);

  // Fetch and Sync Carousel Images
  const supabase = useSupabaseClient();
  useEffect(() => {
    const fetchImages = async () => {
      if (!selectedStore?.id || !controllerRef.current) return;

      try {
        const { data, error } = await supabase.rpc("get_active_cfd_images", {
          target_location_id: selectedStore.id,
        });

        if (error) {
          console.error("[CFD] Failed to fetch images:", error);
          return;
        }

        if (data && Array.isArray(data)) {
          const imageUrls = data.map((d: any) => d.image_url);
          console.log("[CFD] Updating carousel images:", imageUrls.length);
          controllerRef.current.updateCarouselImages(imageUrls);
        }
      } catch (err) {
        console.error("[CFD] Error fetching images:", err);
      }
    };

    if (isConnected) {
      fetchImages();
      const interval = setInterval(fetchImages, 5 * 60 * 1000); // Refresh every 5 minutes
      return () => clearInterval(interval);
    }
  }, [isConnected, selectedStore?.id]);

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
    const params = {
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
    };

    // Payment state transitions need immediate delivery; ordering state can be debounced
    const isPaymentState = activeScreenState === "payment" ||
      activeScreenState === "processing" ||
      activeScreenState === "approved" ||
      activeScreenState === "declined" ||
      activeScreenState === "tip_selection";

    if (isPaymentState) {
      debouncedUpdateRef.current.cancel();
      const hash = JSON.stringify(params);
      if (hash !== lastPayloadHashRef.current) {
        lastPayloadHashRef.current = hash;
        controller.updateOrder(params);
      }
    } else {
      debouncedUpdateRef.current(controller, params);
    }

    return () => {
      debouncedUpdateRef.current.cancel();
    };
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

  // ==================== BUILT-IN SECONDARY DISPLAY SYNC ====================

  const orderTotals = useActiveOrderTotals();
  const [hasBuiltinCfd, setHasBuiltinCfd] = useState(false);

  // Check for built-in CFD once on mount (async with cache-first, native-fallback)
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Try cache first (fast path for subsequent boots)
      let hasCfd = getCachedCapabilities()?.hasBuiltinCfd ?? false;

      // If cache miss, detect directly via native module
      if (!hasCfd) {
        const hw = await detectNativeHardware();
        hasCfd = hw?.hasSecondaryDisplay ?? false;
      }

      if (mounted) {
        setHasBuiltinCfd(hasCfd);
        if (hasCfd) {
          Log("[Built-in CFD] Detected built-in secondary display");
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Dismiss secondary display on unmount if detected
  useEffect(() => {
    return () => {
      if (hasBuiltinCfd) {
        dismissSecondaryDisplay();
      }
    };
  }, [hasBuiltinCfd]);

  useEffect(() => {
    if (!hasBuiltinCfd) return;

    const restaurantName = selectedStore?.name ?? "";
    const isSalesScreen = pathname.includes("order-processing");
    const shouldShowOrderData =
      !!activeScreenState || (isSalesScreen && !!activeOrder);

    if (!shouldShowOrderData) {
      updateSecondaryDisplay({
        screenState: "idle",
        restaurantName,
        orderNumber: null,
        orderType: null,
        guestCount: null,
        items: [],
        cardSubtotal: 0,
        cashSubtotal: 0,
        discountAmount: 0,
        cardTax: 0,
        cashTax: 0,
        cardTotal: 0,
        cashTotal: 0,
        amountPaid: 0,
      });
      return;
    }

    const screenState = activeScreenState || "ordering";

    // Build items with dual pricing
    const items = (activeOrder?.items ?? [])
      .filter((item) => !item.is_voided && item.quantity > 0)
      .map((item) => ({
        name: item.is_open_item
          ? (item.open_item_name ?? "Open Item")
          : item.name,
        quantity: item.quantity,
        cardPrice: Math.round((item.unitPrice || item.price || 0) * 100),
        cashPrice: Math.round(
          (item.cashPrice || item.unitPrice || item.price || 0) * 100,
        ),
        cardLineTotal: Math.round((item.subtotal || 0) * 100),
        cashLineTotal: Math.round(
          (item.cashSubtotal || item.subtotal || 0) * 100,
        ),
        modifiers: formatModifiersForBuiltinCfd(item),
        notes: item.customizations?.notes ?? null,
      }));

    const payload: SecondaryDisplayData = {
      screenState,
      restaurantName,
      orderNumber:
        activeOrder?.display_number ?? activeOrder?.order_number ?? null,
      orderType: activeOrder?.order_type ?? null,
      guestCount: activeOrder?.guest_count ?? null,
      items,
      cardSubtotal: Math.round((orderTotals?.subtotal ?? 0) * 100),
      cashSubtotal: Math.round((orderTotals?.cashSubtotal ?? 0) * 100),
      discountAmount: Math.round((orderTotals?.discount ?? 0) * 100),
      cardTax: Math.round((orderTotals?.tax ?? 0) * 100),
      cashTax: Math.round((orderTotals?.cashTax ?? 0) * 100),
      cardTotal: Math.round((orderTotals?.total ?? 0) * 100),
      cashTotal: Math.round((orderTotals?.cashTotal ?? 0) * 100),
      amountPaid: Math.round((activeOrder?.amount_paid ?? 0) * 100),
    };

    updateSecondaryDisplay(payload);
  }, [
    hasBuiltinCfd,
    activeOrder,
    orderTotals,
    activeScreenState,
    pathname,
    selectedStore?.name,
  ]);

  // ==================== EXPOSED METHODS ====================

  const showTipSelection = useCallback(
    (baseAmount?: number, presetPercentages?: number[]) => {
      const currentBase = baseAmount ?? activeOrderSubtotal;
      setBaseAmountOverride(baseAmount ?? null);
      setActiveScreenState("tip_selection");

      const config = {
        subtotalForTip: Math.round(currentBase * 100), // CONVERT TO CENTS
        presetPercentages: presetPercentages || tipPresetPercentages,
        allowCustom: true,
      };
      tipConfigRef.current = config;
      controllerRef.current?.showTipSelection(
        config.subtotalForTip,
        config.presetPercentages,
      );
    },
    [activeOrderSubtotal, tipPresetPercentages],
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

  // Auto-return to idle after payment result display
  useEffect(() => {
    if (activeScreenState === "approved") {
      const timer = setTimeout(() => showIdle(), 4000);
      return () => clearTimeout(timer);
    }
    if (activeScreenState === "declined") {
      const timer = setTimeout(() => showIdle(), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeScreenState, showIdle]);

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
