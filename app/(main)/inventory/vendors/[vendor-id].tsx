import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { POLineItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Edit3, Plus, Search, Trash2 } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-gesture-handler";

const StatCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-1 bg-[#303030] border border-gray-700 rounded-2xl p-4 mr-3">
    <Text className="text-lg font-semibold text-gray-400">{label}</Text>
    <Text className="text-2xl font-bold text-white mt-1">{value}</Text>
  </View>
);

const VendorDetailsScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const rawId = (params as any).vendorId || (params as any)["vendor-id"];
  const vendorId = Array.isArray(rawId) ? rawId[0] : rawId;
  const [activeTab, setActiveTab] = useState<
    "purchase-orders" | "associated-items"
  >("purchase-orders");

  const { vendors, purchaseOrders, inventoryItems } = useInventoryStore();
  const vendor = vendors.find((v) => v.id === vendorId);

  const vendorPOs = useMemo(
    () => purchaseOrders.filter((po) => po.vendorId === vendorId),
    [purchaseOrders, vendorId]
  );

  const associatedItems = useMemo(
    () => inventoryItems.filter((item) => item.vendorId === vendorId),
    [inventoryItems, vendorId]
  );
  const getItemName = (inventoryItemId: string) => {
    const item = inventoryItems.find((i) => i.id === inventoryItemId);
    return item?.name || "Item";
  };
  const stats = useMemo(() => {
    const totalPOs = vendorPOs.length;
    const received = vendorPOs.filter(
      (po) => po.status === "Awaiting Payment"
    ).length;
    const inDraft = vendorPOs.filter((po) => po.status === "Draft").length;
    const sent = vendorPOs.filter(
      (po) => po.status === "Pending Delivery"
    ).length;
    const totalLines = vendorPOs.reduce((acc, po) => acc + po.items.length, 0);
    const totalQty = vendorPOs.reduce(
      (acc, po) => acc + po.items.reduce((a, li) => a + li.quantity, 0),
      0
    );
    const estSpend = vendorPOs.reduce(
      (acc, po) =>
        acc + po.items.reduce((a, li) => a + li.quantity * li.cost, 0),
      0
    );
    return {
      totalPOs,
      received,
      inDraft,
      sent,
      totalLines,
      totalQty,
      estSpend,
    };
  }, [vendorPOs]);

  // Bottom sheet refs and search states
  const poSearchRef = useRef<BottomSheetMethods>(null);
  const itemSearchRef = useRef<BottomSheetMethods>(null);
  const createPOSheetRef = useRef<BottomSheetMethods>(null);
  const poBuilderSheetRef = useRef<BottomSheetMethods>(null);

  // PO Builder state
  const [poLineItems, setPoLineItems] = useState<POLineItem[]>([]);
  const [selectedTemplatePo, setSelectedTemplatePo] = useState<any>(null);
  const [isEditingItem, setIsEditingItem] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<string>("");
  const [poSearchText, setPoSearchText] = useState("");
  const [itemSearchText, setItemSearchText] = useState("");
  const [poStartDate, setPoStartDate] = useState("");
  const [poEndDate, setPoEndDate] = useState("");
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const filteredPOs = useMemo(() => {
    const q = poSearchText.trim().toLowerCase();
    const sd = poStartDate ? new Date(poStartDate + "T00:00:00") : null;
    const ed = poEndDate ? new Date(poEndDate + "T23:59:59") : null;
    return vendorPOs.filter((po) => {
      const inDates =
        (!sd || new Date(po.createdAt) >= sd) &&
        (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const poNum = po.poNumber?.toLowerCase() || "";
      const status = po.status?.toLowerCase() || "";
      const created = new Date(po.createdAt).toLocaleString().toLowerCase();
      const emp = `${po.createdByEmployeeName || ""}`.toLowerCase();
      return (
        inDates &&
        (poNum.includes(q) ||
          status.includes(q) ||
          created.includes(q) ||
          emp.includes(q))
      );
    });
  }, [poSearchText, vendorPOs, poStartDate, poEndDate]);

  const filteredItems = useMemo(() => {
    const q = itemSearchText.trim().toLowerCase();
    if (!q) return associatedItems;
    return associatedItems.filter((it) => {
      const name = it.name?.toLowerCase() || "";
      const category = it.category?.toLowerCase() || "";
      return name.includes(q) || category.includes(q);
    });
  }, [itemSearchText, associatedItems]);

  // PO Builder functions
  const openPOBuilder = (templatePo?: any) => {
    setSelectedTemplatePo(templatePo);
    if (templatePo) {
      setPoLineItems(templatePo.items);
    } else {
      setPoLineItems([]);
    }
    createPOSheetRef.current?.close();
    poBuilderSheetRef.current?.snapToIndex?.(0);
  };

  const addItemToPO = (item: any) => {
    const existingIndex = poLineItems.findIndex(
      (li) => li.inventoryItemId === item.id
    );
    if (existingIndex >= 0) {
      const updated = [...poLineItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1,
      };
      setPoLineItems(updated);
    } else {
      const newLineItem: POLineItem = {
        inventoryItemId: item.id,
        quantity: 1,
        cost: item.cost,
      };
      setPoLineItems([...poLineItems, newLineItem]);
    }
  };

  const removeItemFromPO = (inventoryItemId: string) => {
    setPoLineItems((prev) =>
      prev.filter((li) => li.inventoryItemId !== inventoryItemId)
    );
  };

  const startEditItem = (inventoryItemId: string, currentQuantity: number) => {
    setIsEditingItem(inventoryItemId);
    setEditingQuantity(currentQuantity.toString());
  };

  const saveEditItem = () => {
    if (!isEditingItem) return;
    const newQuantity = parseInt(editingQuantity) || 0;
    if (newQuantity <= 0) {
      removeItemFromPO(isEditingItem);
    } else {
      setPoLineItems((prev) =>
        prev.map((li) =>
          li.inventoryItemId === isEditingItem
            ? { ...li, quantity: newQuantity }
            : li
        )
      );
    }
    setIsEditingItem(null);
    setEditingQuantity("");
  };

  const cancelEditItem = () => {
    setIsEditingItem(null);
    setEditingQuantity("");
  };

  const createPurchaseOrder = async (status: "Draft" | "Pending Delivery") => {
    if (poLineItems.length === 0) {
      Alert.alert(
        "No Items",
        "Please add at least one item to the purchase order."
      );
      return;
    }

    try {
      const { createPurchaseOrder } = useInventoryStore.getState();
      await createPurchaseOrder({
        vendorId: vendorId!,
        status,
        items: poLineItems,
      });

      Alert.alert(
        "Success",
        `Purchase order ${
          status === "Draft" ? "saved as draft" : "submitted"
        } successfully!`
      );
      setPoLineItems([]);
      setSelectedTemplatePo(null);
      poBuilderSheetRef.current?.close();
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to create purchase order. Please try again."
      );
    }
  };

  if (!vendor) {
    return (
      <View className="flex-1 justify-center items-center bg-[#212121] px-4">
        <Text className="text-2xl font-bold text-white mb-3">
          Vendor Not Found
        </Text>
        <Text className="text-base text-gray-400 mb-6 text-center">
          This vendor does not exist or may have been removed.
        </Text>
        <TouchableOpacity
          className="bg-blue-600 px-4 py-2 rounded-lg"
          onPress={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            }
          }}
        >
          <Text className="text-white text-base font-semibold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1 bg-[#212121]">
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 12 }}>
          {/* Header */}
          <View className="bg-[#303030] border border-gray-700 rounded-2xl p-4 mb-3">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-2 flex flex-row items-center">
                <Text className="text-2xl font-bold text-white">
                  {vendor.name}
                </Text>
                {!!vendor.description && (
                  <Text className="text-gray-300 mt-1 text-lg">
                    - {vendor.description}
                  </Text>
                )}
              </View>
            </View>
            <View className="flex-row mt-3">
              <View className="mr-4">
                <Text className="text-lg font-semibold text-gray-400">
                  Contact
                </Text>
                <Text className="text-white text-base mt-0.5">
                  {vendor.contactPerson}
                </Text>
              </View>
              <View className="mr-4">
                <Text className="text-lg font-semibold text-gray-400">
                  Phone
                </Text>
                <Text className="text-white text-base mt-0.5">
                  {vendor.phone}
                </Text>
              </View>
              <View>
                <Text className="text-lg font-semibold text-gray-400">
                  Email
                </Text>
                <Text className="text-white text-base mt-0.5">
                  {vendor.email}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View className="flex-row mb-3">
            <StatCard label="Total POs" value={stats.totalPOs} />
            <StatCard label="Received" value={stats.received} />
            <StatCard label="Ordered" value={stats.sent} />
            <StatCard label="Draft" value={stats.inDraft} />
          </View>
          <View className="flex-row mb-4">
            <StatCard label="Line Items" value={stats.totalLines} />
            <StatCard label="Total Qty" value={stats.totalQty} />
            <StatCard
              label="Est. Spend"
              value={`$${stats.estSpend.toFixed(2)}`}
            />
          </View>

          {/* Tab Bar */}
          <View className="bg-[#303030] border border-gray-700 rounded-xl p-1 mb-3">
            <View className="flex-row">
              <TouchableOpacity
                onPress={() => setActiveTab("purchase-orders")}
                className={`flex-1 py-2 px-3 rounded-lg ${
                  activeTab === "purchase-orders"
                    ? "bg-blue-500"
                    : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-center font-semibold text-sm ${
                    activeTab === "purchase-orders"
                      ? "text-white"
                      : "text-gray-400"
                  }`}
                >
                  Purchase Orders
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("associated-items")}
                className={`flex-1 py-2 px-3 rounded-lg ${
                  activeTab === "associated-items"
                    ? "bg-blue-500"
                    : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-center font-semibold text-sm ${
                    activeTab === "associated-items"
                      ? "text-white"
                      : "text-gray-400"
                  }`}
                >
                  Associated Items
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab Content */}
          {activeTab === "purchase-orders" && (
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-bold text-white mb-2">
                  Purchase Orders
                </Text>
                <View className="flex-row gap-1.5 items-center justify-center">
                  <TouchableOpacity
                    className="border border-gray-700 rounded-lg p-1.5"
                    onPress={() => poSearchRef.current?.snapToIndex?.(1)}
                  >
                    <Search size={20} color={"#9CA3AF"} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-row items-center gap-1.5 justify-center w-fit bg-blue-500 rounded-lg px-3 py-1.5"
                    onPress={() => createPOSheetRef.current?.snapToIndex?.(0)}
                  >
                    <Plus size={20} color={"white"} />
                    <Text className="text-white text-sm">Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {vendorPOs.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-400 text-sm">
                    No purchase orders yet.
                  </Text>
                </View>
              ) : (
                vendorPOs.map((po) => {
                  const itemsCount = po.items.length;
                  const qty = po.items.reduce((a, li) => a + li.quantity, 0);
                  const amount = po.items.reduce(
                    (a, li) => a + li.quantity * li.cost,
                    0
                  );
                  const statusColor =
                    po.status === "Awaiting Payment"
                      ? "bg-green-600 text-green-100"
                      : po.status === "Pending Delivery"
                      ? "bg-blue-600"
                      : "bg-yellow-600";
                  return (
                    <Link
                      key={po.id}
                      href={`/inventory/purchase-orders/${po.id}`}
                      className="border border-gray-700 py-2 rounded-lg my-1"
                    >
                      <View className="flex-row justify-between items-center p-1.5">
                        <View className="flex-1 pr-2">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-white text-xl font-semibold">
                              {po.poNumber}
                            </Text>
                            <View
                              className={`px-1.5 py-0.5 rounded-full ${statusColor}`}
                            >
                              <Text className="text-[9px] font-bold text-white">
                                {po.status}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-gray-400 mt-0.5 text-base">
                            {new Date(po.createdAt).toLocaleString()}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-white font-semibold text-xl">
                            ${amount.toFixed(2)}
                          </Text>
                          <Text className="text-gray-400 text-base mt-0.5">
                            {itemsCount} lines • {qty} qty
                          </Text>
                        </View>
                      </View>
                    </Link>
                  );
                })
              )}
            </View>
          )}

          {activeTab === "associated-items" && (
            <View className="bg-[#303030] border border-gray-700 rounded-xl p-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-bold text-white mb-2">
                  Associated Items
                </Text>
                <View className="flex-row gap-1.5 items-center justify-center">
                  <TouchableOpacity
                    className="border border-gray-700 rounded-lg p-1.5"
                    onPress={() => itemSearchRef.current?.snapToIndex?.(0)}
                  >
                    <Search size={20} color={"#9CA3AF"} />
                  </TouchableOpacity>
                </View>
              </View>
              {associatedItems.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-400 text-sm">
                    No items linked yet.
                  </Text>
                </View>
              ) : (
                associatedItems.map((item) => {
                  const isLowStock =
                    item.stockQuantity <= item.reorderThreshold;
                  return (
                    <Link
                      key={item.id}
                      href={`/inventory/ingredient-items/${item.id}`}
                      className="border border-gray-700 py-2 rounded-lg my-0.5"
                    >
                      <View className="flex-row justify-between items-center px-3">
                        <View className="flex-1 pr-2">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-white font-semibold text-sm">
                              {item.name}
                            </Text>
                            <View
                              className={`px-1.5 py-0.5 rounded-full ${
                                isLowStock
                                  ? "bg-red-600 text-red-100"
                                  : "bg-green-600 text-green-100"
                              }`}
                            >
                              <Text className="text-[9px] font-bold">
                                {isLowStock ? "Low" : "In Stock"}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-gray-400 mt-0.5 text-xs">
                            {item.category} • {item.stockQuantity} {item.unit} •
                            Reorder at {item.reorderThreshold}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-white font-semibold text-sm">
                            ${item.cost.toFixed(2)}
                          </Text>
                          <Text className="text-gray-400 text-[10px] mt-0.5">
                            per {item.unit}
                          </Text>
                        </View>
                      </View>
                    </Link>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </View>
      {/* Purchase Orders Search Bottom Sheet */}
      <BottomSheet
        ref={poSearchRef as any}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View className="flex-row items-center rounded-2xl px-4">
          <View className="flex-row items-center flex-1 border rounded-lg p-1.5 border-gray-700">
            <Search color="#6b7280" size={20} />
            <BottomSheetTextInput
              value={poSearchText}
              onChangeText={setPoSearchText}
              placeholder="Search POs"
              className="flex-1 py-3 ml-2 text-xl text-gray-900"
              placeholderTextColor="#6b7280"
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setPoSearchText("");
              poSearchRef.current?.close();
            }}
            className="flex-row items-center ml-2 p-1.5"
          >
            <Text className="ml-1 text-lg font-semibold text-gray-400">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        <View className="px-4 py-2">
          <Text className="text-white mb-1.5 text-sm">Date Range</Text>
          <DateRangePicker
            startDate={poStartDate}
            endDate={poEndDate}
            onDateRangeChange={(start, end) => {
              setPoStartDate(start);
              setPoEndDate(end);
            }}
            placeholder="Select date range"
          />
        </View>

        <BottomSheetFlatList
          data={filteredPOs}
          keyExtractor={(po) => po.id}
          renderItem={({ item: po }) => (
            <Link
              href={`/inventory/purchase-orders/${po.id}`}
              className="px-4 py-3 border-b border-gray-700"
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-1 pr-2">
                  <Text className="text-white text-lg font-semibold">
                    {po.poNumber}
                  </Text>
                  <Text className="text-gray-300 mt-0.5 text-base">
                    {po.status} • {new Date(po.createdAt).toLocaleDateString()}
                  </Text>
                  {po.createdByEmployeeName ? (
                    <Text className="text-gray-400 mt-0.5 text-sm">
                      By: {po.createdByEmployeeName}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-white font-semibold text-base">
                  $
                  {po.items
                    .reduce((a, li) => a + li.quantity * li.cost, 0)
                    .toFixed(2)}
                </Text>
              </View>
            </Link>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center h-40">
              <Text className="text-xl text-gray-400">
                No purchase orders found
              </Text>
            </View>
          }
        />
      </BottomSheet>

      {/* Associated Items Search Bottom Sheet */}
      <BottomSheet
        ref={itemSearchRef as any}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View className="flex-row items-center rounded-2xl px-4">
          <View className="flex-row items-center flex-1 border rounded-lg p-1.5 border-gray-700">
            <Search color="#6b7280" size={20} />
            <BottomSheetTextInput
              value={itemSearchText}
              onChangeText={setItemSearchText}
              placeholder="Search Items"
              className="flex-1 py-3 ml-2 text-xl text-gray-900"
              placeholderTextColor="#6b7280"
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setItemSearchText("");
              itemSearchRef.current?.close();
            }}
            className="flex-row items-center ml-2 p-1.5"
          >
            <Text className="ml-1 text-lg font-semibold text-gray-400">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
        <BottomSheetFlatList
          data={filteredItems}
          keyExtractor={(it) => it.id}
          renderItem={({ item: it }) => (
            <Link
              href={`/inventory/ingredient-items/${it.id}`}
              className="px-4 py-3 border-b border-gray-700"
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-1 pr-2">
                  <Text className="text-white text-lg font-semibold">
                    {it.name}
                  </Text>
                  <Text className="text-gray-300 mt-0.5 text-base">
                    {it.category} • {it.stockQuantity} {it.unit}
                  </Text>
                </View>
                <Text className="text-white font-semibold text-base">
                  ${it.cost.toFixed(2)}
                </Text>
              </View>
            </Link>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center h-40">
              <Text className="text-xl text-gray-400">No items found</Text>
            </View>
          }
          enableFooterMarginAdjustment={true}
        />
      </BottomSheet>

      {/* Create Purchase Bottom Sheet (vendor preselected + templates) */}
      <BottomSheet
        ref={createPOSheetRef as any}
        index={-1}
        snapPoints={["60%", "90%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View className="px-4 py-3 border-b border-gray-700">
          <Text className="text-white text-xl font-bold">Create Purchase</Text>
          <Text className="text-gray-300 mt-0.5 text-sm">
            Vendor:
            <Text className="text-white font-semibold">{vendor?.name}</Text>
          </Text>
        </View>
        <View className="px-4 py-3 gap-2">
          <TouchableOpacity
            className="bg-blue-600 border border-blue-500 rounded-lg px-3 py-2 items-center"
            onPress={() => openPOBuilder()}
          >
            <Text className="text-white text-base font-semibold">
              Start New Purchase
            </Text>
          </TouchableOpacity>

          <View className="mt-1.5">
            <View className="flex-row justify-between items-center mb-1.5">
              <Text className="text-white text-lg font-semibold">
                Use Past Order as Template
              </Text>
              <Text className="text-gray-400 text-sm">
                {vendorPOs.length} available
              </Text>
            </View>
            <BottomSheetFlatList
              data={vendorPOs}
              keyExtractor={(po) => po.id}
              renderItem={({ item: po }) => (
                <View className="border border-gray-700 rounded-lg mb-2 p-2">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-2">
                      <Text className="text-white text-base font-semibold">
                        {po.poNumber}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        {po.status} •
                        {new Date(po.createdAt).toLocaleDateString()}
                      </Text>
                      <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                        {po.items.map((li, idx) => (
                          <View
                            key={`${po.id}_${idx}`}
                            className="px-1.5 py-0.5 rounded-full bg-[#2a2a2a] border border-gray-700"
                          >
                            <Text className="text-[10px] text-gray-200">
                              {getItemName(li.inventoryItemId)} x{li.quantity}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        Lines: {po.items.length}
                      </Text>
                    </View>
                    <TouchableOpacity
                      className="bg-[#3b82f6] px-2 py-1.5 rounded-lg"
                      onPress={() => openPOBuilder(po)}
                    >
                      <Text className="text-white font-semibold text-sm">
                        Use
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View className="items-center justify-center py-4">
                  <Text className="text-gray-400 text-sm">
                    No past orders for this vendor.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </BottomSheet>

      {/* PO Builder BottomSheet */}
      <BottomSheet
        ref={poBuilderSheetRef as any}
        index={-1}
        snapPoints={["70%", "95%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View className="px-4 py-3 border-b border-gray-700 w-full">
          <View className="flex flex-row gap-2 justify-between">
            <View className="flex flex-col gap-1">
              <Text className="text-white text-xl font-bold">Build PO</Text>
              <Text className="text-gray-300 text-sm">
                Vendor:
                <Text className="text-white font-semibold">{vendor?.name}</Text>
              </Text>
              {selectedTemplatePo && (
                <Text className="text-blue-300 text-sm">
                  Template: {selectedTemplatePo.poNumber}
                </Text>
              )}
            </View>
            <View className="flex-row gap-2 mb-4 w-1/2">
              <TouchableOpacity
                onPress={() => createPurchaseOrder("Draft")}
                className="flex-1 bg-gray-600 justify-center border border-gray-500 rounded-lg px-3 py-2 items-center"
              >
                <Text className="text-white text-base font-semibold">
                  Save Draft
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => createPurchaseOrder("Pending Delivery")}
                className="flex-1 bg-blue-600 border justify-center border-blue-500 rounded-lg px-3 py-2 items-center"
              >
                <Text className="text-white text-base font-semibold">
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView className="flex-1 px-4 py-3">
          <View className="mb-4">
            <Text className="text-white text-lg font-semibold mb-2">
              Items ({poLineItems.length})
            </Text>
            {poLineItems.length === 0 ? (
              <View className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-4 items-center">
                <Text className="text-gray-400 text-sm">
                  No items added yet
                </Text>
              </View>
            ) : (
              <View className="gap-1">
                {poLineItems.map((lineItem) => {
                  const item = inventoryItems.find(
                    (i) => i.id === lineItem.inventoryItemId
                  );
                  const isEditing = isEditingItem === lineItem.inventoryItemId;
                  return (
                    <View
                      key={lineItem.inventoryItemId}
                      className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-3"
                    >
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1 pr-2">
                          <Text className="text-white text-base font-semibold">
                            {item?.name || "Unknown"}
                          </Text>
                          <Text className="text-gray-400 text-xs">
                            ${lineItem.cost.toFixed(2)} per {item?.unit}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          {isEditing ? (
                            <>
                              <TextInput
                                value={editingQuantity}
                                onChangeText={setEditingQuantity}
                                keyboardType="number-pad"
                                className="bg-[#1a1a1a] border border-gray-600 rounded px-2 py-1 text-white text-center w-14 text-sm"
                              />
                              <TouchableOpacity
                                onPress={saveEditItem}
                                className="bg-green-600 px-2 py-1 rounded"
                              >
                                <Text className="text-white text-xs">Save</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={cancelEditItem}
                                className="bg-gray-600 px-2 py-1 rounded"
                              >
                                <Text className="text-white text-xs">
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <Text className="text-white text-base">
                                Qty: {lineItem.quantity}
                              </Text>
                              <TouchableOpacity
                                onPress={() =>
                                  startEditItem(
                                    lineItem.inventoryItemId,
                                    lineItem.quantity
                                  )
                                }
                                className="p-1.5"
                              >
                                <Edit3 size={14} color="#9CA3AF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  removeItemFromPO(lineItem.inventoryItemId)
                                }
                                className="p-1.5"
                              >
                                <Trash2 size={14} color="#EF4444" />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                      <Text className="text-white text-right mt-1.5 text-sm">
                        Total: ${(lineItem.quantity * lineItem.cost).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-white text-lg font-semibold mb-2">
              Add Items
            </Text>
            <View className="flex-row items-center gap-1.5 mb-2">
              <Search color="#9CA3AF" size={16} />
              <TextInput
                value={itemSearchText}
                onChangeText={setItemSearchText}
                placeholder="Search items..."
                className="flex-1 bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <BottomSheetFlatList
              data={filteredItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => addItemToPO(item)}
                  className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-2 mb-1.5"
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-2">
                      <Text className="text-white text-base font-semibold">
                        {item.name}
                      </Text>
                      <Text className="text-gray-400 text-xs">
                        {item.category} • ${item.cost.toFixed(2)} per
                        {item.unit}
                      </Text>
                    </View>
                    <View className="bg-blue-600 px-2 py-1 rounded">
                      <Text className="text-white text-xs">Add</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className="items-center justify-center py-4">
                  <Text className="text-gray-400 text-sm">No items found</Text>
                </View>
              }
            />
          </View>
        </ScrollView>
      </BottomSheet>
    </>
  );
};

export default VendorDetailsScreen;
