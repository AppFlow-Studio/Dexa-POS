import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { PurchaseOrder } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Link, useRouter } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";

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

  const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
    "Draft": { bg: "bg-gray-700", text: "text-gray-200", label: "Draft" },
    "Pending Delivery": { bg: "bg-yellow-600", text: "text-yellow-100", label: "Pending Delivery" },
    "Awaiting Payment": { bg: "bg-blue-600", text: "text-blue-100", label: "Awaiting Payment" },
    "Paid": { bg: "bg-green-600", text: "text-green-100", label: "Paid" },
    "Cancelled": { bg: "bg-red-600", text: "text-red-100", label: "Cancelled" },
  };

  return (
    <Link href={`/inventory/purchase-orders/${item.id}`} className="flex-row w-full flex-1 flex items-center p-6 border-b border-gray-700">
      <View className="flex-row w-full flex-1 flex items-center">
        <Text className="w-[15%] text-2xl font-semibold text-white">
          {item.poNumber}
        </Text>
        <Text className="w-[20%] text-2xl text-gray-300">
          {vendor?.name || "Unknown"}
        </Text>
        <View className="w-[15%]">
          {(() => {
            const sty = statusStyles[item.status] || statusStyles["Draft"];
            return (
              <View className={`px-4 py-2 rounded-full self-start ${sty.bg}`}>
                <Text className={`font-bold text-xl ${sty.text}`}>{sty.label}</Text>
              </View>
            );
          })()}
        </View>
        <Text className="w-[15%] text-2xl text-gray-300">{new Date(item.createdAt).toLocaleDateString()}</Text>
        <Text className="w-[15%] text-2xl text-gray-300" numberOfLines={1}>
          {item.createdByEmployeeName || "—"}
        </Text>
        <Text className="w-[10%] text-2xl text-gray-300">{totalItems}</Text>
        <Text className="w-[15%] text-2xl font-semibold text-white">
          ${totalCost.toFixed(2)}
        </Text>
      </View>

      {/* <View className="w-[5%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
            <DropdownMenuItem
              onPress={() =>
                router.push(`/inventory/purchase-orders/${item.id}`)
              }
            >
              <Text className="text-xl text-white">View Details</Text>
            </DropdownMenuItem>
            {item.status === "Draft" && (
              <>
                <DropdownMenuItem onPress={onEdit}>
                  <Edit className="mr-2 h-6 w-6" color="#9CA3AF" />
                  <Text className="text-xl text-white">Edit PO</Text>
                </DropdownMenuItem>
                <DropdownMenuItem onPress={onDelete}>
                  <Trash2
                    className="mr-2 h-6 w-6 text-red-400"
                    color="#F87171"
                  />
                  <Text className="text-xl text-red-400">Delete PO</Text>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </View> */}
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
    inventoryItems
  } = useInventoryStore();
  const { employees, activeEmployeeId, loadMockEmployees } = useEmployeeStore();
  const router = useRouter();

  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<"purchase-orders" | "expenses">("purchase-orders");

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
      const inDates = (!sd || new Date(po.createdAt) >= sd) && (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const poNum = po.poNumber?.toLowerCase() || "";
      const vendorName = useInventoryStore.getState().vendors.find(v => v.id === po.vendorId)?.name?.toLowerCase() || "";
      const emp = `${po.createdByEmployeeName || ""}`.toLowerCase();
      const status = po.status.toLowerCase();
      return inDates && (poNum.includes(q) || vendorName.includes(q) || emp.includes(q) || status.includes(q));
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
    <View className="flex-1">
      {/* Header with Tab Bar */}
      <View className="mb-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-3xl font-bold text-white">
            {activeTab === "purchase-orders" ? "Purchase Orders" : "External Expenses"}
          </Text>
          {activeTab === "purchase-orders" ? (
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create")}
              className="py-4 px-6 bg-blue-600 rounded-lg flex-row items-center"
            >
              <Plus color="white" size={24} className="mr-2" />
              <Text className="text-2xl font-bold text-white">Create PO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create-expense")}
              className="py-4 px-6 bg-blue-600 rounded-lg flex-row items-center"
            >
              <Plus color="white" size={24} className="mr-2" />
              <Text className="text-2xl font-bold text-white">Add Expense</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Bar */}
        <View className="flex-row bg-[#303030] border border-gray-700 rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setActiveTab("purchase-orders")}
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "purchase-orders" ? "bg-blue-600" : "bg-transparent"
              }`}
          >
            <Text className={`text-lg font-semibold ${activeTab === "purchase-orders" ? "text-white" : "text-gray-400"
              }`}>
              Purchase Orders
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("expenses")}
            className={`flex-1 py-3 rounded-lg items-center ${activeTab === "expenses" ? "bg-blue-600" : "bg-transparent"
              }`}
          >
            <Text className={`text-lg font-semibold ${activeTab === "expenses" ? "text-white" : "text-gray-400"
              }`}>
              External Expenses
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Purchase Orders Tab Content */}
      {activeTab === "purchase-orders" && (
        <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
          <View className="p-4 border-b border-gray-700">
            <View className="gap-3 flex-row w-full  justify-between">
              <View className="w-[70%]">
                <Text className="text-gray-300 mb-1">Search (PO, Vendor, Employee, Status)</Text>
                <TextInput value={query} onChangeText={setQuery} placeholder="e.g., PO-2025, Alice, Draft" placeholderTextColor="#9CA3AF" className="bg-[#212121] h-16 border border-gray-700 rounded-lg px-3 py-3 text-white" />
              </View>
              <View className="w-[30%] " >
                <Text className="text-gray-300 mb-1">Date Range</Text>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  className="w-full h-16"
                  placeholder="Select date range for POs"
                />
              </View>
            </View>
          </View>
          <View className="flex-row p-6 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
            {TABLE_HEADERS.map((header) => (
              <Text
                key={header}
                className={`font-bold text-xl text-gray-400 ${header === "PO Number"
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
              <View className="p-8 items-center">
                <Text className="text-xl text-gray-400">
                  No purchase orders created yet.
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
            <View className="p-6">
              {/* <View className="bg-[#212121] border border-gray-600 rounded-lg p-4 mt-4">
                <View className="flex-row justify-between items-center">
                  <Text className="text-white font-bold text-lg">Total External Expenses</Text>
                  <Text className="text-green-400 font-bold text-xl">
                    ${externalExpenses.reduce((sum, expense) => sum + expense.totalAmount, 0).toFixed(2)}
                  </Text>
                </View>
              </View> */}
              <FlatList
                data={externalExpenses}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View className="bg-[#212121] border border-gray-600 rounded-lg p-4 mb-3">
                    <View className="flex-row justify-between items-start mb-3">
                      <View className="flex-1">
                        <Text className="text-white font-semibold text-lg">
                          {item.expenseNumber} - Items ({item.items.length})
                        </Text>
                        <Text className="text-gray-400 text-lg">
                          Purchased by {item.purchasedByEmployeeName}
                        </Text>
                        <Text className="text-gray-400 text-lg">
                          {new Date(item.purchasedAt).toLocaleString()}
                        </Text>
                        {item.storeName && (
                          <Text className="text-gray-400 text-lg">
                            Store: {item.storeName}
                          </Text>
                        )}
                        {item.relatedPONumber && (
                          <Text className="text-blue-400 text-lg">
                            Related to PO: {item.relatedPONumber}
                          </Text>
                        )}
                      </View>
                      <View className="items-end">
                        <Text className="text-green-400 font-bold text-lg">
                          ${item.totalAmount.toFixed(2)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveExternalExpense(item.id)}
                          className="mt-2 p-1"
                        >
                          <Trash2 color="#EF4444" size={16} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Items List */}
                    <View className="mb-3">
                      {item.items.map((lineItem, index) => (
                        <View key={index} className="flex-row justify-between items-center py-1 border-b border-gray-700 last:border-b-0">
                          <View className="flex-1">
                            <Text className="text-white text-lg">
                              {lineItem.itemName} x{lineItem.quantity}
                            </Text>
                            <Text className="text-gray-400 text-md">
                              ${lineItem.unitPrice.toFixed(2)} each
                            </Text>
                            {lineItem.notes && (
                              <Text className="text-gray-500 text-md">
                                {lineItem.notes}
                              </Text>
                            )}
                          </View>
                          <Text className="text-green-400 font-semibold text-lg">
                            ${lineItem.totalAmount.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {item.notes && (
                      <Text className="text-gray-300 text-sm">
                        Notes: {item.notes}
                      </Text>
                    )}
                  </View>
                )}
                ListEmptyComponent={
                  <View className="p-8 items-center">
                    <Text className="text-xl text-gray-400">
                      No external expenses recorded yet.
                    </Text>
                  </View>
                }
              />
            </View>
          ) : (
            <View className="p-8 items-center">
              <Text className="text-gray-400 text-lg">No external expenses recorded</Text>
              <Text className="text-gray-500 text-sm mt-1">
                Add expenses for items purchased from alternative sources
              </Text>
            </View>
          )}


        </View>
      )}


      <ConfirmationModal
        isOpen={!!poToDelete}
        onClose={() => setPoToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Purchase Order"
        description={`Are you sure you want to delete PO "${poToDelete?.poNumber}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />

    </View>
  );
};

export default PurchaseOrdersScreen;
