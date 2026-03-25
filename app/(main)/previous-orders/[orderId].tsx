import AdvancedRefundModal, {
  AdvancedRefundModalRef,
} from "@/components/previous-orders/AdvancedRefundModal";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PrintReceiptModal from "@/components/previous-orders/PrintReceiptModal";
import ActionsPanel from "@/components/previous-orders/detail/ActionsPanel";
import BillTab from "@/components/previous-orders/detail/BillTab";
import OrderDetailHeader from "@/components/previous-orders/detail/OrderDetailHeader";
import OrderDetailSkeleton from "@/components/previous-orders/detail/OrderDetailSkeleton";
import OrderMetadata from "@/components/previous-orders/detail/OrderMetadata";
import PaymentsTab from "@/components/previous-orders/detail/PaymentsTab";
import RefundsTab from "@/components/previous-orders/detail/RefundsTab";
import SummaryCards from "@/components/previous-orders/detail/SummaryCards";
import TimelineTab from "@/components/previous-orders/detail/TimelineTab";
import TipAdjustSheet, {
  TipAdjustSheetRef,
} from "@/components/previous-orders/detail/TipAdjustSheet";
import { useToast } from "@/contexts/ToastContext";
import {
  useCloseCheck,
  useReopenCheck,
  useVoidOrder,
} from "@/hooks/orders/useOrderActions";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { previousOrderToOrderProfile } from "@/utils/previousOrderMapper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "@/lib/theme";
import { Clock, CreditCard, Receipt, RotateCcw } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type TabType = "bill" | "payments" | "refunds" | "timeline";

const TABS: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: "bill", label: "Bill", icon: Receipt },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "refunds", label: "Refunds", icon: RotateCcw },
  { key: "timeline", label: "Timeline", icon: Clock },
];

const OrderDetailsScreen = () => {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const orderIdParam = String(orderId ?? "");
  const order = usePreviousOrdersStore((s) => s.getOrderById(orderIdParam));
  const refreshPreviousOrders = usePreviousOrdersStore(
    (s) => s.refreshPreviousOrders,
  );
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const { show } = useToast();
  const closeCheckMutation = useCloseCheck();
  const reopenCheckMutation = useReopenCheck();
  const voidOrderMutation = useVoidOrder();

  const [activeTab, setActiveTab] = useState<TabType>("bill");
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);

  const refundModalRef = useRef<AdvancedRefundModalRef>(null);
  const tipAdjustRef = useRef<TipAdjustSheetRef>(null);

  // Ensure history is loaded (cold start / deep link) before not-found
  useEffect(() => {
    if (!orderIdParam) {
      setHistoryHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!usePreviousOrdersStore.getState().getOrderById(orderIdParam)) {
          await usePreviousOrdersStore
            .getState()
            .refreshPreviousOrders({ force: true });
        }
      } finally {
        if (!cancelled) setHistoryHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderIdParam]);

  // Deferred rendering for smooth navigation
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshPreviousOrders({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPreviousOrders]);

  const handleReopen = useCallback(() => {
    if (!order?.db_order_id) return;
    reopenCheckMutation.mutate({ dbOrderId: order.db_order_id });
  }, [order?.db_order_id, reopenCheckMutation]);

  if (!historyHydrated) {
    return <OrderDetailSkeleton />;
  }

  // Not-found state
  if (!order) {
    return (
      <View className="flex-1 items-center justify-center p-4 bg-screen">
        <Text className="text-2xl font-bold text-red-400 mb-3">
          Order Not Found
        </Text>
        <Text className="text-xl text-gray-400 mb-1.5">
          Looking for: {orderIdParam}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 px-4 py-2 bg-blue-600 rounded-lg"
        >
          <Text className="text-lg text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Skeleton while waiting for interaction manager
  if (!isReady) {
    return <OrderDetailSkeleton />;
  }

  const profileOrder = previousOrderToOrderProfile(order);

  return (
    <View className="flex-1 bg-screen">
      <OrderDetailHeader order={order} onBack={() => router.back()} />

      <View className="flex-1 flex-row">
        {/* Left Pane */}
        <View className="flex-[3] border-r border-border">
          {/* Tab Bar */}
          <View className="flex-row border-b border-border px-4">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const TabIcon = tab.icon;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  className={`flex-row items-center gap-1.5 py-3 px-3 border-b-2 ${
                    isActive ? "border-blue-500" : "border-transparent"
                  }`}
                >
                  <TabIcon
                    color={isActive ? colors.info : colors.label}
                    size={18}
                  />
                  <Text
                    className={`text-sm font-semibold ${
                      isActive ? "text-blue-500" : "text-gray-400"
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.info}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeIn.duration(200)}>
              {activeTab === "bill" && <BillTab order={order} />}
              {activeTab === "payments" && <PaymentsTab order={order} />}
              {activeTab === "refunds" && <RefundsTab order={order} />}
              {activeTab === "timeline" && (
                <TimelineTab order={profileOrder} />
              )}
            </Animated.View>
          </ScrollView>
        </View>

        {/* Right Pane */}
        <ScrollView
          className="flex-[2]"
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(300).delay(100)}>
            <SummaryCards order={order} />
          </Animated.View>

          <Animated.View entering={FadeIn.duration(300).delay(200)}>
            <OrderMetadata order={order} />
          </Animated.View>

          <Animated.View entering={FadeIn.duration(300).delay(300)}>
            <ActionsPanel
              order={profileOrder}
              onRefund={() => refundModalRef.current?.open()}
              onTipAdjust={() => tipAdjustRef.current?.open()}
              onPrint={() => setShowPrintModal(true)}
              onReopen={handleReopen}
              onCloseCheck={() => {
                if (!profileOrder.db_order_id) return;
                closeCheckMutation.mutate(profileOrder.db_order_id);
              }}
              onVoidOrder={() => {
                if (!profileOrder.db_order_id) return;
                voidOrderMutation.mutate({
                  dbOrderId: profileOrder.db_order_id,
                });
              }}
              onNotes={() => setShowNotesModal(true)}
              isClosingCheck={closeCheckMutation.isPending}
              isReopeningCheck={reopenCheckMutation.isPending}
              isVoiding={voidOrderMutation.isPending}
            />
          </Animated.View>
        </ScrollView>
      </View>

      {/* Modals */}
      <AdvancedRefundModal
        ref={refundModalRef}
        onClose={() => {}}
        order={profileOrder}
      />

      <TipAdjustSheet ref={tipAdjustRef} order={profileOrder} />

      <PrintReceiptModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        order={profileOrder}
        location={selectedStore}
      />

      <OrderNotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        order={profileOrder}
      />
    </View>
  );
};

export default OrderDetailsScreen;
