import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const OpenItemAdder = () => {
  const { activeOrderId, addItemToActiveOrder, orders } = useOrderStore();

  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("0.00");

  const handlePriceInput = (value: string) => {
    if (value === "clear") {
      setPriceDisplay("0.00");
      setOpenItemPrice("0.00");
      return;
    }

    if (value === "backspace") {
      if (priceDisplay.length > 1) {
        const newDisplay = priceDisplay.slice(0, -1);
        if (newDisplay === "0" || newDisplay === "") {
          setPriceDisplay("0.00");
          setOpenItemPrice("0.00");
        } else {
          setPriceDisplay(newDisplay);
          setOpenItemPrice(newDisplay);
        }
      }
      return;
    }

    // Handle decimal point
    if (value === ".") {
      if (!priceDisplay.includes(".")) {
        const newDisplay = priceDisplay + ".";
        setPriceDisplay(newDisplay);
        setOpenItemPrice(newDisplay);
      }
      return;
    }

    // Handle number input
    if (priceDisplay === "0.00" || priceDisplay === "0") {
      const newDisplay = value + ".00";
      setPriceDisplay(newDisplay);
      setOpenItemPrice(newDisplay);
    } else {
      const newDisplay = priceDisplay + value;
      setPriceDisplay(newDisplay);
      setOpenItemPrice(newDisplay);
    }
  };

  const handleAddOpenItem = () => {
    const itemName = openItemName.trim() || "Custom";
    const price = parseFloat(openItemPrice);

    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Check if the active order is closed
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    if (activeOrder?.order_status === "Closed") {
      toast.error("Order is closed. Please reopen the check to add items.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Create a new cart item for the open item
    const newOpenItem = {
      id: `open_item_${Date.now()}`,
      itemId: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: itemName,
      quantity: 1,
      originalPrice: price,
      price: price,
      customizations: {
        notes: "Open Item",
      },
      availableDiscount: undefined,
      appliedDiscount: null,
    };

    addItemToActiveOrder(newOpenItem);

    toast.success(`${itemName} ${price.toFixed(2)} added`, {
      duration: 4000,
      position: ToastPosition.BOTTOM,
    });

    // Reset form
    setOpenItemName("");
    setOpenItemPrice("");
    setPriceDisplay("0.00");
  };

  const renderNumpad = () => {
    const numpadButtons = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [".", "0", "backspace"],
    ];

    return (
      <View className="gap-3">
        {numpadButtons.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-3">
            {row.map((button) => (
              <TouchableOpacity
                key={button}
                onPress={() => handlePriceInput(button)}
                className={`flex-1 h-20 rounded-lg items-center justify-center ${
                  button === "backspace"
                    ? "bg-red-600"
                    : "bg-[#303030] border border-gray-600"
                }`}
              >
                <Text
                  className={`text-3xl font-bold ${
                    button === "backspace" ? "text-white" : "text-white"
                  }`}
                >
                  {button === "backspace" ? "⌫" : button}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <TouchableOpacity
          onPress={() => handlePriceInput("clear")}
          className="h-16 bg-gray-600 rounded-lg items-center justify-center"
        >
          <Text className="text-xl font-medium text-white">Clear</Text>
        </TouchableOpacity>
      </View>
    );
  };
  return (
    <View className="flex-1 bg-[#212121]">

      {/* Item Name Input */}
      <View className="mb-6">
        <Text className="text-2xl font-semibold text-white mb-3">
          Open Item Name
        </Text>
        <TextInput
          className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
          value={openItemName}
          onChangeText={setOpenItemName}
          placeholder="Enter item name (default: Custom)"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Price Display */}
      <View className="mb-6">
        <Text className="text-2xl font-semibold text-white mb-3">Open Item Price</Text>
        <View className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-5 items-center">
          <Text className="text-4xl font-bold text-white">${priceDisplay}</Text>
        </View>
      </View>

      {/* Numpad */}
      <View className="mb-6">
        <Text className="text-2xl font-semibold text-white mb-3">
          Enter Price
        </Text>
        {renderNumpad()}
      </View>

      {/* Add Button */}
      <TouchableOpacity
        onPress={handleAddOpenItem}
        className="bg-blue-600 rounded-lg py-4 items-center"
      >
        <Text className="text-2xl font-bold text-white">Add Item</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OpenItemAdder;
