import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  showSecondaryDisplay,
  dismissSecondaryDisplay,
} from "@/native/SecondaryDisplay";
import { detectNativeHardware } from "@/native/HardwareDetection";
import { getCachedCapabilities } from "@/services/hardware/deviceDetection";
import { CFDController } from "@/services/cfd/CFDController";
import {
  checkMerchantHasLoyalty,
  earnLoyaltyForOrder,
  findOrCreateCustomerByPhone,
  type LoyaltyEarnResult,
} from "@/services/loyalty/loyaltyService";
import { linkCustomerToOrder } from "@/services/customer";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useLoyaltyStore } from "@/stores/useLoyaltyStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCFDBuiltinStore } from "@/stores/useCFDBuiltinStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useSeatingStore } from "@/stores/useSeatingStore";
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
  connectedClientIds: string[];
  serverError: string | null;
  pairingData: CFDPairingData | null;
  serverInfo: { ip: string; port: number } | null;
  tipResponse: CFDTipResponse | null;

  showTipSelection: (baseAmount?: number, presetPercentages?: number[]) => void;
  updateTip: (amount: number, percentage: number | null) => void;
  setBaseAmount: (amount: number | null) => void;
  setScreenState: (state: CFDScreenState | null) => void;
  clearTipResponse: () => void;
  showPayment: (paymentMethod?: "cash" | "card" | "manual") => void;
  showProcessing: (paymentMethod?: "cash" | "card" | "manual", tipAmountOverride?: number) => void;
  showApproved: () => void;
  showDeclined: () => void;
  showIdle: () => void;
  showLoyaltyPrompt: () => void;
  showLoyaltyConfirmation: (result: LoyaltyEarnResult[], customerName?: string) => void;
  disconnectClient: (clientId: string) => void;
  refreshCarouselImages: () => Promise<void>;
  refreshOrderingPanelImages: () => Promise<void>;
}

const CFDContext = createContext<CFDContextType | null>(null);

const noopCFDValue: CFDContextType = {
  serverStatus: "disabled",
  isServerReady: false,
  isConnected: false,
  clientCount: 0,
  connectedClientIds: [],
  serverError: null,
  pairingData: null,
  serverInfo: null,
  tipResponse: null,
  showTipSelection: () => {},
  updateTip: () => {},
  setBaseAmount: () => {},
  setScreenState: () => {},
  clearTipResponse: () => {},
  showPayment: (_paymentMethod?: "cash" | "card" | "manual") => {},
  showProcessing: (_paymentMethod?: "cash" | "card" | "manual", _tipAmountOverride?: number) => {},
  showApproved: () => {},
  showDeclined: () => {},
  showIdle: () => {},
  showLoyaltyPrompt: () => {},
  showLoyaltyConfirmation: () => {},
  disconnectClient: () => {},
  refreshCarouselImages: async () => {},
  refreshOrderingPanelImages: async () => {},
};

export function CFDProvider({ children }: { children: React.ReactNode }) {
  const isCFDMode = useStoreSettingsStore((s) => s.isCFDMode);

  // In CFD client mode, this device is a display client — don't start server
  if (isCFDMode) {
    return (
      <CFDContext.Provider value={noopCFDValue}>{children}</CFDContext.Provider>
    );
  }

  return <CFDServerProvider>{children}</CFDServerProvider>;
}

function CFDServerProvider({ children }: { children: React.ReactNode }) {
  const controllerRef = useRef<CFDController | null>(null);
  const pathname = usePathname();

  // Status states
  const [serverStatus, setServerStatus] = useState<CFDServerStatus>("disabled");
  const [isConnected, setIsConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([]);
  const [pairingData, setPairingData] = useState<CFDPairingData | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [tipResponse, setTipResponse] = useState<CFDTipResponse | null>(null);
  const [currentTip, setCurrentTip] = useState<{
    amount: number;
    percentage: number | null;
  }>({ amount: 0, percentage: null });
  const [activeScreenState, setActiveScreenState] =
    useState<CFDScreenState | null>(null);
  const activeScreenStateRef = useRef<CFDScreenState | null>(null);
  const [activePaymentMethod, setActivePaymentMethod] = useState<"cash" | "card" | "manual" | null>(null);
  const [baseAmountOverride, setBaseAmountOverride] = useState<number | null>(
    null,
  );
  const tipConfigRef = useRef<CFDPayload["tipConfig"] | null>(null);
  const lastPayloadHashRef = useRef("");
  const lastShowPaymentAtRef = useRef<number>(0);
  // Frozen totals snapshot taken at showProcessing — held until result screen clears
  const frozenTotalsRef = useRef<{
    total: number; totalCash: number; totalCard: number;
    tipAmount: number; savingsAmount: number;
    outstandingTotal: number; amountPaid: number;
    paymentMethod: "cash" | "card" | "manual" | null;
  } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const builtinIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loyaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const showCFDOrderingRightPanel = useStoreSettingsStore(
    (s) => s.showCFDOrderingRightPanel
  );
  const cfdOrderingRightPanelMode = useStoreSettingsStore(
    (s) => s.cfdOrderingRightPanelMode
  );
  const tipPresetPercentages = useLocationConfigStore(
    (s) => s.config.tips.presetPercentages
  );

  // Loyalty
  const merchantHasLoyalty = useLoyaltyStore((s) => s.merchantHasLoyalty);

  // Order store selectors - Individual selectors for stability
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null,
  );
  const activeOrderSeating = useSeatingStore((s) =>
    activeOrder?.id ? s.byOrderId[activeOrder.id] : undefined
  );
  // Ref so loyalty callbacks always see the latest order without re-registering
  const activeOrderRef = useRef(activeOrder);
  const activeOrderIdRef = useRef(activeOrderId);
  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);
  useEffect(() => { activeOrderIdRef.current = activeOrderId; }, [activeOrderId]);
  useEffect(() => { activeScreenStateRef.current = activeScreenState; }, [activeScreenState]);
  const activeOrderSubtotal = useOrderStore((s) => s.activeOrderSubtotal);
  const activeOrderTax = useOrderStore((s) => s.activeOrderTax);
  const activeOrderTotal = useOrderStore((s) => s.activeOrderTotal);
  const activeOrderDiscount = useOrderStore((s) => s.activeOrderDiscount);
  const activeOrderOutstandingTotal = useOrderStore(
    (s) => s.activeOrderOutstandingTotal,
  );

  // Transform cart items to CFD format with dual pricing
  const cfdItems: CFDCartItem[] = useMemo(() => {
    if (!activeOrder?.items) return [];
    const hideCourseNumbersOnCfd = pathname.includes("order-processing");

    return activeOrder.items
      .filter((item) => !item.is_voided && item.quantity > 0)
      .map((item) => {
        const cardUnitPrice = item.unitPrice || item.price || 0;
        const cashUnitPrice = item.cashPrice || cardUnitPrice;
        const cardLineTotal = item.subtotal || cardUnitPrice * item.quantity;
        const cashLineTotal = item.cashSubtotal || cashUnitPrice * item.quantity;

        if (DEBUG && item.courseNumber) {
          console.log(`[CFD] Item ${item.id} (${item.name}) -> Course ${item.courseNumber}`);
        }

        return {
          id: item.id,
          name: item.is_open_item
            ? (item.open_item_name ?? "Open Item")
            : item.name,
          quantity: item.quantity,
          unitPrice: Math.round(cardUnitPrice * 100),
          seatNumber:
            activeOrderSeating?.itemSeatMap?.[item.id] ??
            (item.db_order_item_id
              ? activeOrderSeating?.dbIdToSeatMap?.[item.db_order_item_id]
              : undefined) ??
            item.seatNumber ??
            null,
          courseNumber: hideCourseNumbersOnCfd ? undefined : item.courseNumber,
          cashPrice: Math.round(cashUnitPrice * 100),
          cardPrice: Math.round(cardUnitPrice * 100),
          lineTotal: Math.round(cardLineTotal * 100),
          lineTotalCash: Math.round(cashLineTotal * 100),
          lineTotalCard: Math.round(cardLineTotal * 100),
          modifiers: [
            ...(item.customizations?.size
              ? [
                  {
                    name: item.customizations.size.name,
                    price: Math.round(
                      (item.customizations.size.priceModifier || 0) * 100,
                    ),
                    priceCash: Math.round(
                      (item.customizations.size.priceModifier || 0) * 100,
                    ),
                    priceCard: Math.round(
                      (item.customizations.size.priceModifier || 0) * 100,
                    ),
                  },
                ]
              : []),
            ...(item.customizations?.addOns?.map((a) => ({
              name: a.name,
              price: Math.round((a.price || 0) * 100),
              priceCash: Math.round((a.price || 0) * 100),
              priceCard: Math.round((a.price || 0) * 100),
            })) ?? []),
            ...(item.customizations?.modifiers?.flatMap((m) =>
              m.options.map((o) => ({
                name: o.name,
                price: Math.round((o.price || 0) * 100),
                priceCash: Math.round((o.price || 0) * 100),
                priceCard: Math.round((o.price || 0) * 100),
                isNo: o.isNo,
                categoryName: m.categoryName,
              })),
            ) ?? []),
          ],
          notes: item.customizations?.notes,
        };
      });
  }, [activeOrder?.items, activeOrderSeating, pathname]);

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

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attemptStart = async (retryNum: number) => {
      if (cancelled) return;

      const ctrl = new CFDController({
        stationId: selectedStation.id,
        stationName: selectedStation.station_name,
        locationId: selectedStore.id,
        branding: {
          restaurantName: selectedStore.name,
          locationCode: selectedStore.code,
          logoUrl: organizationLogoUrl,
          primaryColor: "#10b981",
        },
        port: 8765,
      });

      controllerRef.current = ctrl;

      try {
        const info = await ctrl.start({
          onCFDConnected: (clientId) => {
            if (controllerRef.current !== ctrl) return;
            console.log("[useCFD] CFD connected:", clientId);
            setIsConnected(true);
            setClientCount(ctrl.clientCount);
            setConnectedClientIds(ctrl.connectedClientIds);
            setServerStatus("connected");
          },
          onCFDDisconnected: (clientId) => {
            if (controllerRef.current !== ctrl) return;
            console.log("[useCFD] CFD disconnected:", clientId);
            const count = ctrl.clientCount;
            setClientCount(count);
            setConnectedClientIds(ctrl.connectedClientIds);
            setIsConnected(count > 0);
            setServerStatus(count > 0 ? "connected" : "ready");
          },
          onTipSelected: (response: CFDTipResponse) => {
            if (controllerRef.current !== ctrl) return;
            console.log("[useCFD] Tip selected:", response);
            setTipResponse(response);
          },
          onPhoneSubmitted: async (phone) => {
            if (controllerRef.current !== ctrl) return;
            if (!selectedStore?.id) return;
            clearTimeout(loyaltyTimerRef.current!);
            loyaltyTimerRef.current = null;

            const orderId = activeOrderIdRef.current;
            const order = activeOrderRef.current;
            if (!order || !orderId || !order.db_order_id) {
              console.warn("[CFD Loyalty] No active order with db_order_id, skipping loyalty");
              setActiveScreenState(null);
              setBaseAmountOverride(null);
              setCurrentTip({ amount: 0, percentage: null });
              ctrl.showIdle();
              return;
            }

            const merchantId = selectedStore.merchant_id;

            try {
              const { id: customerId, name } = await findOrCreateCustomerByPhone(
                phone,
                merchantId,
                supabase
              );
              // Directly update the order's customer_id so the RPC can find it immediately
              await supabase
                .from("orders")
                .update({ customer_id: customerId })
                .eq("id", order.db_order_id);
              const results = await earnLoyaltyForOrder(order.db_order_id, supabase);
              const loyaltyResult = {
                customerName: name ?? undefined,
                programs: results.map((r) => ({
                  name: r.program_name,
                  type: r.program_type,
                  earned: r.earned,
                  newBalance: r.new_balance,
                  rewardUnlocked: r.reward_unlocked,
                })),
              };
              // Set store BEFORE triggering screen state so component mounts with data
              useCFDBuiltinStore.getState().update({
                screenState: "loyalty_confirmation",
                loyaltyResult,
              });
              setActiveScreenState("loyalty_confirmation");
              ctrl.showLoyaltyConfirmation(results, name ?? undefined);
              setTimeout(() => {
                if (controllerRef.current !== ctrl) return;
                setActiveScreenState(null);
                setBaseAmountOverride(null);
                setCurrentTip({ amount: 0, percentage: null });
                ctrl.showIdle();
                useCFDBuiltinStore.getState().update({ screenState: "idle", loyaltyResult: null });
              }, 4000);
            } catch (err) {
              console.error("[CFD Loyalty] Error processing loyalty:", err);
              // Fail-safe: always return to idle, never block the display
              setActiveScreenState(null);
              setBaseAmountOverride(null);
              setCurrentTip({ amount: 0, percentage: null });
              ctrl.showIdle();
            }
          },
          onLoyaltySkip: () => {
            if (controllerRef.current !== ctrl) return;
            clearTimeout(loyaltyTimerRef.current!);
            loyaltyTimerRef.current = null;
            setActiveScreenState(null);
            setBaseAmountOverride(null);
            setCurrentTip({ amount: 0, percentage: null });
            ctrl.showIdle();
          },
        });

        if (cancelled) { ctrl.stop(); return; }

        console.log("[useCFD] Server started:", info);
        setPairingData(ctrl.getPairingData());
        setServerStatus("ready");
      } catch (error: any) {
        if (cancelled) return;
        console.error("[useCFD] Server failed to start:", error);
        setServerStatus("error");
        setServerError(error.message);
        const delay = Math.min(3000 * (retryNum + 1), 30000);
        retryTimer = setTimeout(() => attemptStart(retryNum + 1), delay);
      }
    };

    attemptStart(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      console.log("[useCFD] Stopping Server...");
      controllerRef.current?.stop();
      controllerRef.current = null;
      setServerStatus("disabled");
      setPairingData(null);
      setIsConnected(false);
      setClientCount(0);
      setConnectedClientIds([]);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (builtinIdleTimerRef.current) {
        clearTimeout(builtinIdleTimerRef.current);
        builtinIdleTimerRef.current = null;
      }
      if (loyaltyTimerRef.current) {
        clearTimeout(loyaltyTimerRef.current);
        loyaltyTimerRef.current = null;
      }
    };
  }, [
    selectedStation?.id,
    selectedStore?.id,
    selectedStore?.name,
    selectedStation?.station_name,
    // organizationLogoUrl removed — handled by the branding effect below
  ]);

  // Update branding on running server when logo URL changes (avoids full server restart)
  useEffect(() => {
    if (serverStatus === "ready" || serverStatus === "connected") {
      controllerRef.current?.updateBranding({
        restaurantName: selectedStore?.name ?? "",
        locationCode: selectedStore?.code,
        logoUrl: organizationLogoUrl,
        primaryColor: "#10b981",
      });
    }
  }, [organizationLogoUrl, serverStatus, selectedStore?.name, selectedStore?.code]);

  // Fetch and Sync Carousel Images (for both WS clients and built-in display)
  const supabase = useSupabaseClient();
  const [hasBuiltinCfd, setHasBuiltinCfd] = useState(false);

  const fetchCarouselImages = useCallback(async () => {
    if (!selectedStore?.id || !controllerRef.current) return;
    try {
      const { data, error } = await supabase.rpc("get_active_cfd_images", {
        target_location_id: selectedStore.id,
      });
      if (error) { console.error("[CFD] Failed to fetch images:", error); return; }
      if (data && Array.isArray(data)) {
        const imageUrls = data.map((d: any) => d.image_url);
        console.log("[CFD] Updating carousel images:", imageUrls.length);
        controllerRef.current.updateCarouselImages(imageUrls);
        useCFDBuiltinStore.getState().update({ carouselImages: imageUrls });
      }
    } catch (err) {
      console.error("[CFD] Error fetching images:", err);
    }
  }, [selectedStore?.id, supabase]);

  const fetchOrderingPanelImages = useCallback(async () => {
    if (!selectedStore?.id || !controllerRef.current) return;
    try {
      const { data, error } = await supabase
        .from("cfd_ordering_panel_images")
        .select("panel_slot, image_url, display_order")
        .eq("location_id", selectedStore.id)
        .eq("is_active", true)
        .order("panel_slot", { ascending: true })
        .order("display_order", { ascending: true });

      if (error) {
        console.error("[CFD] Failed to fetch ordering panel images:", error);
        return;
      }

      const orderingPanelImages = {
        primary: [] as string[],
        secondary: [] as string[],
      };

      (data ?? []).forEach((row: any) => {
        if (row.panel_slot === "secondary") {
          orderingPanelImages.secondary.push(row.image_url);
        } else {
          orderingPanelImages.primary.push(row.image_url);
        }
      });

      controllerRef.current.updateOrderingPanelImages(orderingPanelImages);
      useCFDBuiltinStore.getState().update({ orderingPanelImages });
    } catch (err) {
      console.error("[CFD] Error fetching ordering panel images:", err);
    }
  }, [selectedStore?.id, supabase]);

  useEffect(() => {
    if (isConnected || hasBuiltinCfd) {
      fetchCarouselImages();
      fetchOrderingPanelImages();
      const interval = setInterval(() => {
        fetchCarouselImages();
        fetchOrderingPanelImages();
      }, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, hasBuiltinCfd, fetchCarouselImages, fetchOrderingPanelImages]);

  // Check loyalty on mount (5-min TTL cache)
  useEffect(() => {
    if (!selectedStore?.id) return;
    const { merchantHasLoyalty: cached, checkedAt, setMerchantHasLoyalty } =
      useLoyaltyStore.getState();
    const stale = Date.now() - checkedAt > 5 * 60_000;
    if (!cached || stale) {
      checkMerchantHasLoyalty(selectedStore.merchant_id, supabase)
        .then(setMerchantHasLoyalty)
        .catch(() => {}); // non-fatal
    }
  }, [selectedStore?.id]);

  // Order totals with dual pricing (used by both WS sync and built-in display)
  const orderTotals = useActiveOrderTotals();

  // Auto-sync order to CFD (WebSocket clients)
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !isConnected) return;

    // A "Sales Screen" indicates the cashier is actively taking or editing an order.
    // If we're on a dashboard or settings, the customer shouldn't see order details.
    const isSalesScreen = pathname.includes("order-processing") || pathname.includes("tables") || pathname.includes("floor-plan");

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
      // Debounce idle transition to prevent flicker during screen navigation
      if (!idleTimerRef.current) {
        idleTimerRef.current = setTimeout(() => {
          controller.showIdle();
          idleTimerRef.current = null;
        }, 500);
      }
      return () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        debouncedUpdateRef.current.cancel();
      };
    }

    // Cancel any pending idle transition since we have data to show
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    // items should always be synced if we're showing order data
    const cardSubtotal = Math.round(currentBase * 100);
    const cashSubtotal = Math.round((orderTotals?.cashSubtotal ?? currentBase) * 100);
    const cardTax = Math.round(activeOrderTax * 100);
    const cashTax = Math.round((orderTotals?.cashTax ?? activeOrderTax) * 100);
    const liveCardTotal = Math.round((activeOrderTotal + currentTip.amount) * 100);
    const liveCashTotal = Math.round(((orderTotals?.cashTotal ?? activeOrderTotal) + currentTip.amount) * 100);
    const frozen = frozenTotalsRef.current;
    const cardTotal = frozen ? frozen.totalCard : liveCardTotal;
    const cashTotal = frozen ? frozen.totalCash : liveCashTotal;
    const savingsAmount = frozen ? frozen.savingsAmount : Math.max(0, liveCardTotal - liveCashTotal);
    const displayTipAmount = frozen ? frozen.tipAmount : Math.round(currentTip.amount * 100);
    const displayOutstandingTotal = frozen
      ? frozen.outstandingTotal
      : Math.round((activeOrderOutstandingTotal + currentTip.amount) * 100);
    const displayAmountPaid = frozen
      ? frozen.amountPaid
      : Math.round((activeOrder?.amount_paid ?? 0) * 100);

    // For dine-in orders, get table ID
    const tableName = activeOrder?.order_type?.toLowerCase().includes("dine") ? (activeOrder?.service_location_id ?? null) : null;

    const params = {
      screenState: activeScreenState || undefined,
      serverName: null,
      customerName: activeOrder?.customer_name ?? null,
      orderNumber:
        activeOrder?.display_number ?? activeOrder?.order_number ?? null,
      orderType: activeOrder?.order_type ?? null,
      tableName,
      guestCount: activeOrder?.guest_count ?? null,
      items: cfdItems,
      subtotal: cardSubtotal,
      subtotalCash: cashSubtotal,
      subtotalCard: cardSubtotal,
      discountAmount: Math.round(activeOrderDiscount * 100),
      taxAmount: cardTax,
      taxCash: cashTax,
      taxCard: cardTax,
      tipAmount: displayTipAmount,
      tipPercentage: currentTip.percentage,
      total: cardTotal,
      totalCash: cashTotal,
      totalCard: cardTotal,
      savingsAmount,
      outstandingTotal: displayOutstandingTotal,
      amountPaid: displayAmountPaid,
      paymentMethod: frozen ? frozen.paymentMethod : activePaymentMethod,
      layout: {
        showOrderingRightPanel: showCFDOrderingRightPanel,
        orderingRightPanelMode: cfdOrderingRightPanelMode,
      },
      orderingPanelImages: useCFDBuiltinStore.getState().orderingPanelImages,
      tipConfig: tipConfigRef.current ?? undefined,
    };

    // Payment state transitions need immediate delivery; ordering state can be debounced
    const isPaymentState = activeScreenState === "payment" ||
      activeScreenState === "processing" ||
      activeScreenState === "approved" ||
      activeScreenState === "declined" ||
      activeScreenState === "tip_selection" ||
      activeScreenState === "loyalty_prompt" ||
      activeScreenState === "loyalty_confirmation";

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
    orderTotals,
    currentTip,
    activeScreenState,
    baseAmountOverride,
    pathname, // Essential for responding to screen changes
    showCFDOrderingRightPanel,
    cfdOrderingRightPanelMode,
  ]);

  // ==================== BUILT-IN SECONDARY DISPLAY ====================

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

  // Show/dismiss secondary display Presentation (lifecycle only — data flows via Zustand)
  useEffect(() => {
    if (hasBuiltinCfd) {
      showSecondaryDisplay();
    }
    return () => {
      if (hasBuiltinCfd) {
        dismissSecondaryDisplay();
      }
    };
  }, [hasBuiltinCfd]);

  // Sync order data to built-in display via useCFDBuiltinStore
  useEffect(() => {
    if (!hasBuiltinCfd) return;
    // Loyalty screens are managed directly — don't overwrite with order sync
    if (activeScreenState === "loyalty_prompt" || activeScreenState === "loyalty_confirmation") return;
    if (activeScreenStateRef.current === "loyalty_prompt" || activeScreenStateRef.current === "loyalty_confirmation") return;
    // Frozen totals are active — showProcessing/showApproved/showDeclined own the display directly
    if (frozenTotalsRef.current) return;

    const isSalesScreen = pathname.includes("order-processing") || pathname.includes("tables") || pathname.includes("floor-plan");
    const shouldShowOrderData =
      !!activeScreenState || (isSalesScreen && !!activeOrder);

    if (!shouldShowOrderData) {
      // Debounce idle transition to prevent flicker during screen navigation
      if (!builtinIdleTimerRef.current) {
        builtinIdleTimerRef.current = setTimeout(() => {
          const s = activeScreenStateRef.current;
          const storeState = useCFDBuiltinStore.getState().screenState;
          if (s === "loyalty_prompt" || s === "loyalty_confirmation" ||
              storeState === "loyalty_prompt" || storeState === "loyalty_confirmation") {
            builtinIdleTimerRef.current = null;
            return;
          }
          useCFDBuiltinStore.getState().update({
            screenState: "idle",
            serverName: null,
            customerName: null,
            orderNumber: null,
            orderType: null,
            tableName: null,
            guestCount: null,
            items: [],
            subtotal: 0,
            subtotalCash: 0,
            subtotalCard: 0,
            discountAmount: 0,
            taxAmount: 0,
            taxCash: 0,
            taxCard: 0,
            tipAmount: 0,
            tipPercentage: null,
            total: 0,
            totalCash: 0,
            totalCard: 0,
            savingsAmount: 0,
            outstandingTotal: 0,
            amountPaid: 0,
            tipConfig: null,
            paymentMethod: null,
            loyaltyPrompt: null,
            loyaltyResult: null,
            branding: {
              restaurantName: selectedStore?.name ?? "",
              locationCode: selectedStore?.code ?? null,
              logoUrl: organizationLogoUrl,
              primaryColor: "#10b981",
            },
            layout: {
              showOrderingRightPanel: showCFDOrderingRightPanel,
              orderingRightPanelMode: cfdOrderingRightPanelMode,
            },
          });
          builtinIdleTimerRef.current = null;
        }, 500);
      }
      return () => {
        if (builtinIdleTimerRef.current) {
          clearTimeout(builtinIdleTimerRef.current);
          builtinIdleTimerRef.current = null;
        }
      };
    }

    // Cancel any pending idle transition since we have data to show
    if (builtinIdleTimerRef.current) {
      clearTimeout(builtinIdleTimerRef.current);
      builtinIdleTimerRef.current = null;
    }

    const screenState = activeScreenState || "ordering";
    const currentBase = baseAmountOverride ?? activeOrderSubtotal;
    const cardSubtotal = Math.round(currentBase * 100);
    const cashSubtotal = Math.round((orderTotals?.cashSubtotal ?? currentBase) * 100);
    const cardTax = Math.round(activeOrderTax * 100);
    const cashTax = Math.round((orderTotals?.cashTax ?? activeOrderTax) * 100);
    const liveCardTotal = Math.round((activeOrderTotal + currentTip.amount) * 100);
    const liveCashTotal = Math.round(((orderTotals?.cashTotal ?? activeOrderTotal) + currentTip.amount) * 100);

    // Use frozen totals once set (from showProcessing) — prevents zeroing when order clears mid-payment
    const frozen = frozenTotalsRef.current;
    const cardTotal = frozen ? frozen.totalCard : liveCardTotal;
    const cashTotal = frozen ? frozen.totalCash : liveCashTotal;
    const savingsAmount = frozen ? frozen.savingsAmount : Math.max(0, liveCardTotal - liveCashTotal);
    const displayTipAmount = frozen ? frozen.tipAmount : Math.round(currentTip.amount * 100);

    // For dine-in orders, get table ID
    const builtinTableName = activeOrder?.order_type?.toLowerCase().includes("dine") ? (activeOrder?.service_location_id ?? null) : null;

    useCFDBuiltinStore.getState().update({
      screenState,
      serverName: null,
      customerName: activeOrder?.customer_name ?? null,
      orderNumber: activeOrder?.display_number ?? activeOrder?.order_number ?? null,
      orderType: activeOrder?.order_type ?? null,
      tableName: builtinTableName,
      guestCount: activeOrder?.guest_count ?? null,
      items: cfdItems,
      subtotal: cardSubtotal,
      subtotalCash: cashSubtotal,
      subtotalCard: cardSubtotal,
      discountAmount: Math.round(activeOrderDiscount * 100),
      taxAmount: cardTax,
      taxCash: cashTax,
      taxCard: cardTax,
      tipAmount: displayTipAmount,
      tipPercentage: currentTip.percentage,
      total: cardTotal,
      totalCash: cashTotal,
      totalCard: cardTotal,
      savingsAmount,
      outstandingTotal: Math.round(
        (activeOrderOutstandingTotal + currentTip.amount) * 100,
      ),
      amountPaid: Math.round((activeOrder?.amount_paid ?? 0) * 100),
      layout: {
        showOrderingRightPanel: showCFDOrderingRightPanel,
        orderingRightPanelMode: cfdOrderingRightPanelMode,
      },
      orderingPanelImages: useCFDBuiltinStore.getState().orderingPanelImages,
      tipConfig: tipConfigRef.current ?? null,
      branding: {
        restaurantName: selectedStore?.name ?? "",
        locationCode: selectedStore?.code ?? null,
        logoUrl: organizationLogoUrl,
        primaryColor: "#10b981",
      },
      paymentMethod:
        frozen
          ? frozen.paymentMethod
          : (paymentView === "cash" ? "cash" : paymentView === "card" || paymentView === "manual" ? "card" : null),
      // Preserve loyaltyResult — don't clear it if already set by the loyalty flow
      loyaltyResult: screenState === "loyalty_confirmation" || screenState === "loyalty_prompt"
        ? useCFDBuiltinStore.getState().loyaltyResult
        : null,
    });
  }, [
    hasBuiltinCfd,
    activeOrder,
    cfdItems,
    activeOrderSubtotal,
    activeOrderDiscount,
    activeOrderTax,
    activeOrderTotal,
    activeOrderOutstandingTotal,
    orderTotals,
    currentTip,
    activeScreenState,
    activePaymentMethod,
    paymentView,
    baseAmountOverride,
    pathname,
    selectedStore?.name,
    selectedStore?.code,
    organizationLogoUrl,
    showCFDOrderingRightPanel,
    cfdOrderingRightPanelMode,
  ]);

  // ==================== PAYMENT STORE → CFD SYNC ====================
  // Drive CFD payment screen directly from payment store view state,
  // so there are no race conditions between mounting/unmounting view components.
  const paymentIsOpen = usePaymentStore((s) => s.isOpen);
  const paymentView = usePaymentStore((s) => s.view);

  useEffect(() => {
    if (!paymentIsOpen) {
      // Don't clobber processing/approved/declined — showApproved/showDeclined own their lifecycle
      const current = activeScreenStateRef.current;
      if (current === "processing" || current === "approved" || current === "declined") return;
      setActiveScreenState(null);
      setActivePaymentMethod(null);
      controllerRef.current?.showIdle();
      return;
    }

    if (paymentView === "card" || paymentView === "manual") {
      lastShowPaymentAtRef.current = Date.now();
      setActiveScreenState("payment");
      const cfdPaymentMethod = paymentView === "manual" ? "manual" : "card";
      setActivePaymentMethod(cfdPaymentMethod);
      controllerRef.current?.showPayment(cfdPaymentMethod);
    } else if (
      paymentView === "cash" ||
      paymentView === "success" ||
      paymentView === "split-payment-success"
    ) {
      // Cash: tip selection / payment / processing owned by CashPaymentView callbacks
      // Success: owned by showApproved/showDeclined
    } else {
      setActiveScreenState(null);
      setActivePaymentMethod(null);
    }
  }, [paymentIsOpen, paymentView]);

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

    const frozen = frozenTotalsRef.current;
    if (frozen) {
      const nextTipAmount = Math.round(amount * 100);
      const baseCardTotal = Math.max(0, frozen.totalCard - frozen.tipAmount);
      const baseCashTotal = Math.max(0, frozen.totalCash - frozen.tipAmount);

      frozenTotalsRef.current = {
        ...frozen,
        tipAmount: nextTipAmount,
        total: baseCardTotal + nextTipAmount,
        totalCard: baseCardTotal + nextTipAmount,
        totalCash: baseCashTotal + nextTipAmount,
      };
    }
  }, []);

  const setBaseAmount = useCallback((amount: number | null) => {
    setBaseAmountOverride(amount);
  }, []);

  const setScreenState = useCallback((state: CFDScreenState | null) => {
    setActiveScreenState(state);
    if (state === null) setActivePaymentMethod(null);
  }, []);

  const clearTipResponse = useCallback(() => {
    setTipResponse(null);
  }, []);

  const showPayment = useCallback((paymentMethod?: "cash" | "card" | "manual") => {
    lastShowPaymentAtRef.current = Date.now();
    setActiveScreenState("payment");
    setActivePaymentMethod(paymentMethod ?? null);
    controllerRef.current?.showPayment(paymentMethod);
  }, []);

  const showProcessing = useCallback((paymentMethod?: "cash" | "card" | "manual", tipAmountOverride?: number) => {
    const tipDollars = tipAmountOverride !== undefined ? tipAmountOverride : currentTip.amount;
    const cardTotal = Math.round((activeOrderTotal + tipDollars) * 100);
    const cashTotal = Math.round(((orderTotals?.cashTotal ?? activeOrderTotal) + tipDollars) * 100);
    const tipAmt = Math.round(tipDollars * 100);
    const savings = Math.max(0, cardTotal - cashTotal);
    const frozen = {
      total: cardTotal,
      totalCard: cardTotal,
      totalCash: cashTotal,
      tipAmount: tipAmt,
      savingsAmount: savings,
      outstandingTotal: Math.round(
        (activeOrderOutstandingTotal + tipDollars) * 100,
      ),
      amountPaid: Math.round((activeOrder?.amount_paid ?? 0) * 100),
      paymentMethod: paymentMethod ?? null,
    };
    frozenTotalsRef.current = frozen;

    // Write directly to builtin store immediately — don't wait for React re-render
    if (hasBuiltinCfd) {
      useCFDBuiltinStore.getState().update({
        screenState: "processing",
        total: cardTotal,
        totalCard: cardTotal,
        totalCash: cashTotal,
        tipAmount: tipAmt,
        savingsAmount: savings,
        outstandingTotal: frozen.outstandingTotal,
        amountPaid: frozen.amountPaid,
        paymentMethod: paymentMethod ?? null,
      });
    }

    setActiveScreenState("processing");
    setActivePaymentMethod(paymentMethod ?? null);
    controllerRef.current?.showProcessing(paymentMethod, frozen);
  }, [activeOrderTotal, currentTip, orderTotals, hasBuiltinCfd]);

  const showApproved = useCallback(() => {
    const frozen = frozenTotalsRef.current;
    if (hasBuiltinCfd && frozen) {
      useCFDBuiltinStore.getState().update({
        screenState: "approved",
        total: frozen.total,
        totalCard: frozen.totalCard,
        totalCash: frozen.totalCash,
        tipAmount: frozen.tipAmount,
        savingsAmount: frozen.savingsAmount,
        paymentMethod: frozen.paymentMethod,
      });
    }
    setActiveScreenState("approved");
    controllerRef.current?.showApproved(frozen ? {
      total: frozen.total,
      totalCard: frozen.totalCard,
      totalCash: frozen.totalCash,
      tipAmount: frozen.tipAmount,
      savingsAmount: frozen.savingsAmount,
      paymentMethod: frozen.paymentMethod,
    } : undefined);
  }, [hasBuiltinCfd]);

  const showDeclined = useCallback(() => {
    const frozen = frozenTotalsRef.current;
    if (hasBuiltinCfd && frozen) {
      useCFDBuiltinStore.getState().update({
        screenState: "declined",
        total: frozen.total,
        totalCard: frozen.totalCard,
        totalCash: frozen.totalCash,
        tipAmount: frozen.tipAmount,
        savingsAmount: frozen.savingsAmount,
        paymentMethod: frozen.paymentMethod,
      });
    }
    setActiveScreenState("declined");
    controllerRef.current?.showDeclined(frozen ? {
      total: frozen.total,
      totalCard: frozen.totalCard,
      totalCash: frozen.totalCash,
      tipAmount: frozen.tipAmount,
      savingsAmount: frozen.savingsAmount,
      paymentMethod: frozen.paymentMethod,
    } : undefined);
  }, [hasBuiltinCfd]);

  const showIdle = useCallback(() => {
    // If a showPayment was called very recently (e.g. next view mounting), don't clobber it
    if (Date.now() - lastShowPaymentAtRef.current < 150) return;
    frozenTotalsRef.current = null;
    setActiveScreenState(null);
    setActivePaymentMethod(null);
    setBaseAmountOverride(null);
    setCurrentTip({ amount: 0, percentage: null });
    controllerRef.current?.showIdle();
  }, []);

  const showLoyaltyPrompt = useCallback(() => {
    const currentStoreState = useCFDBuiltinStore.getState().screenState;
    if (currentStoreState === "loyalty_confirmation") return;
    setActiveScreenState("loyalty_prompt");
    controllerRef.current?.showLoyaltyPrompt(selectedStore?.name ?? "");
    useCFDBuiltinStore.getState().update({ screenState: "loyalty_prompt", loyaltyResult: null });
    if (loyaltyTimerRef.current) clearTimeout(loyaltyTimerRef.current);
    loyaltyTimerRef.current = setTimeout(() => {
      setActiveScreenState(null);
      setBaseAmountOverride(null);
      setCurrentTip({ amount: 0, percentage: null });
      controllerRef.current?.showIdle();
      loyaltyTimerRef.current = null;
    }, 20_000);
  }, [selectedStore?.name]);

  const showLoyaltyConfirmation = useCallback(
    (result: LoyaltyEarnResult[], customerName?: string) => {
      setActiveScreenState("loyalty_confirmation");
      controllerRef.current?.showLoyaltyConfirmation(result, customerName);
      useCFDBuiltinStore.getState().update({
        screenState: "loyalty_confirmation",
        loyaltyResult: {
          customerName,
          programs: result.map((r) => ({
            name: r.program_name,
            type: r.program_type,
            earned: r.earned,
            newBalance: r.new_balance,
            rewardUnlocked: r.reward_unlocked,
          })),
        },
      });
    },
    []
  );

  // Auto-return to idle after payment result display
  useEffect(() => {
    if (activeScreenState === "approved") {
      const timer = setTimeout(() => {
        showLoyaltyPrompt();
      }, 4000);
      return () => clearTimeout(timer);
    }
    if (activeScreenState === "declined") {
      const timer = setTimeout(() => showIdle(), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeScreenState, showIdle, showLoyaltyPrompt]);

  const disconnectClient = useCallback((clientId: string) => {
    controllerRef.current?.unpairClient(clientId);
    setConnectedClientIds((prev) => {
      const updated = prev.filter((id) => id !== clientId);
      setClientCount(updated.length);
      setIsConnected(updated.length > 0);
      return updated;
    });
  }, []);

  const value = {
    serverStatus,
    isServerReady: serverStatus === "ready" || serverStatus === "connected",
    isConnected,
    clientCount,
    connectedClientIds,
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
    showLoyaltyPrompt,
    showLoyaltyConfirmation,
    disconnectClient,
    refreshCarouselImages: fetchCarouselImages,
    refreshOrderingPanelImages: fetchOrderingPanelImages,
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
