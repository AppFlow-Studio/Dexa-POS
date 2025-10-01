import { InventoryUnit } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo, useState } from "react";
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

const AddInventoryItemSheet = forwardRef<AddInventoryItemSheetRef, {}>(
  (props, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const renderBackdrop = useMemo(
      () => (backdropProps: any) =>
        (
          <BottomSheetBackdrop
            {...backdropProps}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        ),
      []
    );

    const { vendors, addInventoryItem } = useInventoryStore();

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

    const handleSave = () => {
      const costNum = parseFloat(cost || "0");
      const stockQty = parseFloat(initialStock || "0");
      const thresholdNum = reorderThreshold ? parseInt(reorderThreshold) : 0;

      addInventoryItem({
        name: name.trim(),
        category: category.trim() || "Uncategorized",
        stockQuantity: isNaN(stockQty) ? 0 : Number(stockQty.toFixed(2)),
        unit,
        reorderThreshold: isNaN(thresholdNum) ? 0 : thresholdNum,
        cost: isNaN(costNum) ? 0 : Number(costNum.toFixed(2)),
        vendorId: vendorId || null,
        stockTrackingMode,
      });
      toast.success(`${name.trim()} added to inventory`, {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });

      // Reset form after save
      setStep(1);
      setName("");
      setCategory("Uncategorized");
      setUnit("pcs");
      setCost("");
      setVendorId("");
      setReorderThreshold("");
      setInitialStock("");
      setStockTrackingMode("quantity");
      // Close sheet
      (ref as any)?.current?.close?.();
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView className=" bg-[#303030] rounded-t-3xl overflow-hidden">
          <View className="p-3 border-b border-gray-700">
            <Text className="text-white text-xl font-bold">Add New Item</Text>
            <Text className="text-gray-400 mt-0.5 text-sm">( {step} / 3 )</Text>
          </View>

          <KeyboardAvoidingView
            behavior="padding"
            className="flex-1"
            contentContainerClassName="p-4"
          >
            {step === 1 && (
              <View>
                <Text className="text-gray-300 mb-3 text-base">
                  Let's start with the basics.
                </Text>
                <View className="mb-4">
                  <Text className="text-gray-300 mb-1.5 text-sm">
                    Item Name
                  </Text>
                  <BottomSheetTextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Jalapeño Peppers"
                    className="bg-[#212121] border border-gray-600 rounded-lg h-14 px-3 py-2 text-white text-base"
                  />
                </View>
                <TouchableOpacity
                  disabled={!canNextFromStep1}
                  onPress={() => setStep(2)}
                  className={`w-full py-3 rounded-xl ${
                    canNextFromStep1 ? "bg-blue-600" : "bg-gray-600"
                  }`}
                >
                  <Text className="text-white text-center text-lg font-bold">
                    Next →
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text className="text-gray-300 mb-3 text-base">
                  How do you purchase this item?
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1 mb-3">
                    <Text className="text-gray-300 mb-1.5 text-sm">Unit</Text>
                    <FlatList
                      numColumns={4}
                      data={UNIT_OPTIONS}
                      keyExtractor={(item) => item.value}
                      contentContainerClassName="gap-1.5"
                      columnWrapperClassName="gap-1.5"
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => setUnit(item.value)}
                          className={`px-2 py-1.5 flex items-center justify-center rounded-lg border ${
                            unit === item.value
                              ? "border-blue-500 bg-blue-900/30"
                              : "border-gray-600"
                          }`}
                        >
                          <Text
                            className={`${
                              unit === item.value
                                ? "text-blue-400"
                                : "text-gray-300"
                            } text-center text-xl`}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                  <View className="flex-1 mb-3">
                    <Text className="text-gray-300 mb-1.5 text-sm">
                      Cost/Unit ($)
                    </Text>
                    <BottomSheetTextInput
                      value={cost}
                      onChangeText={(t) => setCost(t.replace(/[^0-9.]/g, ""))}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      className="bg-[#212121] border border-gray-600 rounded-lg h-14 px-3 py-2 text-white text-base"
                    />
                  </View>
                </View>

                <View className="mb-4">
                  <Text className="text-gray-300 mb-1.5 text-sm">
                    Vendor (Optional)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-1.5">
                      <TouchableOpacity
                        onPress={() => setVendorId("")}
                        className={`px-2 py-1.5 rounded-lg border ${
                          vendorId === ""
                            ? "border-blue-500 bg-blue-900/30"
                            : "border-gray-600"
                        }`}
                      >
                        <Text
                          className={`${
                            vendorId === "" ? "text-blue-400" : "text-gray-300"
                          } text-sm`}
                        >
                          None
                        </Text>
                      </TouchableOpacity>
                      {vendors.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => setVendorId(v.id)}
                          className={`px-2 py-1.5 rounded-lg border ${
                            vendorId === v.id
                              ? "border-blue-500 bg-blue-900/30"
                              : "border-gray-600"
                          }`}
                        >
                          <Text
                            className={`${
                              vendorId === v.id
                                ? "text-blue-400"
                                : "text-gray-300"
                            } text-sm`}
                          >
                            {v.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setStep(1)}
                    className="flex-1 py-3 bg-[#303030] border border-gray-600 rounded-xl"
                  >
                    <Text className="text-white text-center text-lg font-bold">
                      ← Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canNextFromStep2}
                    onPress={() => setStep(3)}
                    className={`flex-1 py-3 rounded-xl ${
                      canNextFromStep2 ? "bg-blue-600" : "bg-gray-600"
                    }`}
                  >
                    <Text className="text-white text-center text-lg font-bold">
                      Next →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 3 && (
              <View>
                <Text className="text-gray-300 mb-3 text-base">
                  Set inventory rules.
                </Text>
                <View className="mb-3">
                  <Text className="text-gray-300 mb-1.5 text-sm">
                    Tracking Mode
                  </Text>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setStockTrackingMode("in_stock")}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        stockTrackingMode === "in_stock"
                          ? "border-blue-500 bg-blue-900/30"
                          : "border-gray-600"
                      }`}
                    >
                      <Text
                        className={`${
                          stockTrackingMode === "in_stock"
                            ? "text-blue-400"
                            : "text-gray-300"
                        } text-center text-lg font-semibold`}
                      >
                        In Stock
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setStockTrackingMode("out_of_stock")}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        stockTrackingMode === "out_of_stock"
                          ? "border-blue-500 bg-blue-900/30"
                          : "border-gray-600"
                      }`}
                    >
                      <Text
                        className={`${
                          stockTrackingMode === "out_of_stock"
                            ? "text-blue-400"
                            : "text-gray-300"
                        } text-center text-lg font-semibold`}
                      >
                        Out
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setStockTrackingMode("quantity")}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        stockTrackingMode === "quantity"
                          ? "border-blue-500 bg-blue-900/30"
                          : "border-gray-600"
                      }`}
                    >
                      <Text
                        className={`${
                          stockTrackingMode === "quantity"
                            ? "text-blue-400"
                            : "text-gray-300"
                        } text-center text-lg font-semibold`}
                      >
                        Quantity
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {stockTrackingMode === "quantity" && (
                  <View className="mb-3">
                    <Text className="text-gray-300 mb-1.5 text-sm">
                      Reorder Threshold
                    </Text>
                    <BottomSheetTextInput
                      value={reorderThreshold}
                      onChangeText={(t) =>
                        setReorderThreshold(t.replace(/[^0-9]/g, ""))
                      }
                      keyboardType="number-pad"
                      placeholder="e.g., 5"
                      className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base"
                    />
                    <Text className="text-gray-500 text-xs mt-1">
                      Alert at this level
                    </Text>
                  </View>
                )}
                {stockTrackingMode === "quantity" && (
                  <View className="mb-4">
                    <Text className="text-gray-300 mb-1.5 text-sm">
                      Initial Stock
                    </Text>
                    <BottomSheetTextInput
                      value={initialStock}
                      onChangeText={(t) =>
                        setInitialStock(t.replace(/[^0-9.]/g, ""))
                      }
                      keyboardType="decimal-pad"
                      placeholder="e.g., 10"
                      className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base"
                    />
                    <Text className="text-gray-500 text-xs mt-1">
                      Current quantity on hand
                    </Text>
                  </View>
                )}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setStep(2)}
                    className="flex-1 py-3 bg-[#303030] border border-gray-600 rounded-xl"
                  >
                    <Text className="text-white text-center text-lg font-bold">
                      ← Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    className="flex-1 py-3 bg-green-600 rounded-xl"
                  >
                    <Text className="text-white text-center text-lg font-bold">
                      ✓ Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

AddInventoryItemSheet.displayName = "AddInventoryItemSheet";

export default AddInventoryItemSheet;
