import VendorFormModal from "@/components/inventory/VendorFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Vendor } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { Link } from "expo-router";
import {
  Edit,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const VendorRow: React.FC<{
  item: Vendor;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  return (
   <Link href={`/inventory/vendors/${item.id}`} asChild>
      <TouchableOpacity className="flex-row w-full flex items-center p-6 border-b border-gray-700">
        <Text className="w-[20%] text-2xl font-semibold text-white">
          {item.name}
        </Text>
        <Text className="w-[15%] text-2xl text-gray-300">
          {item.contactPerson}
        </Text>
        <Text className="w-[30%] text-2xl text-gray-300">{item.email}</Text>
        <Text className="w-[20%] text-2xl text-gray-300">{item.phone}</Text>
        <View className="w-[10%] items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-2">
                <MoreHorizontal size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
              <DropdownMenuItem onPress={onEdit}>
                <Edit className="mr-2 h-6 w-6" color="#9CA3AF" />
                <Text className="text-xl text-white">Edit Vendor</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 className="mr-2 h-6 w-6 text-red-400" color="#F87171" />
                <Text className="text-xl text-red-400">Delete Vendor</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </TouchableOpacity>
   </Link>
  );
};

const VendorScreen = () => {
  const { vendors, addVendor, updateVendor, deleteVendor } =
    useInventoryStore();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleOpenAddModal = () => {
    setSelectedVendor(null);
    setModalMode("add");
  };

  const handleOpenEditModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setModalMode("edit");
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedVendor(null);
  };

  const handleSaveVendor = (data: Omit<Vendor, "id">, id?: string) => {
    if (id) {
      updateVendor(id, data);
    } else {
      addVendor(data);
    }
  };

  const handleOpenDeleteConfirm = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedVendor) {
      deleteVendor(selectedVendor.id);
    }
    setDeleteConfirmOpen(false);
    setSelectedVendor(null);
  };

  const TABLE_HEADERS = ["Vendor Name", "Contact Person", "Email", "Phone", ""];

  return (
    <View className="flex-1">

      <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
        <View className="flex-row py-3 px-3 bg-gray-800/50 rounded-t-xl border-b items-center border-gray-700">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header}
              className={`font-bold text-xl text-gray-400 ${header === "Vendor Name" ? "w-[20%]" : header === "Contact Person" ? "w-[15%]" : header === "Email" ? "w-[30%]" : header === "Phone" ? "w-[15%]" : "w-[0%]"}`}
            >
              {header}
            </Text>
          ))}
          <View className="flex-row items-center flex-1 justify-end gap-x-6">
            <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg p-4 ">
              <Search color="#9CA3AF" size={20} />
              {/* <TextInput
                placeholder="Search by item name..."
                placeholderTextColor="#9CA3AF"
                className="ml-3 text-2xl text-white flex-1"
              /> */}
            </View>
            <TouchableOpacity
              onPress={handleOpenAddModal}
              className="py-4 px-6 w-1/3 bg-blue-600 rounded-lg flex-row items-center justify-center"
            >
              <Plus color="white" size={20} className="mr-2" />
              {/* <Text className="text-2xl font-bold text-white">Add New Item</Text> */}
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          data={vendors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VendorRow
              item={item}
              onEdit={() => handleOpenEditModal(item)}
              onDelete={() => handleOpenDeleteConfirm(item)}
            />
          )}
        />
      </View>

      <VendorFormModal
        isOpen={modalMode === "add" || modalMode === "edit"}
        onClose={handleCloseModal}
        onSave={handleSaveVendor}
        initialData={selectedVendor}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Vendor"
        description={`Are you sure you want to permanently delete "${selectedVendor?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default VendorScreen;
