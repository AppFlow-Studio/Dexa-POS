import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { PrinterService } from "@/services/printing/PrinterService";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { getTerminalMatchInfo } from "@/utils/terminalMatchGuard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
    ChefHat,
    DollarSign,
    Eye,
    LogIn,
    Plus,
    Printer,
    Trash2,
} from "lucide-react-native";
import React, { useMemo } from "react";
import {
    Modal,
    Pressable,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

interface OrderActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  onViewDetails: () => void;
  position?: { x: number; y: number; width: number; height: number } | null;
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

const OrderActionsMenu: React.FC<OrderActionsMenuProps> = ({
  isOpen,
  onClose,
  orderId,
  onViewDetails,
  position,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);
  const generateCartItemId = useOrderStore((s) => s.generateCartItemId);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const { show } = useToast();
  const { height: screenHeight } = useWindowDimensions();

  // Get order (single index lookup - benefits from immer structural sharing)
  const order = useOrder(orderId);

  // Check if active terminal matches the order's payment terminal type
  const { canProcess: canTerminalRefund } = useMemo(
    () =>
      getTerminalMatchInfo(
        order?.payments,
        selectedStation?.payment_terminal?.terminal_type,
      ),
    [order?.payments, selectedStation?.payment_terminal?.terminal_type],
  );

  // Handle add to bill
  const handleAddToBill = () => {
    onClose();

    if (!activeOrderId) {
      show({
        title: "No Active Order",
        message: "Please start a new order before adding items.",
        type: "error",
      });
      return;
    }

    if (!order || !order.items || order.items.length === 0) {
      show({
        title: "No Items to Add",
        message: "This order has no items to add to the bill.",
        type: "warning",
      });
      return;
    }

    // Add items from the order to the current active order
    let addedCount = 0;
    order.items.forEach((item) => {
      const newItem = {
        ...item,
        id: generateCartItemId(item.menuItemId, item.customizations),
        isDraft: false,
        // Defensive backfill: source items from older legacy paths might lack
        // base prices. Without these, addItemToBackend sends NULL to the RPC
        // and the server's 4% cash-discount fallback fires.
        baseCardPrice: item.baseCardPrice ?? item.price ?? item.originalPrice,
        baseCashPrice: item.baseCashPrice ?? item.cashPrice ?? item.price,
      };
      addItemToActiveOrder(newItem);
      addedCount++;
    });

    show({
      title: "Items Added",
      message: `${addedCount} items from the order have been added to the current bill.`,
      type: "success",
    });
  };

  // Handle pay outstanding
  const handlePayOutstanding = () => {
    onClose();
    show({
      title: "Pay Outstanding",
      message: "Payment flow coming soon",
      type: "warning",
    });
  };

  // Handle print receipt
  const handlePrintReceipt = async () => {
    onClose();

    if (!order) {
      show({
        title: "Print Error",
        message: "No order data available.",
        type: "error",
      });
      return;
    }

    if (!selectedStore) {
      show({
        title: "Print Error",
        message: "No store location selected.",
        type: "error",
      });
      return;
    }

    const success = await PrinterService.printReceipt(order, selectedStore);

    if (success) {
      show({
        title: "Receipt Sent",
        message: "Receipt sent to printer.",
        type: "success",
      });
    } else {
      useNoPrinterModalStore.getState().show("receipt");
    }
  };

  // Handle print kitchen ticket
  const handlePrintKitchenTicket = async () => {
    onClose();

    if (!order) {
      show({
        title: "Print Error",
        message: "No order data available.",
        type: "error",
      });
      return;
    }

    if (!selectedStore) {
      show({
        title: "Print Error",
        message: "No store location selected.",
        type: "error",
      });
      return;
    }

    const nonVoidedItems = order.items.filter((item) => !item.is_voided);
    if (nonVoidedItems.length === 0) {
      show({
        title: "No Items",
        message: "No items to print on kitchen ticket.",
        type: "warning",
      });
      return;
    }

    const success = await PrinterService.printKitchenTickets(
      order,
      nonVoidedItems,
      selectedStore,
    );

    if (success) {
      show({
        title: "Kitchen Ticket Sent",
        message: "Kitchen ticket sent to printer.",
        type: "success",
      });
    } else {
      useNoPrinterModalStore.getState().show("kitchen");
    }
  };

  // Handle void order
  const handleVoidOrder = () => {
    onClose();
    show({
      title: "Void Order",
      message: "Order void functionality coming soon",
      type: "warning",
    });
  };

  // Handle take over (foreign-station claim) — no confirm modal, the menu
  // tap itself is the deliberate action. Light haptic for feedback.
  const handleTakeOver = () => {
    onClose();
    if (!orderId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void (async () => {
      const result = await useOrderStore.getState().claimOrderById(orderId);
      if (!result.success) return;

      const claimedOrder = useOrderStore.getState().ordersById[orderId];
      const isEmptyDraft =
        claimedOrder?.order_status === "draft" &&
        (claimedOrder.items?.length ?? 0) === 0;

      if (isEmptyDraft) {
        useOrderStore.getState().setActiveOrder(orderId);
        router.replace("/order-processing");
      }
    })();
  };

  if (!order) return null;

  const hasOutstanding = order.paid_status !== "Paid";
  const isForeign =
    !!order.station_id &&
    !!currentStationId &&
    order.station_id !== currentStationId;
  const overlayBackground = "rgba(0,0,0,0.5)";
  const menuBorder = colors.border;
  const rowDivider = colors.border;
  const destructiveColor = colors.danger;
  const normalLabelColor = colors.heading;
  const disabledOpacity = 0.4;

  const menuItems: MenuItem[] = [
    {
      icon: <Eye size={s(18)} color={colors.muted} />,
      label: "View Details",
      onPress: () => {
        onClose();
        onViewDetails();
      },
    },
    ...(isForeign
      ? [
          {
            icon: <LogIn size={s(18)} color={colors.warning} />,
            label: "Take Over Order",
            onPress: handleTakeOver,
          },
        ]
      : []),
    {
      icon: <Plus size={s(18)} color={colors.muted} />,
      label: "Add to Bill",
      onPress: handleAddToBill,
      disabled: !activeOrderId || !order.items || order.items.length === 0,
    },
    {
      icon: <DollarSign size={s(18)} color={colors.muted} />,
      label: "Pay Outstanding",
      onPress: handlePayOutstanding,
      disabled: !hasOutstanding,
    },
    {
      icon: <Printer size={s(18)} color={colors.muted} />,
      label: "Print Receipt",
      onPress: handlePrintReceipt,
    },
    {
      icon: <ChefHat size={s(18)} color={colors.muted} />,
      label: "Print Kitchen Ticket",
      onPress: handlePrintKitchenTicket,
      disabled:
        !order.items || order.items.filter((i) => !i.is_voided).length === 0,
    },
    {
      icon: <Trash2 size={s(18)} color={colors.danger} />,
      label: canTerminalRefund ? "Void Order" : "Void — wrong terminal",
      onPress: handleVoidOrder,
      destructive: true,
      disabled: !canTerminalRefund,
    },
  ];

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1"
        style={{ backgroundColor: overlayBackground }}
        onPress={onClose}
      >
        <View
          className={`flex-1 p-4 ${
            position ? "" : "items-center justify-center"
          }`}
        >
          <Pressable
            className="rounded-lg overflow-hidden min-w-[220px] border"
            onPress={(e) => e.stopPropagation()}
            style={
              position
                ? {
                    backgroundColor: colors.panel,
                    borderColor: menuBorder,
                    shadowColor: colors.screen,
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.28,
                    shadowRadius: 20,
                    elevation: 20,
                    position: "absolute",
                    // Estimate menu height: header (~44) + items (46 each) + padding
                    // Flip above the button if too close to bottom of screen
                    ...(() => {
                      const ROW_H = s(46);
                      const MENU_HEIGHT = s(44) + menuItems.length * ROW_H + s(16);
                      const spaceBelow = screenHeight - position.y;
                      if (spaceBelow < MENU_HEIGHT) {
                        return {
                          bottom: screenHeight - position.y - position.height,
                        };
                      }
                      return { top: position.y };
                    })(),
                    left: position.x - s(210),
                  }
                : {
                    backgroundColor: colors.panel,
                    borderColor: menuBorder,
                    shadowColor: colors.screen,
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.28,
                    shadowRadius: 20,
                    elevation: 20,
                  }
            }
          >
            {/* Menu Header */}
            <View
              className="px-4 py-3 border-b"
              style={{
                borderBottomColor: rowDivider,
                backgroundColor: colors.panel,
              }}
            >
              <Text
                className="text-xs font-semibold uppercase"
                style={{ color: colors.muted }}
              >
                Order Actions
              </Text>
            </View>

            {/* Menu Items */}
            <View className="py-1">
              {menuItems.map((item, index) => {
                const isLastNormal =
                  !item.destructive &&
                  (index === menuItems.length - 1 ||
                    menuItems[index + 1]?.destructive);
                const isFirstDestructive =
                  item.destructive &&
                  (index === 0 || !menuItems[index - 1]?.destructive);
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={item.onPress}
                    disabled={item.disabled}
                    className="flex-row items-center px-4"
                    style={{
                      opacity: item.disabled ? disabledOpacity : 1,
                      height: s(46),
                      marginTop: isFirstDestructive ? s(4) : 0,
                      borderTopWidth: isFirstDestructive ? 1 : 0,
                      borderTopColor: item.destructive
                        ? colors.danger + "25"
                        : rowDivider,
                      backgroundColor: item.destructive
                        ? colors.danger + "08"
                        : colors.panel,
                    }}
                  >
                    <View
                      style={{
                        width: s(32),
                        height: s(32),
                        borderRadius: s(8),
                        backgroundColor: item.destructive
                          ? colors.danger + "15"
                          : colors.muted + "12",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: s(12),
                      }}
                    >
                      {item.icon}
                    </View>
                    <Text
                      className="text-sm font-medium"
                      style={{
                        color: item.destructive
                          ? destructiveColor
                          : normalLabelColor,
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

export default OrderActionsMenu;
