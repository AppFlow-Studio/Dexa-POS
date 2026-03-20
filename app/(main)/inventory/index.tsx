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
import { colors } from "@/lib/theme";
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
  ChevronDown,
  ChevronRight,
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

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  color: colors.heading,
  fontSize: 14,
  height: 40,
  paddingHorizontal: 12,
};

const fieldLabel = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};

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
      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Name: 25% */}
        <View style={{ width: "25%", flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}
          >
            {item.name}
          </Text>
          {item.isGlobal && <Globe color={colors.info} size={14} />}
        </View>

        {/* Stock: 15% */}
        <View style={{ width: "15%", alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: isLowStock ? colors.danger : colors.heading }}>
            {item?.stockQuantity?.toFixed(0)} {item.unit}
          </Text>
        </View>

        {/* Reorder: 15% */}
        <View style={{ width: "15%", alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: colors.label }}>
            {item.reorderThreshold} {item.unit}
          </Text>
        </View>

        {/* Cost: 15% */}
        <Text style={{ fontSize: 13, color: colors.label, width: "15%" }}>
          ${item.cost.toFixed(2)}
        </Text>

        {/* Vendor: 20% */}
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.label, width: "20%" }}>
          {vendor?.name || "Unknown"}
        </Text>

        {/* Actions: 10% */}
        <View style={{ width: "10%", alignItems: "flex-end" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity style={{ padding: 6 }}>
                <MoreHorizontal size={16} color={colors.muted} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-44"
              style={{ backgroundColor: colors.panel, borderColor: colors.border }}
            >
              <DropdownMenuItem onPress={onEdit}>
                <Edit size={14} color={colors.label} />
                <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>
                  Edit Item
                </Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 size={14} color={colors.danger} />
                <Text style={{ fontSize: 13, color: colors.danger, marginLeft: 8 }}>
                  Delete Item
                </Text>
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

  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemType | null>(null);
  const [isStockModalOpen, setStockModalOpen] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("");
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([]);
  const [isBulkStockModalOpen, setBulkStockModalOpen] = useState(false);
  const [bulkStockQuantity, setBulkStockQuantity] = useState("");
  const [bulkReorderThreshold, setBulkReorderThreshold] = useState("");
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<string[]>([]);
  const [isBulkInventoryStockModalOpen, setBulkInventoryStockModalOpen] = useState(false);
  const [bulkInventoryStockQuantity, setBulkInventoryStockQuantity] = useState("");
  const [bulkInventoryReorderThreshold, setBulkInventoryReorderThreshold] = useState("");
  const [alertExpanded, setAlertExpanded] = useState(false);

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

  const handleSaveItem = async (data: Omit<InventoryItem, "id">, id?: string) => {
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
    updateMenuItem(selectedMenuItem.id, { stockQuantity: stockQty, reorderThreshold: threshold });
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
    const stockQty = bulkStockQuantity ? parseInt(bulkStockQuantity) : undefined;
    const threshold = bulkReorderThreshold ? parseInt(bulkReorderThreshold) : undefined;
    selectedMenuIds.forEach((id) => {
      updateMenuItem(id, { stockQuantity: stockQty, reorderThreshold: threshold });
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

  const TABLE_HEADERS_INVENTORY = ["Name", "In Stock", "Reorder Point", "Cost", "Vendor", ""];
  const TABLE_HEADERS_MENU = ["Select", "Name", "Price", "Stock", "Reorder Point", "Availability", ""];

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
    const stockQty = bulkInventoryStockQuantity ? parseInt(bulkInventoryStockQuantity) : undefined;
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
    () => (props: any) => (
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
      <View style={{ flex: 1 }}>
        {/* Low Stock Alert Banner */}
        {lowStockItems.length > 0 && (
          <View
            style={{
              marginBottom: 12,
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {/* Collapsed header — always visible */}
            <TouchableOpacity
              onPress={() => setAlertExpanded((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 9,
                gap: 8,
              }}
              activeOpacity={0.7}
            >
              <AlertTriangle color={colors.danger} size={14} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.danger, flex: 1 }}>
                Low Stock Alerts
              </Text>
              {/* Count badge */}
              <View
                style={{
                  backgroundColor: colors.danger + "30",
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  marginRight: 4,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.danger }}>
                  {lowStockItems.length}
                </Text>
              </View>
              {alertExpanded ? (
                <ChevronDown size={14} color={colors.danger} />
              ) : (
                <ChevronRight size={14} color={colors.danger} />
              )}
            </TouchableOpacity>

            {/* Expanded content */}
            {alertExpanded && (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingBottom: 10,
                  gap: 4,
                }}
              >
                {lowStockItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      backgroundColor: colors.danger + "10",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "500" }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.danger }}>
                      Stock: {item.stockQuantity} · Threshold: {item.reorderThreshold}
                    </Text>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => router.push("/inventory/purchase-orders/create")}
                  style={{
                    marginTop: 4,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: 8,
                    alignSelf: "flex-start",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                    Create PO
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Tab Switcher */}
        <View style={{ flexDirection: "row", gap: 0, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {(["menu", "inventory"] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === "menu" ? "Menu Items" : "Inventory Items";
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? colors.teal : "transparent",
                  marginBottom: -1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? colors.teal : colors.label }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Table */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
          }}
        >
          {/* Table Header */}
          <View
            style={{
              flexDirection: "row",
              paddingVertical: 8,
              paddingHorizontal: 12,
              backgroundColor: colors.screen,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              alignItems: "center",
            }}
          >
            {(activeTab === "inventory" ? TABLE_HEADERS_INVENTORY : TABLE_HEADERS_MENU).map(
              (header) => {
                let widthStyle: any = {};

                if (activeTab === "inventory") {
                  switch (header) {
                    case "Name": widthStyle = { width: "25%" }; break;
                    case "In Stock": widthStyle = { width: "15%", textAlign: "center" }; break;
                    case "Reorder Point": widthStyle = { width: "15%", textAlign: "center" }; break;
                    case "Cost": widthStyle = { width: "15%" }; break;
                    case "Vendor": widthStyle = { width: "20%" }; break;
                    default: widthStyle = { width: "10%" };
                  }
                } else {
                  switch (header) {
                    case "Select": widthStyle = { width: "6%" }; break;
                    case "Name": widthStyle = { width: "24%" }; break;
                    case "Price": widthStyle = { width: "15%" }; break;
                    case "Stock": widthStyle = { width: "15%", textAlign: "center" }; break;
                    case "Reorder Point": widthStyle = { width: "15%", textAlign: "center" }; break;
                    case "Availability": widthStyle = { width: "15%", textAlign: "center" }; break;
                    default: widthStyle = { width: "10%" };
                  }
                }

                if (header === "Select") {
                  return (
                    <View key="select" style={{ width: "6%" }}>
                      <TouchableOpacity
                        onPress={toggleSelectAllMenu}
                        style={{
                          height: 16,
                          width: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderRadius: 3,
                          borderColor: colors.border,
                        }}
                      >
                        {isAllSelected && <Check color={colors.teal} size={10} />}
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <Text
                    key={header}
                    style={[
                      {
                        fontSize: 11,
                        fontWeight: "600",
                        color: colors.muted,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      },
                      widthStyle,
                    ]}
                  >
                    {header}
                  </Text>
                );
              }
            )}

            {/* Header Actions */}
            <View style={{ position: "absolute", right: 12, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                onPress={openSearchSheet}
                style={{
                  backgroundColor: colors.teal + "15",
                  borderRadius: 8,
                  padding: 7,
                }}
              >
                <Search color={colors.teal} size={16} />
              </TouchableOpacity>
              {activeTab === "inventory" && (
                <TouchableOpacity
                  onPress={() => addItemSheetRef.current?.expand()}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Plus color={colors.teal} size={16} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Lists */}
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
              initialNumToRender={10}
              windowSize={5}
              renderItem={({ item }) => (
                <MenuCatalogRow
                  item={item}
                  initialIsSelected={selectedMenuIds.includes(item.id)}
                  onToggle={toggleSelectMenuItem}
                  onToggleAvailability={handleToggleAvailability}
                  onOpenStockModal={handleOpenStockModal}
                />
              )}
            />
          )}
        </View>

        {/* Bulk Action Bar */}
        {activeTab === "menu" && selectedMenuIds.length > 0 && (
          <View
            style={{
              marginTop: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 12, color: colors.label }}>
              Selected: {selectedMenuIds.length}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => handleBulkSetAvailability(true)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: colors.success + "20",
                  borderWidth: 1,
                  borderColor: colors.success + "30",
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>
                  Set On
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleBulkSetAvailability(false)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: colors.warning + "20",
                  borderWidth: 1,
                  borderColor: colors.warning + "30",
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.warning }}>
                  Set Off
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenBulkStockModal}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
                  Update Stock
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={clearSelection}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
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

        {/* Stock Update Modal */}
        <Modal
          visible={isStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.6)",
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  padding: 14,
                  width: "100%",
                  maxWidth: 400,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 12 }}>
                  Update Stock — {selectedMenuItem?.name}
                </Text>
                <View style={{ marginBottom: 10 }}>
                  <Text style={fieldLabel}>Stock Quantity</Text>
                  <TextInput
                    value={stockQuantity}
                    onChangeText={setStockQuantity}
                    placeholder="Enter quantity"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={fieldLabel}>Reorder Threshold</Text>
                  <TextInput
                    value={reorderThreshold}
                    onChangeText={setReorderThreshold}
                    placeholder="Enter threshold"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleCloseStockModal}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveStock}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Bulk Inventory Stock Update Modal */}
        <Modal
          visible={isBulkInventoryStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseBulkInventoryStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.6)",
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  padding: 14,
                  width: "100%",
                  maxWidth: 400,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 12 }}>
                  Update Stock ({selectedInventoryIds.length} items)
                </Text>
                <View style={{ marginBottom: 10 }}>
                  <Text style={fieldLabel}>Stock Quantity</Text>
                  <TextInput
                    value={bulkInventoryStockQuantity}
                    onChangeText={setBulkInventoryStockQuantity}
                    placeholder="(Optional)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={fieldLabel}>Reorder Threshold</Text>
                  <TextInput
                    value={bulkInventoryReorderThreshold}
                    onChangeText={setBulkInventoryReorderThreshold}
                    placeholder="(Optional)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleCloseBulkInventoryStockModal}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveBulkInventoryStock}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Bulk Menu Stock Update Modal */}
        <Modal
          visible={isBulkStockModalOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseBulkStockModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.6)",
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  padding: 14,
                  width: "100%",
                  maxWidth: 400,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 12 }}>
                  Update Stock ({selectedMenuIds.length} items)
                </Text>
                <View style={{ marginBottom: 10 }}>
                  <Text style={fieldLabel}>Stock Quantity</Text>
                  <TextInput
                    value={bulkStockQuantity}
                    onChangeText={setBulkStockQuantity}
                    placeholder="(Optional)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ marginBottom: 14 }}>
                  <Text style={fieldLabel}>Reorder Threshold</Text>
                  <TextInput
                    value={bulkReorderThreshold}
                    onChangeText={setBulkReorderThreshold}
                    placeholder="(Optional)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleCloseBulkStockModal}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveBulkStock}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
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
