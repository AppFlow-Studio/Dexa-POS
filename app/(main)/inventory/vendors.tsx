import VendorFormModal from "@/components/inventory/VendorFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Vendor } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { Link, useRouter } from "expo-router";
import {
  Edit,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const VendorRow: React.FC<{
  item: Vendor;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  return (
    <Link href={`/inventory/vendors/${item.id}`} asChild>
      <TouchableOpacity className="flex-row w-full flex items-center p-2 border-b border-gray-700">
        <Text className="w-[20%] text-lg font-semibold text-white">
          {item.name}
        </Text>
        <Text className="w-[15%] text-lg text-gray-300">
          {item.contactPerson}
        </Text>
        <Text className="w-[30%] text-lg text-gray-300">{item.email}</Text>
        <Text className="w-[20%] text-lg text-gray-300">{item.phone}</Text>
        <View className="w-[10%] items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-2">
                <MoreHorizontal size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
              <DropdownMenuItem onPress={onEdit}>
                <Edit className="mr-2 h-5 w-5" color="#9CA3AF" />
                <Text className="text-base text-white">Edit Vendor</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 className="mr-2 h-5 w-5 text-red-400" color="#F87171" />
                <Text className="text-base text-red-400">Delete Vendor</Text>
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
  const router = useRouter();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.contactPerson, v.email, v.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }, [searchQuery, vendors]);

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
        <View className="flex-row p-2 bg-gray-800/50 rounded-t-xl border-b items-center border-gray-700">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header}
              className={`font-bold text-lg text-gray-400 ${
                header === "Vendor Name"
                  ? "w-[20%]"
                  : header === "Contact Person"
                  ? "w-[15%]"
                  : header === "Email"
                  ? "w-[30%]"
                  : header === "Phone"
                  ? "w-[15%]"
                  : "w-[0%]"
              }`}
            >
              {header}
            </Text>
          ))}
          <View className="flex-row items-center flex-1 justify-end gap-x-6">
            <TouchableOpacity
              onPress={() => {
                setIsSearchOpen(true);
                setTimeout(() => sheetRef.current?.expand(), 0);
              }}
              className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg p-2"
            >
              <Search color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenAddModal}
              className="py-2 px-4 w-1/3 bg-blue-600 rounded-lg flex-row items-center justify-center"
            >
              <Plus color="white" size={20} className="mr-2" />
              {/* <Text className="text-lg font-bold text-white">Add New Item</Text> */}
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

      {/* Search Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
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
        <View className="p-2 border-b border-gray-700">
          <View className="flex-row items-center bg-[#212121] rounded-lg px-3 py-1 border border-gray-600">
            <Search color="#9CA3AF" size={20} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search vendors..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-white ml-3 p-2 text-lg"
            />
          </View>
        </View>
        <BottomSheetFlatList
          data={filteredVendors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                sheetRef.current?.close();
                setIsSearchOpen(false);
                router.push(`/inventory/vendors/${item.id}`);
              }}
              className="p-2 border-b border-gray-700"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-white text-lg font-semibold">
                    {item.name}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {item.contactPerson} • {item.phone}
                  </Text>
                  <Text className="text-gray-500 text-sm">{item.email}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </BottomSheet>
    </View>
  );
};

export default VendorScreen;
