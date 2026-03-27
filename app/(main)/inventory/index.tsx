import AddInventoryItemSheet from "@/components/inventory/AddInventoryItemSheet";
import InventoryItemFormModal from "@/components/inventory/InventoryItemFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colors } from "@/lib/theme";
import { InventoryItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet from "@gorhom/bottom-sheet";
import { Link } from "expo-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";

/* =========================
   Compact Row
========================= */
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
        activeOpacity={0.7}
        style={{
          backgroundColor: colors.panel,
          marginHorizontal: 10,
          marginBottom: 8,
          borderRadius: 10,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Icon */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.teal + "18",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Package size={14} color={colors.teal} />
        </View>

        {/* Name & Category */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.heading,
            }}
          >
            {item.name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 10,
              color: colors.muted,
              marginTop: 1,
            }}
          >
            {item.category || "—"}
          </Text>
        </View>

        {/* Stock Status */}
        <View style={{ alignItems: "center", minWidth: 45 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: isLowStock ? colors.danger : colors.teal }}>
            {item.stockQuantity.toFixed(0)}
          </Text>
          <Text style={{ fontSize: 9, color: colors.muted }}>Stock</Text>
        </View>

        {/* Cost */}
        <View style={{ alignItems: "center", minWidth: 48 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
            ${item.cost.toFixed(2)}
          </Text>
          <Text style={{ fontSize: 9, color: colors.muted }}>Cost</Text>
        </View>

        {/* Vendor (compact) */}
        <View style={{ maxWidth: 65, alignItems: "flex-end" }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              fontWeight: "500",
              color: colors.label,
            }}
          >
            {vendor?.name || "—"}
          </Text>
        </View>

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity style={{ padding: 4, flexShrink: 0 }}>
              <MoreHorizontal size={14} color={colors.muted} />
            </TouchableOpacity>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-40"
            style={{ backgroundColor: colors.panel, borderColor: colors.border }}
          >
            <DropdownMenuItem onPress={onEdit}>
              <Edit size={13} color={colors.label} />
              <Text style={{ marginLeft: 6, fontSize: 12 }}>Edit</Text>
            </DropdownMenuItem>

            <DropdownMenuItem onPress={onDelete}>
              <Trash2 size={13} color={colors.danger} />
              <Text style={{ marginLeft: 6, fontSize: 12, color: colors.danger }}>
                Delete
              </Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TouchableOpacity>
    </Link>
  );
};

/* =========================
   Screen
========================= */
const InventoryScreen = () => {
  const {
    inventoryItems,
    getLowStockItems,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    vendors,
  } = useInventoryStore();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const lowStockItems = getLowStockItems();
  const addItemSheetRef = React.useRef<BottomSheet>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [alertExpanded, setAlertExpanded] = useState(false);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return inventoryItems;

    return inventoryItems.filter((i) =>
      [i.name, i.category, vendors.find((v) => v.id === i.vendorId)?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [searchQuery, inventoryItems, vendors]);

  const handleSaveItem = async (data: Omit<InventoryItem, "id">, id?: string) => {
    if (!selectedStore?.id) return alert("No store selected");

    if (id) {
      await updateInventoryItem(id, data, selectedStore.id);
    } else {
      await addInventoryItem(data, selectedStore.id);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Low Stock */}
      {lowStockItems.length > 0 && (
        <View
          style={{
            marginHorizontal: 10,
            marginTop: 10,
            marginBottom: 8,
            borderRadius: 10,
            backgroundColor: colors.danger + "12",
            borderWidth: 1,
            borderColor: colors.danger + "30",
            padding: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => setAlertExpanded((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <AlertTriangle size={14} color={colors.danger} />
            <Text style={{ marginLeft: 6, flex: 1, fontSize: 12, fontWeight: "700", color: colors.danger }}>
              Low Stock ({lowStockItems.length})
            </Text>

            {alertExpanded ? (
              <ChevronDown size={14} color={colors.danger} />
            ) : (
              <ChevronRight size={14} color={colors.danger} />
            )}
          </TouchableOpacity>

          {alertExpanded && (
            <View style={{ marginTop: 6 }}>
              {lowStockItems.map((item) => (
                <Text key={item.id} style={{ fontSize: 11, marginBottom: 2, color: colors.danger }}>
                  • {item.name} ({item.stockQuantity}/{item.reorderThreshold})
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Search + Add */}
      <View style={{ flexDirection: "row", marginHorizontal: 10, marginBottom: 8, gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.panel,
            borderRadius: 8,
            paddingHorizontal: 10,
            height: 40,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={14} color={colors.muted} />
          <TextInput
            placeholder="Search..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.muted}
            style={{ marginLeft: 6, flex: 1, fontSize: 13, textAlignVertical: "center", color: colors.label }}
          />
        </View>

        <TouchableOpacity
          onPress={() => addItemSheetRef.current?.expand()}
          style={{
            height: 40,
            width: 40,
            borderRadius: 8,
            backgroundColor: colors.teal + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Plus size={18} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredInventory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <InventoryCatalogRow
            item={item}
            onEdit={() => {
              setSelectedItem(item);
              setModalMode("edit");
            }}
            onDelete={() => {
              setSelectedItem(item);
              setDeleteConfirmOpen(true);
            }}
          />
        )}
      />

      {/* Modals */}
      <InventoryItemFormModal
        isOpen={modalMode !== null}
        onClose={() => {
          setModalMode(null);
          setSelectedItem(null);
        }}
        onSave={handleSaveItem}
        vendors={vendors}
        initialData={selectedItem}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (selectedItem) deleteInventoryItem(selectedItem.id);
          setDeleteConfirmOpen(false);
        }}
        title="Delete Item"
        description={`Delete "${selectedItem?.name}"?`}
        confirmText="Delete"
        variant="destructive"
      />

      <AddInventoryItemSheet ref={addItemSheetRef} />
    </View>
  );
};

export default InventoryScreen;