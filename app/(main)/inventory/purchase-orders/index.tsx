import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { PurchaseOrder } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Link, useRouter } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PurchaseOrderRow: React.FC<{
  item: PurchaseOrder;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  const router = useRouter();
  const vendors = useInventoryStore((state) => state.vendors);
  const { employees } = useEmployeeStore();
  const vendor = vendors.find((v) => v.id === item.vendorId);
  const totalItems = item.items.reduce(
    (acc, current) => acc + current.quantity,
    0
  );
  const totalCost = item.items.reduce(
    (acc, current) => acc + current.cost * current.quantity,
    0
  );

  const statusStyles: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    Draft: { bg: "bg-gray-700", text: "text-gray-200", label: "Draft" },
    "Pending Delivery": {
      bg: "bg-yellow-600",
      text: "text-yellow-100",
      label: "Pending Delivery",
    },
    "Awaiting Payment": {
      bg: "bg-blue-600",
      text: "text-blue-100",
      label: "Awaiting Payment",
    },
    Paid: { bg: "bg-green-600", text: "text-green-100", label: "Paid" },
    Cancelled: { bg: "bg-red-600", text: "text-red-100", label: "Cancelled" },
  };

  return (
    <Link
      href={`/inventory/purchase-orders/${item.id}`}
      className="flex-row w-full flex-1 flex items-center p-3 border-b border-gray-700"
    >
      <View className="flex-row w-full flex-1 flex items-center">
        <Text className="w-[15%] text-lg font-semibold text-white">
          {item.poNumber}
        </Text>
        <Text className="w-[20%] text-lg text-gray-300">
          {vendor?.name || "Unknown"}
        </Text>
        <View className="w-[15%]">
          {(() => {
            const sty = statusStyles[item.status] || statusStyles["Draft"];
            return (
              <View className={`px-2.5 py-1 rounded-full self-start ${sty.bg}`}>
                <Text className={`font-bold text-base ${sty.text}`}>
                  {sty.label}
                </Text>
              </View>
            );
          })()}
        </View>
        <Text className="w-[15%] text-lg text-gray-300">
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <Text className="w-[15%] text-lg text-gray-300" numberOfLines={1}>
          {item.createdByEmployeeName || "—"}
        </Text>
        <Text className="w-[10%] text-lg text-gray-300">{totalItems}</Text>
        <Text className="w-[15%] text-lg font-semibold text-white">
          ${totalCost.toFixed(2)}
        </Text>
      </View>
    </Link>
  );
};

const PurchaseOrdersScreen = () => {
  const {
    purchaseOrders,
    deletePurchaseOrder,
    externalExpenses,
    addExternalExpense,
    removeExternalExpense,
    inventoryItems,
  } = useInventoryStore();
  const { employees, activeEmployeeId, loadMockEmployees } = useEmployeeStore();
  const router = useRouter();

  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<"purchase-orders" | "expenses">(
    "purchase-orders"
  );

  // Bottom sheet refs
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  // Load employees on component mount
  useEffect(() => {
    loadMockEmployees();
  }, [loadMockEmployees]);

  const handleRemoveExternalExpense = (expenseId: string) => {
    removeExternalExpense(expenseId);
    toast.success("External expense removed", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sd = startDate ? new Date(startDate + "T00:00:00") : null;
    const ed = endDate ? new Date(endDate + "T23:59:59") : null;
    return purchaseOrders.filter((po) => {
      const inDates =
        (!sd || new Date(po.createdAt) >= sd) &&
        (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const poNum = po.poNumber?.toLowerCase() || "";
      const vendorName =
        useInventoryStore
          .getState()
          .vendors.find((v) => v.id === po.vendorId)
          ?.name?.toLowerCase() || "";
      const emp = `${po.createdByEmployeeName || ""}`.toLowerCase();
      const status = po.status.toLowerCase();
      return (
        inDates &&
        (poNum.includes(q) ||
          vendorName.includes(q) ||
          emp.includes(q) ||
          status.includes(q))
      );
    });
  }, [purchaseOrders, query, startDate, endDate]);

  const handleOpenDeleteConfirm = (po: PurchaseOrder) => {
    setPoToDelete(po);
  };

  const handleConfirmDelete = () => {
    if (poToDelete) {
      deletePurchaseOrder(poToDelete.id);
    }
    setPoToDelete(null);
  };

  const TABLE_HEADERS = [
    "PO Number",
    "Vendor",
    "Status",
    "Date Created",
    "Employee",
    "Total Items",
    "Total Cost",
    "",
  ];

  return (
    <ScrollView bounces={false} className="flex-1 flex-grow">
      {/* Header with Tab Bar */}
      <View className="mb-3">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-2xl font-bold text-white">
            {activeTab === "purchase-orders"
              ? "Purchase Orders"
              : "External Expenses"}
          </Text>
          {activeTab === "purchase-orders" ? (
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create")}
              className="py-3 px-4 bg-blue-600 rounded-lg flex-row items-center"
            >
              <Plus color="white" size={20} className="mr-1.5" />
              <Text className="text-xl font-bold text-white">Create PO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() =>
                router.push("/inventory/purchase-orders/create-expense")
              }
              className="py-3 px-4 bg-blue-600 rounded-lg flex-row items-center"
            >
              <Plus color="white" size={20} className="mr-1.5" />
              <Text className="text-xl font-bold text-white">Add Expense</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row bg-[#303030] border border-gray-700 rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setActiveTab("purchase-orders")}
            className={`flex-1 py-2 rounded-lg items-center ${
              activeTab === "purchase-orders" ? "bg-blue-600" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-base font-semibold ${
                activeTab === "purchase-orders" ? "text-white" : "text-gray-400"
              }`}
            >
              Purchase Orders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("expenses")}
            className={`flex-1 py-2 rounded-lg items-center ${
              activeTab === "expenses" ? "bg-blue-600" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-base font-semibold ${
                activeTab === "expenses" ? "text-white" : "text-gray-400"
              }`}
            >
              External Expenses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Purchase Orders Tab Content */}
      {activeTab === "purchase-orders" && (
        <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
          <View className="p-3 border-b border-gray-700">
            <View className="gap-2 flex-row w-full justify-between">
              <View className="flex-1">
                <Text className="text-gray-300 mb-1 text-sm">Search</Text>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="e.g., PO-2025, Alice..."
                  className="bg-[#212121] h-14 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm"
                />
              </View>
              <View className="flex-1">
                <Text className="text-gray-300 mb-1 text-sm">Date Range</Text>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  className="w-full h-14"
                  placeholder="Select date range"
                />
              </View>
            </View>
          </View>
          <View className="flex-row p-4 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
            {TABLE_HEADERS.map((header) => (
              <Text
                key={header}
                className={`font-bold text-lg text-gray-400 ${
                  header === "PO Number"
                    ? "w-[15%]"
                    : header === "Vendor"
                    ? "w-[20%]"
                    : header === "Status"
                    ? "w-[15%]"
                    : header === "Date Created"
                    ? "w-[15%]"
                    : header === "Total Items"
                    ? "w-[11%]"
                    : header === "Total Cost"
                    ? "w-[15%]"
                    : "w-[13%]"
                }`}
              >
                {header}
              </Text>
            ))}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PurchaseOrderRow
                item={item}
                onEdit={() =>
                  router.push(`/inventory/purchase-orders/edit/${item.id}`)
                }
                onDelete={() => handleOpenDeleteConfirm(item)}
              />
            )}
            ListEmptyComponent={
              <View className="p-6 items-center">
                <Text className="text-lg text-gray-400">
                  No purchase orders found.
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* External Expenses Tab Content */}
      {activeTab === "expenses" && (
        <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
          {externalExpenses.length > 0 ? (
            <View className="p-4">
              <FlatList
                data={externalExpenses}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View className="bg-[#212121] border border-gray-600 rounded-lg p-3 mb-2">
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="flex-1">
                        <Text className="text-white font-semibold text-base">
                          {item.expenseNumber} - Items ({item.items.length})
                        </Text>
                        <Text className="text-gray-400 text-base">
                          By {item.purchasedByEmployeeName}
                        </Text>
                        <Text className="text-gray-400 text-sm">
                          {new Date(item.purchasedAt).toLocaleString()}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-green-400 font-bold text-base">
                          ${item.totalAmount.toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveExternalExpense(item.id)}
                          className="mt-1.5 p-1"
                        >
                          <Trash2 color="#EF4444" size={14} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View className="mb-2">
                      {item.items.map((lineItem, index) => (
                        <View
                          key={index}
                          className="flex-row justify-between items-center py-1 border-b border-gray-700 last:border-b-0"
                        >
                          <View className="flex-1">
                            <Text className="text-white text-base">
                              {lineItem.itemName} x{lineItem.quantity}
                            </Text>
                            <Text className="text-gray-400 text-sm">
                              ${lineItem.unitPrice.toFixed(2)} each
                            </Text>
                          </View>
                          <Text className="text-green-400 font-semibold text-base">
                            ${lineItem.totalAmount.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {item.notes && (
                      <Text className="text-gray-300 text-xs">
                        Notes: {item.notes}
                      </Text>
                    )}
                  </View>
                )}
                ListEmptyComponent={
                  <View className="p-6 items-center">
                    <Text className="text-lg text-gray-400">
                      No external expenses recorded.
                    </Text>
                  </View>
                }
              />
            </View>
          ) : (
            <View className="p-6 items-center">
              <Text className="text-gray-400 text-base">
                No external expenses recorded
              </Text>
              <Text className="text-gray-500 text-xs mt-1">
                Add expenses for items from other sources
              </Text>
            </View>
          )}
        </View>
      )}

      <ConfirmationModal
        isOpen={!!poToDelete}
        onClose={() => setPoToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete PO"
        description={`Delete "${poToDelete?.poNumber}"?`}
        confirmText="Delete"
        variant="destructive"
      />
    </ScrollView>
  );
};

export default PurchaseOrdersScreen;
