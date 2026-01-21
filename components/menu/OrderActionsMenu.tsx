import { useToast } from "@/contexts/ToastContext";
import { useOrderStore } from "@/stores/useOrderStore";
import {
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
  const {
    ordersById,
    activeOrderId,
    addItemToActiveOrder,
    generateCartItemId,
  } = useOrderStore();
  const { show } = useToast();

  // Get order (single index lookup - ordersById is keyed by DB UUID)
  const order = useMemo(() => {
    if (!orderId) return null;
    return ordersById[orderId] || null;
  }, [orderId, ordersById]);

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
  const handlePrintReceipt = () => {
    onClose();
    show({
      title: "Print Receipt",
      message: "Receipt printing coming soon",
      type: "warning",
    });
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
      icon: <Eye size={18} color="#6B7280" />,
      label: "View Details",
      onPress: () => {
        onClose();
        onViewDetails();
      },
    },
    {
      icon: <Plus size={18} color="#6B7280" />,
      label: "Add to Bill",
      onPress: handleAddToBill,
      disabled: !activeOrderId || !order.items || order.items.length === 0,
    },
    {
      icon: <DollarSign size={18} color="#6B7280" />,
      label: "Pay Outstanding",
      onPress: handlePayOutstanding,
      disabled: !hasOutstanding,
    },
    {
      icon: <Printer size={18} color="#6B7280" />,
      label: "Print Receipt",
      onPress: handlePrintReceipt,
    },
    {
      icon: <ReceiptText size={18} color="#EF4444" />,
      label: "Refund",
      onPress: handleRefund,
      destructive: true,
    },
    {
      icon: <Trash2 size={18} color="#EF4444" />,
      label: "Void Order",
      onPress: handleVoidOrder,
      destructive: true,
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
            className="bg-[#1a1a1a] rounded-lg shadow-2xl overflow-hidden min-w-[220px] border border-gray-700"
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
            <View className="px-4 py-3 border-b border-gray-700 bg-[#252525]">
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
