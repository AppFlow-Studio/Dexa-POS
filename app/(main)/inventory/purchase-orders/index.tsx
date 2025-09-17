import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PurchaseOrder } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useRouter } from "expo-router";
import { Edit, MoreHorizontal, Plus, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const PurchaseOrderRow: React.FC<{
  item: PurchaseOrder;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  const router = useRouter();
  const vendors = useInventoryStore((state) => state.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);
  const totalItems = item.items.reduce(
    (acc, current) => acc + current.quantity,
    0
  );
  const totalCost = item.items.reduce(
    (acc, current) => acc + current.cost * current.quantity,
    0
  );

  const statusColors = {
    Draft: "bg-gray-700 text-gray-200",
    Sent: "bg-blue-600 text-white",
    Received: "bg-green-600 text-white",
    Cancelled: "bg-red-600 text-white",
  };

  return (
    <View className="flex-row items-center p-6 border-b border-gray-700">
      <Text className="w-[15%] text-2xl font-semibold text-white">
        {item.poNumber}
      </Text>
      <Text className="w-[20%] text-2xl text-gray-300">
        {vendor?.name || "Unknown"}
      </Text>
      <View className="w-[15%]">
        <View
          className={`px-4 py-2 rounded-full self-start ${statusColors[item.status]}`}
        >
          <Text className={`font-bold text-xl ${statusColors[item.status]}`}>
            {item.status}
          </Text>
        </View>
      </View>
      <Text className="w-[15%] text-2xl text-gray-300">
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
      <Text className="w-[10%] text-2xl text-gray-300">{totalItems}</Text>
      <Text className="w-[15%] text-2xl font-semibold text-white">
        ${totalCost.toFixed(2)}
      </Text>
      <View className="w-[10%] items-end">
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
      </View>
    </View>
  );
};

const PurchaseOrdersScreen = () => {
  const { purchaseOrders, deletePurchaseOrder } = useInventoryStore();
  const router = useRouter();

  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);

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
    "Total Items",
    "Total Cost",
    "",
  ];

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-3xl font-bold text-white">Purchase Orders</Text>
        <TouchableOpacity
          onPress={() => router.push("/inventory/purchase-orders/create")}
          className="py-4 px-6 bg-blue-600 rounded-lg flex-row items-center"
        >
          <Plus color="white" size={24} className="mr-2" />
          <Text className="text-2xl font-bold text-white">Create PO</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
        <View className="flex-row p-6 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header}
              className={`font-bold text-xl text-gray-400 ${
                header === "PO Number"
                  ? "w-[15%]"
                  : header === "Vendor"
                    ? "w-[20%]"
                    : header === "Status"
                      ? "w-[15%]"
                      : header === "Date Created"
                        ? "w-[15%]"
                        : header === "Total Items"
                          ? "w-[10%]"
                          : header === "Total Cost"
                            ? "w-[15%]"
                            : "w-[10%]"
              }`}
            >
              {header}
            </Text>
          ))}
        </View>
        <FlatList
          data={purchaseOrders}
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
