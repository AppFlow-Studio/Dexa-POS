import { InventoryUnit } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, { BottomSheetBackdrop, BottomSheetTextInput, BottomSheetView } from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { UNIT_OPTIONS } from "./InventoryItemFormModal";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
export type AddInventoryItemSheetRef = BottomSheet;



const AddInventoryItemSheet = forwardRef<AddInventoryItemSheetRef, {}>((props, ref) => {
    const snapPoints = useMemo(() => ["90%"], []);
    const renderBackdrop = useMemo(
        () => (backdropProps: any) => (
            <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
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
    const [stockTrackingMode, setStockTrackingMode] = useState<"in_stock" | "out_of_stock" | "quantity">("quantity");

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
                {/* Header with progress */}
                <View className="p-4 border-b border-gray-700">
                    <Text className="text-white text-2xl font-bold">Add New Item</Text>
                    <Text className="text-gray-400 mt-1">( {step} / 3 )</Text>
                </View>

                <KeyboardAvoidingView behavior="padding" className="flex-1" contentContainerClassName="p-6">
                    {step === 1 && (
                        <View>
                            <Text className="text-gray-300 mb-4">Let's start with the basics. What is the item?</Text>
                            <View className="mb-6">
                                <Text className="text-gray-300 mb-2">Item Name</Text>
                                <BottomSheetTextInput
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="e.g., Jalapeño Peppers"
                                    placeholderTextColor="#9CA3AF"
                                    className="bg-[#212121] border border-gray-600 rounded-lg h-16 px-4 py-3 text-white text-lg"

                                />
                            </View>
                            {/* <View className="mb-6">
                                <Text className="text-gray-300 mb-2">Category</Text>
                                <BottomSheetTextInput
                                    value={category}
                                    onChangeText={setCategory}
                                    placeholder="e.g., Produce"
                                    placeholderTextColor="#9CA3AF"
                                    className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                                />
                            </View> */}
                            <TouchableOpacity
                                disabled={!canNextFromStep1}
                                onPress={() => setStep(2)}
                                className={`w-full py-4 rounded-xl ${canNextFromStep1 ? "bg-blue-600" : "bg-gray-600"}`}
                            >
                                <Text className="text-white text-center text-xl font-bold">Next →</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {step === 2 && (
                        <View>
                            <Text className="text-gray-300 mb-4">How do you purchase this item?</Text>
                            <View className="flex-row gap-4">
                                <View className="flex-1 mb-4">
                                    <Text className="text-gray-300 mb-2">Unit of Measurement</Text>
                                    <FlatList numColumns={4}
                                        data={UNIT_OPTIONS}
                                        keyExtractor={(item) => item.value}
                                        contentContainerClassName="gap-x-2 gap-y-2"
                                        columnWrapperClassName="gap-x-2"
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                key={item.value}
                                                onPress={() => setUnit(item.value)}
                                                className={`px-3 py-2 flex items-center justify-center rounded-lg border ${unit === item.value ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                            >
                                                <Text className={`${unit === item.value ? "text-blue-400" : "text-gray-300"} text-center text-2xl`}>{item.label}</Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                </View>
                                <View className="flex-1 mb-4">
                                    <Text className="text-gray-300 mb-2">Cost Per Unit ($)</Text>
                                    <BottomSheetTextInput
                                        value={cost}
                                        onChangeText={(t) => setCost(t.replace(/[^0-9.]/g, ""))}
                                        keyboardType="decimal-pad"
                                        placeholder="0.00"
                                        placeholderTextColor="#9CA3AF"
                                        className="bg-[#212121] border border-gray-600 rounded-lg h-16 px-4 py-3 text-white text-lg"
                                    />
                                </View>
                            </View>

                            <View className="mb-6">
                                <Text className="text-gray-300 mb-2">Default Vendor (Optional)</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View className="flex-row gap-2">
                                        <TouchableOpacity
                                            onPress={() => setVendorId("")}
                                            className={`px-3 py-2 rounded-lg border ${vendorId === "" ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                        >
                                            <Text className={`${vendorId === "" ? "text-blue-400" : "text-gray-300"}`}>None</Text>
                                        </TouchableOpacity>
                                        {vendors.map((v) => (
                                            <TouchableOpacity
                                                key={v.id}
                                                onPress={() => setVendorId(v.id)}
                                                className={`px-3 py-2 rounded-lg border ${vendorId === v.id ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                            >
                                                <Text className={`${vendorId === v.id ? "text-blue-400" : "text-gray-300"}`}>{v.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>

                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setStep(1)} className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl">
                                    <Text className="text-white text-center text-xl font-bold">← Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity disabled={!canNextFromStep2} onPress={() => setStep(3)} className={`flex-1 py-4 rounded-xl ${canNextFromStep2 ? "bg-blue-600" : "bg-gray-600"}`}>
                                    <Text className="text-white text-center text-xl font-bold">Next →</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View>
                            <Text className="text-gray-300 mb-4">Set your inventory rules.</Text>
                            <View className="mb-4">
                                <Text className="text-gray-300 mb-2">Stock Tracking Mode</Text>
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        onPress={() => setStockTrackingMode("in_stock")}
                                        className={`flex-1 px-4 py-3 rounded-lg border ${stockTrackingMode === "in_stock" ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                    >
                                        <Text className={`${stockTrackingMode === "in_stock" ? "text-blue-400" : "text-gray-300"} text-center text-xl font-semibold`}>In Stock</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setStockTrackingMode("out_of_stock")}
                                        className={`flex-1 px-4 py-3 rounded-lg border ${stockTrackingMode === "out_of_stock" ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                    >
                                        <Text className={`${stockTrackingMode === "out_of_stock" ? "text-blue-400" : "text-gray-300"} text-center text-xl font-semibold`}>Out of Stock</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setStockTrackingMode("quantity")}
                                        className={`flex-1 px-4 py-3 rounded-lg border ${stockTrackingMode === "quantity" ? "border-blue-500 bg-blue-900/30" : "border-gray-600"}`}
                                    >
                                        <Text className={`${stockTrackingMode === "quantity" ? "text-blue-400" : "text-gray-300"} text-center text-xl font-semibold`}>Quantity</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {stockTrackingMode === "quantity" && (
                                <KeyboardAvoidingView className="mb-4">
                                    <Text className="text-gray-300 mb-2">Reorder Threshold (Optional)</Text>
                                    <BottomSheetTextInput
                                        value={reorderThreshold}
                                        onChangeText={(t) => setReorderThreshold(t.replace(/[^0-9]/g, ""))}
                                        keyboardType="number-pad"
                                        placeholder="5"
                                        placeholderTextColor="#9CA3AF"
                                        className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                                    />
                                    <Text className="text-gray-500 text-sm mt-1">We'll alert you at this level</Text>
                                </KeyboardAvoidingView>
                            )}

                            {stockTrackingMode === "quantity" && (
                                <View className="mb-6">
                                    <Text className="text-gray-300 mb-2">Initial Stock Quantity</Text>
                                    <BottomSheetTextInput
                                        value={initialStock}
                                        onChangeText={(t) => setInitialStock(t.replace(/[^0-9.]/g, ""))}
                                        keyboardType="decimal-pad"
                                        placeholder="10"
                                        placeholderTextColor="#9CA3AF"
                                        className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                                    />
                                    <Text className="text-gray-500 text-sm mt-1">How many are you adding now?</Text>
                                </View>
                            )}

                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setStep(2)} className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl">
                                    <Text className="text-white text-center text-xl font-bold">← Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleSave} className="flex-1 py-4 bg-green-600 rounded-xl">
                                    <Text className="text-white text-center text-xl font-bold">✓ Save Item</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </BottomSheetView>
        </BottomSheet>
    );
});

AddInventoryItemSheet.displayName = "AddInventoryItemSheet";

export default AddInventoryItemSheet;


