import { useToast } from "@/contexts/ToastContext";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { InventoryUnit } from "@/lib/types";
import { useColorScheme } from "@/lib/useColorScheme";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useMemo, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { UNIT_OPTIONS } from "./InventoryItemFormModal";

export type AddInventoryItemSheetRef = BottomSheet;

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  color: colors.heading,
  fontSize: 13,
  height: 38,
  paddingHorizontal: 12,
  paddingVertical: 8,
};

const fieldLabel = {
  fontSize: 10,
  fontWeight: "700" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  marginBottom: 6,
};

const AddInventoryItemSheet = forwardRef<AddInventoryItemSheetRef, {}>(
  (props, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const renderBackdrop = useMemo(
      () => (backdropProps: any) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
      [],
    );

    const { vendors, addInventoryItem } = useInventoryStore();
    const { show } = useToast();
    const { selectedStore } = useStoreSettingsStore();
    const { colorScheme } = useColorScheme();
    const keyboardAppearance = colorScheme === "dark" ? "dark" : "light";

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [name, setName] = useState("");
    const [category, setCategory] = useState("Uncategorized");

    const [unit, setUnit] = useState<InventoryUnit>("pcs");
    const [cost, setCost] = useState("");
    const [vendorId, setVendorId] = useState<string | "">("");

    const [reorderThreshold, setReorderThreshold] = useState("5");
    const [initialStock, setInitialStock] = useState("10");
    const [stockTrackingMode, setStockTrackingMode] = useState<
      "in_stock" | "out_of_stock" | "quantity"
    >("quantity");

    const canNextFromStep1 = name.trim().length > 0;
    const canNextFromStep2 = !!unit && cost.trim().length > 0;

    const handleSave = async () => {
      if (!selectedStore?.id) {
        show({
          title: "Error",
          message: "No store selected. Please select a store first.",
          type: "error",
        });
        return;
      }

      const costNum = parseFloat(cost || "0");
      const stockQty = parseFloat(initialStock || "0");
      const thresholdNum = reorderThreshold ? parseInt(reorderThreshold) : 0;

      try {
        await addInventoryItem(
          {
            name: name.trim(),
            category: category.trim() || "Uncategorized",
            stockQuantity: isNaN(stockQty) ? 0 : Number(stockQty.toFixed(2)),
            unit,
            reorderThreshold: isNaN(thresholdNum) ? 0 : thresholdNum,
            cost: isNaN(costNum) ? 0 : Number(costNum.toFixed(2)),
            vendorId: vendorId || null,
            stockTrackingMode,
          },
          selectedStore.id,
        );

        show({
          title: "Item Added",
          message: `"${name.trim()}" has been successfully added to your inventory.`,
          type: "success",
        });

        setStep(1);
        setName("");
        setCategory("Uncategorized");
        setUnit("pcs");
        setCost("");
        setVendorId("");
        setReorderThreshold("");
        setInitialStock("");
        setStockTrackingMode("quantity");
        (ref as any)?.current?.close?.();
      } catch (error) {
        console.error("Error adding item:", error);
        show({
          title: "Error",
          message: "Failed to add item. Please try again.",
          type: "error",
        });
      }
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView
          style={{
            backgroundColor: colors.panel,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: "hidden",
            flex: 1,
          }}
        >
          {/* Header */}
          <View
            style={{
              padding: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
              backgroundColor: colors.panel,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  Add Item
                </Text>
                <Text
                  style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}
                >
                  Step {step} of 3
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: colors.teal + "15",
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  {step}/3
                </Text>
              </View>
            </View>
          </View>

          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <View style={{ padding: 14 }}>
              {step === 1 && (
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.label,
                      marginBottom: 14,
                    }}
                  >
                    Let's start with the basics.
                  </Text>
                  <View style={{ marginBottom: 16 }}>
                    <Text style={fieldLabel}>Item Name</Text>
                    <BottomSheetTextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g., Jalapeño Peppers"
                      placeholderTextColor={colors.muted}
                      keyboardAppearance={keyboardAppearance}
                      selectionColor={colors.teal}
                      cursorColor={colors.teal}
                      style={inputStyle}
                    />
                  </View>
                  <TouchableOpacity
                    disabled={!canNextFromStep1}
                    onPress={() => setStep(2)}
                    style={{
                      backgroundColor: canNextFromStep1
                        ? colors.teal
                        : colors.muted + "20",
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      opacity: canNextFromStep1 ? 1 : 0.5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: colors.onSolid,
                      }}
                    >
                      Next →
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {step === 2 && (
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.label,
                      marginBottom: 14,
                    }}
                  >
                    How do you purchase this item?
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1, marginBottom: 12 }}>
                      <Text style={fieldLabel}>Unit</Text>
                      <FlatList
                        numColumns={4}
                        data={UNIT_OPTIONS}
                        keyExtractor={(item) => item.value}
                        contentContainerStyle={{ gap: 6 }}
                        columnWrapperStyle={{ gap: 6 }}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            onPress={() => setUnit(item.value as InventoryUnit)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 8,
                              backgroundColor:
                                unit === item.value
                                  ? colors.teal + "15"
                                  : colors.muted + "05",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: unit === item.value ? "700" : "500",
                                color:
                                  unit === item.value
                                    ? colors.teal
                                    : colors.label,
                                textAlign: "center",
                              }}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                    <View style={{ flex: 1, marginBottom: 12 }}>
                      <Text style={fieldLabel}>Cost/Unit ($)</Text>
                      <BottomSheetTextInput
                        value={cost}
                        onChangeText={(t) => setCost(t.replace(/[^0-9.]/g, ""))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={colors.muted}
                        keyboardAppearance={keyboardAppearance}
                        selectionColor={colors.teal}
                        cursorColor={colors.teal}
                        style={inputStyle}
                      />
                    </View>
                  </View>

                  <View style={{ marginBottom: 16 }}>
                    <Text style={fieldLabel}>Vendor (Optional)</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => setVendorId("")}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              vendorId === ""
                                ? colors.teal + "15"
                                : colors.muted + "05",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: vendorId === "" ? "700" : "500",
                              color:
                                vendorId === "" ? colors.teal : colors.label,
                            }}
                          >
                            None
                          </Text>
                        </TouchableOpacity>
                        {vendors.map((v) => (
                          <TouchableOpacity
                            key={v.id}
                            onPress={() => setVendorId(v.id)}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 8,
                              backgroundColor:
                                vendorId === v.id
                                  ? colors.teal + "15"
                                  : colors.muted + "05",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: vendorId === v.id ? "700" : "500",
                                color:
                                  vendorId === v.id
                                    ? colors.teal
                                    : colors.label,
                              }}
                            >
                              {v.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setStep(1)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        backgroundColor: colors.muted + "08",
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.label,
                        }}
                      >
                        ← Back
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={!canNextFromStep2}
                      onPress={() => setStep(3)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        backgroundColor: canNextFromStep2
                          ? colors.teal
                          : colors.muted + "20",
                        borderRadius: 10,
                        alignItems: "center",
                        opacity: canNextFromStep2 ? 1 : 0.5,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.onSolid,
                        }}
                      >
                        Next →
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {step === 3 && (
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.label,
                      marginBottom: 14,
                    }}
                  >
                    Set inventory rules.
                  </Text>
                  <View style={{ marginBottom: 12 }}>
                    <Text style={fieldLabel}>Tracking Mode</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {(["in_stock", "out_of_stock", "quantity"] as const).map(
                        (mode) => {
                          const isActive = stockTrackingMode === mode;
                          const label =
                            mode === "in_stock"
                              ? "In Stock"
                              : mode === "out_of_stock"
                                ? "Out"
                                : "Quantity";
                          return (
                            <TouchableOpacity
                              key={mode}
                              onPress={() => setStockTrackingMode(mode)}
                              style={{
                                flex: 1,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: isActive
                                  ? colors.teal + "15"
                                  : colors.muted + "05",
                                alignItems: "center",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: isActive ? "700" : "500",
                                  color: isActive ? colors.teal : colors.label,
                                }}
                              >
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        },
                      )}
                    </View>
                  </View>
                  {stockTrackingMode === "quantity" && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={fieldLabel}>Reorder Threshold</Text>
                      <BottomSheetTextInput
                        value={reorderThreshold}
                        onChangeText={(t) =>
                          setReorderThreshold(t.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="number-pad"
                        placeholder="e.g., 5"
                        placeholderTextColor={colors.muted}
                        keyboardAppearance={keyboardAppearance}
                        selectionColor={colors.teal}
                        cursorColor={colors.teal}
                        style={inputStyle}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          marginTop: 4,
                        }}
                      >
                        Alert at this level
                      </Text>
                    </View>
                  )}
                  {stockTrackingMode === "quantity" && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={fieldLabel}>Initial Stock</Text>
                      <BottomSheetTextInput
                        value={initialStock}
                        onChangeText={(t) =>
                          setInitialStock(t.replace(/[^0-9.]/g, ""))
                        }
                        keyboardType="decimal-pad"
                        placeholder="e.g., 10"
                        placeholderTextColor={colors.muted}
                        keyboardAppearance={keyboardAppearance}
                        selectionColor={colors.teal}
                        cursorColor={colors.teal}
                        style={inputStyle}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          marginTop: 4,
                        }}
                      >
                        Current quantity on hand
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setStep(2)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        backgroundColor: colors.muted + "08",
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.label,
                        }}
                      >
                        ← Back
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSave}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        backgroundColor: colors.teal,
                        borderRadius: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.onSolid,
                        }}
                      >
                        ✓ Save Item
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

AddInventoryItemSheet.displayName = "AddInventoryItemSheet";

export default AddInventoryItemSheet;
