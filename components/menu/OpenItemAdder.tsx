import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import { useColorScheme } from "@/lib/useColorScheme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Delete, Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type CustomModifierDraft = {
  id: string;
  name: string;
  price: number;
};

const MODIFIER_PRICE_DELTA_COLOR = "#15803D";

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const createStyles = (modalLayout: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      width: "100%",
      minHeight: 0,
      backgroundColor: colors.screen,
      padding: 10,
      paddingBottom: 10,
      gap: 6,
      justifyContent: "space-between",
    },
    topContent: {
      gap: 6,
    },
    label: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.heading,
      height: 38,
    },
    modifierRow: {
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
    },
    stepTwoContent: {
      gap: 8,
    },
    summaryRow: {
      flexDirection: "row",
      gap: 8,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: `${colors.teal}30`,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      justifyContent: "center",
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.heading,
    },
    summarySubtext: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 2,
    },
    toGoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: `${colors.teal}30`,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    toGoTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.heading,
    },
    toGoSubtitle: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    modifierSection: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 8,
      gap: 8,
    },
    modifierHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    modifierHeaderText: {
      flex: 1,
      fontSize: 11,
      color: colors.muted,
      lineHeight: 15,
    },
    emptyModifierState: {
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    modifierChip: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: `${colors.teal}25`,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: modalLayout ? 180 : 156,
      flexBasis: modalLayout ? "48%" : "100%",
      flexGrow: 1,
      maxWidth: "100%",
    },
    modifierList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2,
    },
    modifierAddBtn: {
      width: 38,
      height: 38,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.teal}18`,
      borderWidth: 1,
      borderColor: `${colors.teal}40`,
    },
    priceDisplay: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: `${colors.teal}40`,
      borderRadius: 10,
      paddingVertical: 6,
      alignItems: "center",
    },
    priceText: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.teal,
    },
    numpadRow: {
      flexDirection: "row",
      gap: 4,
    },
    numpadBtn: {
      flex: 1,
      height: 36,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    numpadText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.heading,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    clearBtn: {
      flex: 1,
      height: 40,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addBtn: {
      flex: 1,
      height: 40,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.teal,
    },
    addBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.onSolid,
    },
  });

interface OpenItemAdderProps {
  onCreated?: () => void;
  modalLayout?: boolean;
}

const OpenItemAdder = ({
  onCreated,
  modalLayout = false,
}: OpenItemAdderProps) => {
  const { colorScheme } = useColorScheme();
  const styles = useMemo(
    () => createStyles(modalLayout),
    [colorScheme, modalLayout],
  );

  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);
  const { show } = useToast();

  const pricingStrategy = useStoreSettingsStore(
    (s) => s.selectedStore?.pricing_strategy,
  );
  const dualPricingPct = useStoreSettingsStore(
    (s) => s.selectedStore?.dual_pricing_percentage,
  );
  const isDualPricing =
    pricingStrategy === "dual" &&
    typeof dualPricingPct === "number" &&
    dualPricingPct > 0;

  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");
  const [priceDisplay, setPriceDisplay] = useState("0.00");
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [modifierName, setModifierName] = useState("");
  const [modifierPrice, setModifierPrice] = useState("");
  const [customModifiers, setCustomModifiers] = useState<CustomModifierDraft[]>(
    [],
  );
  const [toGo, setToGo] = useState(false);

  const modifierTotal = useMemo(
    () => round2(customModifiers.reduce((sum, mod) => sum + mod.price, 0)),
    [customModifiers],
  );

  const basePrice = parseFloat(openItemPrice);
  const parsedBasePrice = Number.isFinite(basePrice) ? basePrice : 0;
  const totalEnteredPrice = round2(parsedBasePrice + modifierTotal);

  const resetForm = () => {
    setOpenItemName("");
    setOpenItemPrice("");
    setPriceDisplay("0.00");
    setCurrentStep(1);
    setModifierName("");
    setModifierPrice("");
    setCustomModifiers([]);
    setToGo(false);
  };

  const validateBasePrice = (): boolean => {
    const price = parseFloat(openItemPrice);
    if (isNaN(price) || price <= 0) {
      show({
        title: "Invalid Price",
        message: "Please enter a valid price greater than zero.",
        type: "error",
      });
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateBasePrice()) return;
    setCurrentStep(2);
  };

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

    if (!validateBasePrice()) return;

    const activeOrder =
      useOrderStore.getState().ordersById[activeOrderId ?? ""];
    if (activeOrder?.order_status === "completed") {
      show({
        title: "Order Closed",
        message: "This order is closed. Please reopen the check to add items.",
        type: "error",
      });
      return;
    }

    // Lever 2: don't let the modal close as if it succeeded if the active order
    // belongs to another station. The store-level _checkCartEditable would
    // silently no-op the add otherwise.
    const myStationId = useOrderStore.getState().currentStationId;
    if (
      activeOrder &&
      activeOrder.station_id != null &&
      myStationId != null &&
      activeOrder.station_id !== myStationId
    ) {
      show({
        title: "Read-only",
        message:
          "This order is owned by another station. Take over to add items.",
        type: "warning",
      });
      return;
    }

    // User enters the cash/base price; card price is increased by the dual pricing percentage
    let cardPrice: number;
    let cashPrice: number;
    if (isDualPricing) {
      cardPrice = round2(totalEnteredPrice * (1 + dualPricingPct! / 100));
      cashPrice = totalEnteredPrice;
    } else {
      cardPrice = totalEnteredPrice;
      cashPrice = totalEnteredPrice;
    }

    let baseCardPrice: number;
    let baseCashPrice: number;
    if (isDualPricing) {
      baseCardPrice = round2(price * (1 + dualPricingPct! / 100));
      baseCashPrice = price;
    } else {
      baseCardPrice = price;
      baseCashPrice = price;
    }

    const mappedModifiers =
      customModifiers.length > 0
        ? [
            {
              categoryId: "custom-open-item-modifiers",
              categoryName: "Custom Modifiers",
              options: customModifiers.map((mod) => ({
                id: mod.id,
                name: mod.name,
                price: mod.price,
              })),
            },
          ]
        : undefined;

    const itemId = `open_item_${Date.now()}`;

    const newItem: CartItem = {
      id: itemId,
      menuItemId: itemId,
      name: itemName,
      quantity: 1,
      originalPrice: cashPrice,
      baseCashPrice,
      price: cardPrice,
      unitPrice: cardPrice,
      baseCardPrice,
      cashPrice,
      customizations: {
        notes: "",
        modifiers: mappedModifiers,
      },
      availableDiscount: undefined,
      appliedDiscount: null,
      is_open_item: true,
      open_item_name: itemName,
      open_item_price: cardPrice,
      is_to_go: toGo,
      category_name: "Open Items",
      is_tax_exempt: false,
      paidQuantity: 0,
      subtotal: cardPrice,
      cashSubtotal: cashPrice,
      taxRate: 0,
      taxAmount: 0,
      cashTaxAmount: 0,
      discount_amount: 0,
      discount_cash_amount: 0,
    };

    addItemToActiveOrder(newItem);

    resetForm();
    onCreated?.();
  };

  const handleAddModifier = () => {
    const nextName = modifierName.trim();
    const trimmedPrice = modifierPrice.trim();
    const parsedPrice = parseFloat(trimmedPrice);
    const nextPrice =
      trimmedPrice === ""
        ? 0
        : Number.isFinite(parsedPrice)
          ? parsedPrice
          : NaN;

    if (!nextName) {
      show({
        title: "Modifier Name Required",
        message: "Enter a name for the custom modifier.",
        type: "error",
      });
      return;
    }

    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      show({
        title: "Invalid Modifier Price",
        message: "Enter a valid modifier price of $0.00 or more.",
        type: "error",
      });
      return;
    }

    setCustomModifiers((prev) => [
      ...prev,
      {
        id: `custom_modifier_${Date.now()}_${prev.length}`,
        name: nextName,
        price: round2(nextPrice),
      },
    ]);
    setModifierName("");
    setModifierPrice("");
    Keyboard.dismiss();
  };

  const removeModifier = (modifierId: string) => {
    setCustomModifiers((prev) => prev.filter((mod) => mod.id !== modifierId));
  };

  const numpadRows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "backspace"],
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.container}>
        <View style={styles.topContent}>
          {/* Header */}
          <View style={{ marginBottom: 4 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}
            >
              Custom Item
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {currentStep === 1
                ? "Step 1 of 2: enter the item name and base price"
                : "Step 2 of 2: add custom modifiers and review the total"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            {[1, 2].map((step) => {
              const active = currentStep === step;
              const complete = currentStep > step;
              return (
                <View
                  key={step}
                  style={{
                    flex: 1,
                    height: 30,
                    borderRadius: 9,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      active || complete ? colors.teal : colors.border,
                    backgroundColor:
                      active || complete ? `${colors.teal}18` : colors.panel,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: active || complete ? colors.teal : colors.muted,
                    }}
                  >
                    {step === 1 ? "Item Details" : "Modifiers"}
                  </Text>
                </View>
              );
            })}
          </View>

          {currentStep === 1 ? (
            <>
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

              <View>
                <Text style={styles.label}>Base Price</Text>
                <View style={styles.priceDisplay}>
                  <Text style={styles.priceText}>
                    ${parsedBasePrice.toFixed(2)}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  Step 2 will let you add optional custom modifiers.
                </Text>
                {isDualPricing && (
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.muted,
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    Item Price Increase is enabled, the final total will be
                    adjusted by {dualPricingPct}%
                  </Text>
                )}
              </View>

              <View style={{ gap: 4 }}>
                {numpadRows.map((row, i) => (
                  <View key={i} style={styles.numpadRow}>
                    {row.map((btn) => (
                      <TouchableOpacity
                        key={btn}
                        style={styles.numpadBtn}
                        onPress={() =>
                          handlePriceInput(
                            btn === "backspace" ? "backspace" : btn,
                          )
                        }
                      >
                        {btn === "backspace" ? (
                          <Delete size={18} color={colors.muted} />
                        ) : (
                          <Text style={styles.numpadText}>{btn}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.stepTwoContent}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.label}>Base</Text>
                  <Text style={styles.summaryValue}>
                    ${parsedBasePrice.toFixed(2)}
                  </Text>
                  <Text style={styles.summarySubtext}>Entered item price</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.label}>Modifiers</Text>
                  <Text style={styles.summaryValue}>
                    ${modifierTotal.toFixed(2)}
                  </Text>
                  <Text style={styles.summarySubtext}>Added custom extras</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.label}>Final</Text>
                  <Text style={[styles.summaryValue, { color: colors.teal }]}>
                    ${totalEnteredPrice.toFixed(2)}
                  </Text>
                  <Text style={styles.summarySubtext}>
                    {isDualPricing
                      ? `Card adjusted ${dualPricingPct}%`
                      : "Ready to create"}
                  </Text>
                </View>
              </View>

              <View style={styles.toGoRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.toGoTitle}>TO GO</Text>
                  <Text style={styles.toGoSubtitle}>
                    Package this item to-go
                  </Text>
                </View>
                <Switch
                  value={toGo}
                  onValueChange={setToGo}
                  trackColor={{ false: colors.border, true: colors.teal }}
                  thumbColor={colors.onSolid}
                />
              </View>

              <View style={styles.modifierSection}>
                <View style={styles.modifierHeaderRow}>
                  <Text style={styles.label}>Custom Modifiers</Text>
                  <Text style={styles.modifierHeaderText}>
                    Add optional extras like side sauce, topping, or upcharge.
                  </Text>
                </View>
                <View style={styles.modifierRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input}
                      value={modifierName}
                      onChangeText={setModifierName}
                      placeholder="Modifier name"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ width: 96 }}>
                    <TextInput
                      style={styles.input}
                      value={modifierPrice}
                      onChangeText={setModifierPrice}
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.modifierAddBtn}
                    onPress={handleAddModifier}
                  >
                    <Plus size={16} color={colors.teal} />
                  </TouchableOpacity>
                </View>

                {customModifiers.length > 0 ? (
                  <View style={styles.modifierList}>
                    {customModifiers.map((modifier) => (
                      <View key={modifier.id} style={styles.modifierChip}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: colors.heading,
                            }}
                            numberOfLines={1}
                          >
                            {modifier.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "600",
                              color: MODIFIER_PRICE_DELTA_COLOR,
                              marginTop: 1,
                            }}
                          >
                            +${modifier.price.toFixed(2)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => removeModifier(modifier.id)}
                        >
                          <X size={14} color={colors.muted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyModifierState}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      No modifiers added yet. You can create the item as-is or
                      add priced extras first.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          {currentStep === 1 ? (
            <>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => handlePriceInput("clear")}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.muted,
                  }}
                >
                  Clear Price
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={handleNextStep}>
                <Text style={styles.addBtnText}>Next: Modifiers</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setCurrentStep(1)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.muted,
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleAddOpenItem}
              >
                <Text style={styles.addBtnText}>Create Item</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
};

export default OpenItemAdder;
