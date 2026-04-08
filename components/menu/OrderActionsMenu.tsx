import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { getTerminalMatchInfo } from "@/utils/terminalMatchGuard";
import {
  ChefHat,
  DollarSign,
  Eye,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";

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
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);
  const generateCartItemId = useOrderStore((s) => s.generateCartItemId);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const { show } = useToast();

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
      show({ title: "Print Error", message: "No order data available.", type: "error" });
      return;
    }

    if (!selectedStore) {
      show({ title: "Print Error", message: "No store location selected.", type: "error" });
      return;
    }

    const success = await PrinterService.printReceipt(order, selectedStore);

    if (success) {
      show({ title: "Receipt Sent", message: "Receipt sent to printer.", type: "success" });
    } else {
      useNoPrinterModalStore.getState().show("receipt");
    }
  };

  // Handle print kitchen ticket
  const handlePrintKitchenTicket = async () => {
    onClose();

    if (!order) {
      show({ title: "Print Error", message: "No order data available.", type: "error" });
      return;
    }

    if (!selectedStore) {
      show({ title: "Print Error", message: "No store location selected.", type: "error" });
      return;
    }

    const nonVoidedItems = order.items.filter((item) => !item.is_voided);
    if (nonVoidedItems.length === 0) {
      show({ title: "No Items", message: "No items to print on kitchen ticket.", type: "warning" });
      return;
    }

    const success = await PrinterService.printKitchenTickets(order, nonVoidedItems, selectedStore);

    if (success) {
      show({ title: "Kitchen Ticket Sent", message: "Kitchen ticket sent to printer.", type: "success" });
    } else {
      useNoPrinterModalStore.getState().show("kitchen");
    }
  };

  // Handle refund
  const handleRefund = () => {
    onClose();
    show({
      title: "Refund",
      message: "Refund functionality coming soon",
      type: "warning",
    });
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

  if (!order) return null;

  const hasOutstanding = order.paid_status !== "Paid";

  const menuItems: MenuItem[] = [
    {
      icon: <Eye size={18} color={colors.muted} />,
      label: "View Details",
      onPress: () => {
        onClose();
        onViewDetails();
      },
    },
    {
      icon: <Plus size={18} color={colors.muted} />,
      label: "Add to Bill",
      onPress: handleAddToBill,
      disabled: !activeOrderId || !order.items || order.items.length === 0,
    },
    {
      icon: <DollarSign size={18} color={colors.muted} />,
      label: "Pay Outstanding",
      onPress: handlePayOutstanding,
      disabled: !hasOutstanding,
    },
    {
      icon: <Printer size={18} color={colors.muted} />,
      label: "Print Receipt",
      onPress: handlePrintReceipt,
    },
    {
      icon: <ChefHat size={18} color={colors.muted} />,
      label: "Print Kitchen Ticket",
      onPress: handlePrintKitchenTicket,
      disabled: !order.items || order.items.filter((i) => !i.is_voided).length === 0,
    },
    {
      icon: <ReceiptText size={18} color={colors.danger} />,
      label: canTerminalRefund ? "Refund" : "Refund — wrong terminal",
      onPress: handleRefund,
      destructive: true,
      disabled: !canTerminalRefund,
    },
    {
      icon: <Trash2 size={18} color={colors.danger} />,
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
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        <View
          className={`flex-1 p-4 ${
            position ? "" : "items-center justify-center"
          }`}
        >
          <Pressable
            className="bg-panel rounded-lg shadow-2xl overflow-hidden min-w-[220px] border border-gray-700"
            onPress={(e) => e.stopPropagation()}
            style={
              position
                ? {
                    position: "absolute",
                    top: position.y, // Align top with button
                    left: position.x - 210, // Align right of menu with left of button (approx)
                  }
                : {}
            }
          >
            {/* Menu Header */}
            <View className="px-4 py-3 border-b border-gray-700 bg-panel">
              <Text className="text-xs font-semibold text-gray-400 uppercase">
                Order Actions
              </Text>
            </View>

            {/* Menu Items */}
            <View className="py-1">
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  className={`
                    flex-row items-center px-4 py-3
                    ${item.disabled ? "opacity-40" : "hover:bg-gray-800 active:bg-gray-700"}
                    ${index < menuItems.length - 1 && !item.destructive ? "border-b border-gray-800" : ""}
                  `}
                >
                  <View className="mr-3">{item.icon}</View>
                  <Text
                    className={`text-sm font-medium ${
                      item.destructive ? "text-red-500" : "text-white"
                    }`}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

export default OrderActionsMenu;
