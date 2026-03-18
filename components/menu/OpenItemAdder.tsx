import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { Delete } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screen,
    padding: 16,
    gap: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.heading,
    height: 44,
  },
  priceDisplay: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: `${colors.teal}40`,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  priceText: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.teal,
  },
  numpadRow: {
    flexDirection: "row",
    gap: 8,
  },
  numpadBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  numpadText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.heading,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  clearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.teal,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});

const OpenItemAdder = () => {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);
  const { show } = useToast();

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
    if (value === ".") {
      if (!priceDisplay.includes(".")) {
        const base = priceDisplay === "0.00" ? "0" : priceDisplay;
        const newDisplay = base + ".";
        setPriceDisplay(newDisplay);
        setOpenItemPrice(newDisplay);
      }
      return;
    }
    const isDigit = /^[0-9]$/.test(value);
    if (!isDigit) return;
    if (priceDisplay === "0.00" || priceDisplay === "0") {
      const newDisplay = value === "0" ? "0" : value;
      setPriceDisplay(newDisplay);
      setOpenItemPrice(newDisplay);
      return;
    }
    if (priceDisplay.includes(".")) {
      const [, decimals = ""] = priceDisplay.split(".");
      if (decimals.length >= 2) return;
    }
    const newDisplay = priceDisplay + value;
    setPriceDisplay(newDisplay);
    setOpenItemPrice(newDisplay);
  };

  const handleAddOpenItem = () => {
    const itemName = openItemName.trim() || "Custom";
    const price = parseFloat(openItemPrice);

    if (isNaN(price) || price <= 0) {
      show({ title: "Invalid Price", message: "Please enter a valid price greater than zero.", type: "error" });
      return;
    }

    const activeOrder = useOrderStore.getState().ordersById[activeOrderId ?? ""];
    if (activeOrder?.order_status === "completed") {
      show({ title: "Order Closed", message: "This order is closed. Please reopen the check to add items.", type: "error" });
      return;
    }

    const cashPrice = Math.round(price * 96) / 100;
    addItemToActiveOrder({
      id: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: itemName,
      quantity: 1,
      originalPrice: cashPrice,
      baseCashPrice: cashPrice,
      price,
      unitPrice: price,
      baseCardPrice: price,
      cashPrice,
      customizations: { notes: "Open Item" },
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
    });

    setOpenItemName("");
    setOpenItemPrice("");
    setPriceDisplay("0.00");
  };

  const numpadRows = [["1","2","3"],["4","5","6"],["7","8","9"],[".", "0", "backspace"]];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* Name */}
        <View>
          <Text style={styles.label}>Item Name</Text>
          <TextInput
            style={styles.input}
            value={openItemName}
            onChangeText={setOpenItemName}
            placeholder="Custom item name..."
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Price display */}
        <View>
          <Text style={styles.label}>Price</Text>
          <View style={styles.priceDisplay}>
            <Text style={styles.priceText}>${priceDisplay}</Text>
          </View>
        </View>

        {/* Numpad */}
        <View style={{ gap: 8 }}>
          {numpadRows.map((row, i) => (
            <View key={i} style={styles.numpadRow}>
              {row.map((btn) => (
                <TouchableOpacity
                  key={btn}
                  style={styles.numpadBtn}
                  onPress={() => handlePriceInput(btn === "backspace" ? "backspace" : btn)}
                >
                  {btn === "backspace"
                    ? <Delete size={18} color={colors.muted} />
                    : <Text style={styles.numpadText}>{btn}</Text>
                  }
                </TouchableOpacity>
              ))}
            </View>
          ))}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.clearBtn} onPress={() => handlePriceInput("clear")}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleAddOpenItem}>
              <Text style={styles.addBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default OpenItemAdder;
