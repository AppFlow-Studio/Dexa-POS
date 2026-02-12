import { useToast } from "@/contexts/ToastContext";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";

const OpenItemAdder = () => {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);
  const { show } = useToast();

  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("0.00");

  const handlePriceInput = (value: string) => {
    // Clear all
    if (value === "clear") {
      setPriceDisplay("0.00");
      setOpenItemPrice("0.00");
      return;
    }

    // Backspace behavior
    if (value === "backspace") {
      let current = priceDisplay;
      if (current === "0.00") return;
      if (current.length <= 1) {
        setPriceDisplay("0.00");
        setOpenItemPrice("0.00");
        return;
      }
      const newDisplay = current.slice(0, -1);
      if (newDisplay === "" || newDisplay === "0" || newDisplay === "-") {
        setPriceDisplay("0.00");
        setOpenItemPrice("0.00");
      } else {
        setPriceDisplay(newDisplay);
        setOpenItemPrice(newDisplay);
      }
      return;
    }

    // Decimal point
    if (value === ".") {
      if (!priceDisplay.includes(".")) {
        const base = priceDisplay === "0.00" ? "0" : priceDisplay;
        const newDisplay = base + ".";
        setPriceDisplay(newDisplay);
        setOpenItemPrice(newDisplay);
      }
      return;
    }

    // Number input 0-9
    const isDigit = /^[0-9]$/.test(value);
    if (!isDigit) return;

    // If starting state, replace with the digit
    if (priceDisplay === "0.00" || priceDisplay === "0") {
      const newDisplay = value === "0" ? "0" : value;
      setPriceDisplay(newDisplay);
      setOpenItemPrice(newDisplay);
      return;
    }

    // Enforce max 2 decimals when a dot exists
    if (priceDisplay.includes(".")) {
      const [whole, decimals = ""] = priceDisplay.split(".");
      if (decimals.length >= 2) {
        // Already at 2 decimals; do not append more
        return;
      }
    }

    const newDisplay = priceDisplay + value;
    setPriceDisplay(newDisplay);
    setOpenItemPrice(newDisplay);
  };

  const handleAddOpenItem = () => {
    const itemName = openItemName.trim() || "Custom";
    const price = parseFloat(openItemPrice);

    if (isNaN(price) || price <= 0) {
      show({
        title: "Invalid Price",
        message: "Please enter a valid price greater than zero.",
        type: "error",
      });
      return;
    }

    // Check if the active order is closed
    const activeOrder = useOrderStore.getState().ordersById[activeOrderId ?? ""];
    if (activeOrder?.order_status === "completed") {
      show({
        title: "Order Closed",
        message: "This order is closed. Please reopen the check to add items.",
        type: "error",
      });
      return;
    }

    // Create a new cart item for the open item
    const cashPrice = Math.round(price * 96) / 100; // match 4% cash discount in RPC
    const newOpenItem = {
      id: `open_item_${Date.now()}`,
      itemId: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: itemName,
      quantity: 1,
      originalPrice: cashPrice,
      baseCashPrice: cashPrice,
      price: price,
      unitPrice: price,
      baseCardPrice: price,
      cashPrice: cashPrice,
      customizations: {
        notes: "Open Item",
      },
      availableDiscount: undefined,
      appliedDiscount: null,
      is_open_item: true,
      open_item_name: itemName,
      open_item_price: price,
      category_name: "Open Items",
      is_tax_exempt: false,
      paidQuantity: 0,
      subtotal: price,
      cashSubtotal: cashPrice,
      taxRate: 0,
      taxAmount: 0,
      cashTaxAmount: 0,
      discount_amount: 0,
      discount_cash_amount: 0,
    };

    addItemToActiveOrder(newOpenItem);

    // show({
    //   title: "Item Added",
    //   message: `${itemName} for $${price.toFixed(
    //     2
    //   )} has been added to the order.`,
    //   type: "success",
    // });

    // Reset form
    setOpenItemName("");
    setOpenItemPrice("");
    setPriceDisplay("0.00");
  };

  const NumpadButton: React.FC<{
    value: string;
    onPress: () => void;
    isDestructive?: boolean;
  }> = ({ value, onPress, isDestructive }) => (
    <TouchableOpacity
      onPress={onPress}
      className={`flex-1 h-12 rounded-lg items-center justify-center ${
        isDestructive ? "bg-red-600" : "bg-[#303030] border border-gray-600"
      }`}
    >
      <Text className="text-xl font-bold text-white">{value}</Text>
    </TouchableOpacity>
  );

  const renderNumpad = () => {
    const numpadButtons = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [".", "0", "backspace"],
    ];

    return (
      <View className="gap-2">
        {numpadButtons.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-2">
            {row.map((btn) => (
              <NumpadButton
                key={btn}
                value={btn}
                onPress={() =>
                  handlePriceInput(btn === "⌫" ? "backspace" : btn)
                }
                isDestructive={btn === "⌫"}
              />
            ))}
          </View>
        ))}
        <View className="flex flex-row justify-between gap-x-2 w-full">
          <TouchableOpacity
            onPress={() => handlePriceInput("clear")}
            className="h-14 bg-gray-600 w-1/2 rounded-lg items-center justify-center"
          >
            <Text className="text-lg font-medium text-white">Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddOpenItem}
            className="bg-blue-600 w-1/2 rounded-lg items-center justify-center"
          >
            <Text className="text-xl  font-bold text-white">Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#212121]"
    >
      <ScrollView className="flex-1 py-4">
        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Open Item Name
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-xl text-white h-16"
            value={openItemName}
            onChangeText={setOpenItemName}
            placeholder="Enter item name (default: Custom)"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Open Item Price
          </Text>
          <View className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 items-center">
            <Text className="text-3xl font-bold text-white">
              ${priceDisplay}
            </Text>
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Enter Price
          </Text>
          {renderNumpad()}
        </View>

        {/* <TouchableOpacity
        onPress={handleAddOpenItem}
        className="bg-blue-600 rounded-lg py-4 items-center mb-6"
      >
        <Text className="text-xl font-bold text-white">Add Item</Text>
      </TouchableOpacity> */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default OpenItemAdder;
