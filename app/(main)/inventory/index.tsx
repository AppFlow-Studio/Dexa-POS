import AddInventoryItemSheet from "@/components/inventory/AddInventoryItemSheet";
import InventoryItemFormModal from "@/components/inventory/InventoryItemFormModal";
import InventorySearchSheet from "@/components/inventory/InventorySearchSheet";
import MenuCatalogRow from "@/components/inventory/MenuCatalogRow";
import MenuSearchSheet from "@/components/inventory/MenuSearchSheet";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InventoryItem, MenuItemType } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet";
import { Link, useRouter } from "expo-router";
import {
  AlertTriangle,
  Check,
  Edit,
  Globe,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const InventoryCatalogRow: React.FC<{
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  const isLowStock = item.stockQuantity <= item.reorderThreshold;
  const vendors = useInventoryStore((state) => state.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);

  return (
    <Link href={`/inventory/ingredient-items/${item.id}`} asChild>
      <TouchableOpacity className="flex-row items-center px-4 py-4 border-b border-gray-700">
        {/* Name: 25% */}
        <View className="w-[25%] flex-row items-center gap-1">
          <Text className="text-xl font-semibold text-white" numberOfLines={1}>
            {item.name}
          </Text>
          {item.isGlobal && (
            <Globe color="#60A5FA" size={16} /> // Blue globe for global items
          )}
        </View>

        {/* Stock: 15% (Centered) */}
        <View className="w-[15%] items-center justify-center">
          <Text
            className={`text-xl font-semibold ${
              isLowStock ? "text-red-400" : "text-white"
            }`}
          >
            {item?.stockQuantity?.toFixed(0)} {item.unit}
          </Text>
        </View>

        {/* Reorder: 15% (Centered) */}
        <View className="w-[15%] items-center justify-center">
          <Text className="text-xl text-gray-300">
            {item.reorderThreshold} {item.unit}
          </Text>
        </View>

        {/* Cost: 15% */}
        <Text className="w-[15%] text-xl text-gray-300">
          ${item.cost.toFixed(2)}
        </Text>

        {/* Vendor: 20% */}
        <Text className="w-[20%] text-xl text-gray-300" numberOfLines={1}>
          {vendor?.name || "Unknown"}
        </Text>

        {/* Actions: 10% (Right Aligned) */}
        <View className="w-[10%] items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Increased touch area */}
              <TouchableOpacity className="p-3">
                <MoreHorizontal size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
              <DropdownMenuItem onPress={onEdit}>
                <Edit className="mr-2 h-5 w-5" color="#9CA3AF" />
                <Text className="text-lg text-white">Edit Item</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 className="mr-2 h-5 w-5" color="#F87171" />
                <Text className="text-lg text-red-400">Delete Item</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

const InventoryScreen = () => {
  const {
    inventoryItems,
    getLowStockItems,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    vendors,
  } = useInventoryStore();
  const lowStockItems = getLowStockItems();
  const { menuItems, toggleItemAvailability, updateMenuItem } = useMenuStore();
  const [activeTab, setActiveTab] = useState<"inventory" | "menu">("menu");
  const router = useRouter();
  const addItemSheetRef = React.useRef<BottomSheet>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Menu item actions state
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemType | null>(
    null
  );
  const [isStockModalOpen, setStockModalOpen] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");
  // Bulk selection/actions for menu items
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([]);
  const [isBulkStockModalOpen, setBulkStockModalOpen] = useState(false);
  const [bulkStockQuantity, setBulkStockQuantity] = useState("");
  const [bulkReorderThreshold, setBulkReorderThreshold] = useState("");
  // Inventory bottom sheet multi-select & bulk
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>(
    []
  );
  const [isBulkInventoryStockModalOpen, setBulkInventoryStockModalOpen] =
    useState(false);
  const [bulkInventoryStockQuantity, setBulkInventoryStockQuantity] =
    useState("");
  const [bulkInventoryReorderThreshold, setBulkInventoryReorderThreshold] =
    useState("");

  const handleOpenAddModal = () => {
    setSelectedItem(null);
    setModalMode("add");
  };

  const handleOpenEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setModalMode("edit");
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedItem(null);
  };

  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);

  const handleSaveItem = async (
    data: Omit<InventoryItem, "id">,
    id?: string
  ) => {
    if (!selectedStore?.id) {
      alert("No store selected");
      return;
    }
    try {
      if (id) {
        await updateInventoryItem(id, data, selectedStore.id);
      } else {
        await addInventoryItem(data, selectedStore.id);
      }
    } catch (e) {
      console.error("Failed to save item:", e);
      alert("Failed to save item. Please try again.");
    }
  };

  const handleOpenDeleteConfirm = (item: InventoryItem) => {
    setSelectedItem(item);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedItem) {
      deleteInventoryItem(selectedItem.id);
    }
    setDeleteConfirmOpen(false);
    setSelectedItem(null);
  };

  // Menu item action handlers
  const handleToggleAvailability = (item: MenuItemType) => {
    toggleItemAvailability(item.id);
  };

  const handleOpenStockModal = (item: MenuItemType) => {
    setSelectedMenuItem(item);
    setStockQuantity(item.stockQuantity?.toString() || "");
    setReorderThreshold(item.reorderThreshold?.toString() || "");
    setStockModalOpen(true);
  };

  const handleSaveStock = () => {
    if (!selectedMenuItem) return;

    const stockQty = stockQuantity ? parseInt(stockQuantity) : undefined;
    const threshold = reorderThreshold ? parseInt(reorderThreshold) : undefined;

    updateMenuItem(selectedMenuItem.id, {
      stockQuantity: stockQty,
      reorderThreshold: threshold,
    });

    setStockModalOpen(false);
    setSelectedMenuItem(null);
    setStockQuantity("");
    setReorderThreshold("");
  };

  const handleCloseStockModal = () => {
    setStockModalOpen(false);
    setSelectedMenuItem(null);
    setStockQuantity("");
    setReorderThreshold("");
  };
  // Bulk selection helpers
  const isAllSelected =
    selectedMenuIds.length > 0 && selectedMenuIds.length === menuItems.length;
  const toggleSelectMenuItem = (id: string) => {
    setSelectedMenuIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleSelectAllMenu = () => {
    if (isAllSelected) {
      setSelectedMenuIds([]);
    } else {
      setSelectedMenuIds(menuItems.map((m) => m.id));
    }
  };
  const clearSelection = () => setSelectedMenuIds([]);
  // Bulk actions
  const handleBulkSetAvailability = (available: boolean) => {
    if (selectedMenuIds.length === 0) return;
    selectedMenuIds.forEach((id) => {
      updateMenuItem(id, { availability: available });
    });
    clearSelection();
  };
  const handleOpenBulkStockModal = () => {
    setBulkStockQuantity("");
    setBulkReorderThreshold("");
    setBulkStockModalOpen(true);
  };
  const handleSaveBulkStock = () => {
    if (selectedMenuIds.length === 0) return;
    const stockQty = bulkStockQuantity
      ? parseInt(bulkStockQuantity)
      : undefined;
    const threshold = bulkReorderThreshold
      ? parseInt(bulkReorderThreshold)
      : undefined;
    selectedMenuIds.forEach((id) => {
      updateMenuItem(id, {
        stockQuantity: stockQty,
        reorderThreshold: threshold,
      });
    });
    setBulkStockModalOpen(false);
    setBulkStockQuantity("");
    setBulkReorderThreshold("");
    clearSelection();
  };
  const handleCloseBulkStockModal = () => {
    setBulkStockModalOpen(false);
    setBulkStockQuantity("");
    setBulkReorderThreshold("");
  };

  const TABLE_HEADERS_INVENTORY = [
    "Name",
    "In Stock",
    "Reorder Point",
    "Cost",
    "Vendor",
    "",
  ];
  const TABLE_HEADERS_MENU = [
    "Select",
    "Name",
    "Price",
    "Stock",
    "Reorder Point",
    "Availability",
    "",
  ];

  // Bottom sheet refs and search state
  const menuSearchSheetRef = React.useRef<BottomSheetModal>(null);
  const invSearchSheetRef = React.useRef<BottomSheetModal>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const snapPoints = useMemo(() => ["80%"], []);
  const openSearchSheet = () => {
    setSearchQuery("");
    if (activeTab === "menu") {
      menuSearchSheetRef.current?.expand();
    } else {
      invSearchSheetRef.current?.expand();
    }
  };

  const filteredMenu = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter((m) =>
      [m.name, ...(Array.isArray(m.category) ? m.category : [])]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [searchQuery, menuItems]);

  const filteredInventory = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) =>
      [i.name, i.category].some((s) => String(s).toLowerCase().includes(q))
    );
  }, [searchQuery, inventoryItems]);

  // Inventory selection helpers (for the bottom sheet)
  const isAllInventorySelected =
    selectedInventoryIds.length > 0 &&
    selectedInventoryIds.length === filteredInventory.length;
  const toggleSelectInventoryItem = (id: string) => {
    setSelectedInventoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleAllInventory = (ids: string[]) => {
    setSelectedInventoryIds(ids);
  };

  const toggleSelectAllInventory = () => {
    if (isAllInventorySelected) {
      setSelectedInventoryIds([]);
    } else {
      setSelectedInventoryIds(filteredInventory.map((i) => i.id));
    }
  };
  const clearInventorySelection = () => setSelectedInventoryIds([]);
  const handleOpenBulkInventoryStockModal = () => {
    setBulkInventoryStockQuantity("");
    setBulkInventoryReorderThreshold("");
    setBulkInventoryStockModalOpen(true);
  };
  const handleSaveBulkInventoryStock = () => {
    if (selectedInventoryIds.length === 0) return;
    const stockQty = bulkInventoryStockQuantity
      ? parseInt(bulkInventoryStockQuantity)
      : undefined;
    const threshold = bulkInventoryReorderThreshold
      ? parseInt(bulkInventoryReorderThreshold)
      : undefined;
    if (!selectedStore?.id) return;
    selectedInventoryIds.forEach((id) => {
      updateInventoryItem(
        id,
        {
          stockQuantity: stockQty ?? (undefined as any),
          reorderThreshold: threshold ?? (undefined as any),
          // keep other fields unchanged via partial update
        } as any,
        selectedStore.id
      );
    });
    setBulkInventoryStockModalOpen(false);
    setBulkInventoryStockQuantity("");
    setBulkInventoryReorderThreshold("");
    clearInventorySelection();
  };
  const handleCloseBulkInventoryStockModal = () => {
    setBulkInventoryStockModalOpen(false);
    setBulkInventoryStockQuantity("");
    setBulkInventoryReorderThreshold("");
  };
  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
    []
  );
  return (
    <BottomSheetModalProvider>
      <View className="flex-1">
        {lowStockItems.length > 0 && (
          <View className="mb-4 p-4 bg-red-900/30 border border-red-500 rounded-xl">
            <View className="flex-row items-center mb-2">
              <AlertTriangle color="#F87171" size={20} />
              <Text className="text-2xl font-bold text-red-400 ml-1.5">
                Low Stock Alerts
              </Text>
            </View>
            <View className="gap-y-1.5">
              {lowStockItems.map((item) => (
                <View
                  key={item.id}
                  className="flex-row justify-between p-2 bg-red-800/20 rounded-md"
                >
                  <Text className="text-xl text-white font-medium">
                    {item.name}
                  </Text>
                  <Text className="text-lg text-red-300">
                    Stock: {item.stockQuantity} (Threshold:{" "}
                    {item.reorderThreshold})
                  </Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create")}
              className="mt-3 py-2 px-4 bg-blue-600 self-start rounded-lg"
            >
              <Text className="text-xl text-white font-semibold">
                Create PO
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="mb-3 flex-row gap-2">
          <TouchableOpacity
            onPress={() => setActiveTab("menu")}
            className={`px-3 py-1.5 rounded-lg border ${
              activeTab === "menu"
                ? "bg-blue-600 border-blue-500"
                : "bg-[#303030] border-gray-700"
            }`}
          >
            <Text
              className={`text-lg font-semibold ${
                activeTab === "menu" ? "text-white" : "text-gray-300"
              }`}
            >
              Menu Items
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("inventory")}
            className={`px-3 py-1.5 rounded-lg border ${
              activeTab === "inventory"
                ? "bg-blue-600 border-blue-500"
                : "bg-[#303030] border-gray-700"
            }`}
          >
            <Text
              className={`text-lg font-semibold ${
                activeTab === "inventory" ? "text-white" : "text-gray-300"
              }`}
            >
              Inventory Items
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
          {/* --- Header Section --- */}
          <View className="flex-row py-3 px-4 bg-gray-800/50 rounded-t-xl border-b items-center border-gray-700">
            {(activeTab === "inventory"
              ? TABLE_HEADERS_INVENTORY
              : TABLE_HEADERS_MENU
            ).map((header) => {
              // Helper logic to determine width and alignment based on tab and header name
              let widthClass = "";
              let alignClass = "text-left"; // Default alignment

              if (activeTab === "inventory") {
                switch (header) {
                  case "Name":
                    widthClass = "w-[25%]";
                    break;
                  case "In Stock":
                    widthClass = "w-[15%]";
                    alignClass = "text-center";
                    break;
                  case "Reorder Point":
                    widthClass = "w-[15%]";
                    alignClass = "text-center";
                    break;
                  case "Cost":
                    widthClass = "w-[15%]";
                    break;
                  case "Vendor":
                    widthClass = "w-[20%]";
                    break;
                  default:
                    widthClass = "w-[10%]"; // Empty column for actions
                }
              } else {
                // Menu Tab
                switch (header) {
                  case "Select":
                    widthClass = "w-[6%]";
                    break;
                  case "Name":
                    widthClass = "w-[24%]";
                    break;
                  case "Price":
                    widthClass = "w-[15%]";
                    break;
                  case "Stock":
                    widthClass = "w-[15%]";
                    alignClass = "text-center";
                    break;
                  case "Reorder Point":
                    widthClass = "w-[15%]";
                    alignClass = "text-center";
                    break;
                  case "Availability":
                    widthClass = "w-[15%]";
                    alignClass = "text-center";
                    break;
                  default:
                    widthClass = "w-[10%]"; // Empty column for actions
                }
              }

              return (
                <Text
                  key={header}
                  className={`font-bold text-lg text-gray-400 ${widthClass} ${alignClass}`}
                >
                  {header === "Select" ? (
                    <TouchableOpacity
                      onPress={toggleSelectAllMenu}
                      className="h-5 w-5 items-center justify-center border border-gray-600 rounded"
                    >
                      <>{isAllSelected && <Check color="#fff" size={12} />}</>
                    </TouchableOpacity>
                  ) : (
                    header
                  )}
                </Text>
              );
            })}

            {/* Header Actions (Search/Add) */}
            <View className="flex-row items-center flex-1 justify-end gap-x-4 absolute right-4 top-2 bottom-2">
              <View className="flex-row items-center justify-end gap-x-4 ml-auto">
                <TouchableOpacity
                  onPress={openSearchSheet}
                  className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg p-2"
                >
                  <Search color="#9CA3AF" size={18} />
                </TouchableOpacity>
                {activeTab === "inventory" && (
                  <TouchableOpacity
                    onPress={() => addItemSheetRef.current?.expand()}
                    className="py-2 px-4 bg-blue-600 rounded-lg flex-row items-center justify-center"
                  >
                    <Plus color="white" size={18} className="mr-1.5" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* --- Lists --- */}
          {activeTab === "inventory" ? (
            <FlatList
              data={inventoryItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <InventoryCatalogRow
                  item={item}
                  onEdit={() => handleOpenEditModal(item)}
                  onDelete={() => handleOpenDeleteConfirm(item)}
                />
              )}
            />
          ) : (
            <FlatList
              data={menuItems}
              keyExtractor={(item) => item.id}
              // Optional: Optimize window size for faster scrolling
              initialNumToRender={10}
              windowSize={5}
              renderItem={({ item }) => (
                <MenuCatalogRow
                  item={item}
                  // Check parent state for initial value
                  initialIsSelected={selectedMenuIds.includes(item.id)}
                  onToggle={toggleSelectMenuItem}
                  onToggleAvailability={handleToggleAvailability}
                  onOpenStockModal={handleOpenStockModal}
                />
              )}
            />
          )}
        </View>

        {activeTab === "menu" && selectedMenuIds.length > 0 && (
          <View className="mt-2 p-3 bg-[#303030] border border-gray-700 rounded-xl flex-row items-center justify-between">
            <Text className="text-white text-base">
              Selected: {selectedMenuIds.length}
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => handleBulkSetAvailability(true)}
                className="px-3 py-2 bg-green-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold">
                  Set On
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleBulkSetAvailability(false)}
                className="px-3 py-2 bg-yellow-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold">
                  Set Off
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenBulkStockModal}
                className="px-3 py-2 bg-blue-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold">
                  Update Stock
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clearSelection}
                className="px-3 py-2 bg-gray-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold">
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <InventoryItemFormModal
          isOpen={modalMode === "add" || modalMode === "edit"}
          onClose={handleCloseModal}
          onSave={handleSaveItem}
          vendors={vendors}
          initialData={selectedItem}
        />
        <ConfirmationModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Delete Item"
          description={`Delete "${selectedItem?.name}"?`}
          confirmText="Delete"
          variant="destructive"
        />

        <Modal
          visible={isStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <View className="flex-1 bg-black/50 justify-center items-center px-4">
              <View className="bg-[#303030] rounded-xl p-4 w-full max-w-sm">
                <Text className="text-xl font-bold text-white mb-3">
                  Update Stock - {selectedMenuItem?.name}
                </Text>
                <View className="mb-3">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Stock Quantity
                  </Text>
                  <TextInput
                    value={stockQuantity}
                    onChangeText={setStockQuantity}
                    placeholder="Enter quantity"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Reorder Threshold
                  </Text>
                  <TextInput
                    value={reorderThreshold}
                    onChangeText={setReorderThreshold}
                    placeholder="Enter threshold"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleCloseStockModal}
                    className="flex-1 py-2 px-3 bg-gray-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveStock}
                    className="flex-1 py-2 px-3 bg-blue-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* --- MODAL 2: BULK INVENTORY STOCK UPDATE --- */}
        <Modal
          visible={isBulkInventoryStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseBulkInventoryStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <View className="flex-1 bg-black/50 justify-center items-center px-4">
              <View className="bg-[#303030] rounded-xl p-4 w-full max-w-sm">
                <Text className="text-xl font-bold text-white mb-3">
                  Update Stock ({selectedInventoryIds.length} items)
                </Text>
                <View className="mb-3">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Stock Quantity
                  </Text>
                  <TextInput
                    value={bulkInventoryStockQuantity}
                    onChangeText={setBulkInventoryStockQuantity}
                    placeholder="(Optional)"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Reorder Threshold
                  </Text>
                  <TextInput
                    value={bulkInventoryReorderThreshold}
                    onChangeText={setBulkInventoryReorderThreshold}
                    placeholder="(Optional)"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleCloseBulkInventoryStockModal}
                    className="flex-1 py-2 px-3 bg-gray-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveBulkInventoryStock}
                    className="flex-1 py-2 px-3 bg-blue-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* --- MODAL 3: BULK MENU STOCK UPDATE --- */}
        <Modal
          visible={isBulkStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseBulkStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
          >
            <View className="flex-1 bg-black/50 justify-center items-center px-4">
              <View className="bg-[#303030] rounded-xl p-4 w-full max-w-sm">
                <Text className="text-xl font-bold text-white mb-3">
                  Update Stock ({selectedMenuIds.length} items)
                </Text>
                <View className="mb-3">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Stock Quantity
                  </Text>
                  <TextInput
                    value={bulkStockQuantity}
                    onChangeText={setBulkStockQuantity}
                    placeholder="(Optional)"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-base text-gray-300 mb-1.5">
                    Reorder Threshold
                  </Text>
                  <TextInput
                    value={bulkReorderThreshold}
                    onChangeText={setBulkReorderThreshold}
                    placeholder="(Optional)"
                    keyboardType="numeric"
                    className="bg-[#212121] border border-gray-600 rounded-lg px-3 py-2 text-white text-base h-16"
                  />
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleCloseBulkStockModal}
                    className="flex-1 py-2 px-3 bg-gray-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveBulkStock}
                    className="flex-1 py-2 px-3 bg-blue-600 rounded-lg"
                  >
                    <Text className="text-white text-base font-semibold text-center">
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <AddInventoryItemSheet ref={addItemSheetRef} />
      </View>
      <MenuSearchSheet
        ref={menuSearchSheetRef}
        menuItems={menuItems}
        selectedIds={selectedMenuIds}
        onToggle={(itemId) => {
          toggleSelectMenuItem(itemId);
        }}
      />
      <InventorySearchSheet
        ref={invSearchSheetRef}
        inventoryItems={inventoryItems}
        vendors={vendors}
        selectedIds={selectedInventoryIds}
        onToggle={toggleSelectInventoryItem}
        onToggleAll={handleToggleAllInventory}
        onClear={clearInventorySelection}
        onBulkUpdate={handleOpenBulkInventoryStockModal}
        onEdit={handleOpenEditModal}
        onDelete={handleOpenDeleteConfirm}
      />
    </BottomSheetModalProvider>
  );
};

export default InventoryScreen;
