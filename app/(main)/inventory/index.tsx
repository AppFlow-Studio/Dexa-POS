import AddInventoryItemSheet from "@/components/inventory/AddInventoryItemSheet";
import InventoryItemFormModal from "@/components/inventory/InventoryItemFormModal";
import InventoryItemDetailModal from "@/components/inventory/InventoryItemDetailModal";
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
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit,
  LayoutGrid,
  List,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";

/* =========================
   Grid Box
========================= */
const InventoryItemBox: React.FC<{
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
  onTap: () => void;
}> = ({ item, onEdit, onDelete, onTap }) => {
  const isLowStock = (item.stockQuantity ?? 0) <= (item.reorderThreshold ?? 0);
  const vendors = useInventoryStore((state) => state.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);

  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.6}
      style={{
        backgroundColor: colors.panel,
        margin: 5,
        borderRadius: 14,
        padding: 10,
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* Gradient Accent Top */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: isLowStock ? colors.danger : colors.teal,
        }}
      />

      {/* Top Section: Icon & Menu */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: (isLowStock ? colors.danger : colors.teal) + "15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Package size={15} color={isLowStock ? colors.danger : colors.teal} />
        </View>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity style={{ padding: 3 }}>
              <MoreHorizontal size={12} color={colors.muted} />
            </TouchableOpacity>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-40"
            style={{ backgroundColor: colors.panel, borderColor: colors.border }}
          >
            <DropdownMenuItem onPress={onEdit}>
              <Edit size={13} color={colors.label} />
              <Text style={{ marginLeft: 6, fontSize: 12, color: colors.label }}>Edit</Text>
            </DropdownMenuItem>

            <DropdownMenuItem onPress={onDelete}>
              <Trash2 size={13} color={colors.danger} />
              <Text style={{ marginLeft: 6, fontSize: 12, color: colors.danger }}>Delete</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>

      {/* Name & Category */}
      <View style={{ marginBottom: 8 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: colors.heading,
            marginBottom: 2,
            lineHeight: 14,
          }}
        >
          {item.name}
        </Text>

        <Text
          numberOfLines={1}
          style={{
            fontSize: 8.5,
            color: colors.muted,
          }}
        >
          {item.category || "—"}
        </Text>
      </View>

      {/* Stock Highlight */}
      <View style={{ backgroundColor: (isLowStock ? colors.danger : colors.teal) + "10", borderRadius: 8, padding: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 8, color: colors.muted, marginBottom: 2 }}>Stock</Text>
        <Text style={{ fontSize: 12, fontWeight: "700", color: isLowStock ? colors.danger : colors.teal }}>
          {(item.stockQuantity ?? 0).toFixed(0)} {item.unit}
        </Text>
      </View>

      {/* Cost & Vendor */}
      <View style={{ flexDirection: "row", gap: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, color: colors.muted, marginBottom: 1 }}>Cost</Text>
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.label }}>
            ${(item.cost ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, color: colors.muted, marginBottom: 1 }}>Vendor</Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 9,
              fontWeight: "500",
              color: colors.label,
            }}
          >
            {vendor?.name || "—"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* =========================
   Row Item
========================= */
const InventoryItemRow: React.FC<{
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
  onTap: () => void;
}> = ({ item, onEdit, onDelete, onTap }) => {
  const isLowStock = (item.stockQuantity ?? 0) <= (item.reorderThreshold ?? 0);
  const vendors = useInventoryStore((state) => state.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);

  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.panel,
        marginHorizontal: 10,
        marginBottom: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: isLowStock ? colors.danger : colors.teal,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: (isLowStock ? colors.danger : colors.teal) + "15",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Package size={13} color={isLowStock ? colors.danger : colors.teal} />
      </View>

      {/* Name + Category */}
      <View style={{ flex: 3 }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
          {item.category || "—"}
        </Text>
      </View>

      {/* Stock */}
      <View style={{ flex: 2, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 1 }}>Stock</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: isLowStock ? colors.danger : colors.teal }}>
            {(item.stockQuantity ?? 0).toFixed(0)}
          </Text>
          <Text style={{ fontSize: 9, color: colors.muted }}>{item.unit}</Text>
          {isLowStock && (
            <AlertTriangle size={10} color={colors.danger} />
          )}
        </View>
      </View>

      {/* Reorder Threshold */}
      <View style={{ flex: 1.5, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 1 }}>Reorder</Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
          {item.reorderThreshold ?? 0}
        </Text>
      </View>

      {/* Cost */}
      <View style={{ flex: 1.5, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 1 }}>Cost</Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
          ${(item.cost ?? 0).toFixed(2)}
        </Text>
      </View>

      {/* Vendor */}
      <View style={{ flex: 2, alignItems: "flex-start" }}>
        <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 1 }}>Vendor</Text>
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "500", color: colors.label }}>
          {vendor?.name || "—"}
        </Text>
      </View>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TouchableOpacity style={{ padding: 6 }}>
            <MoreHorizontal size={14} color={colors.muted} />
          </TouchableOpacity>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-40"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <DropdownMenuItem onPress={onEdit}>
            <Edit size={13} color={colors.label} />
            <Text style={{ marginLeft: 6, fontSize: 12, color: colors.label }}>Edit</Text>
          </DropdownMenuItem>
          <DropdownMenuItem onPress={onDelete}>
            <Trash2 size={13} color={colors.danger} />
            <Text style={{ marginLeft: 6, fontSize: 12, color: colors.danger }}>Delete</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TouchableOpacity>
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
    fetchInventoryItems,
    vendors,
  } = useInventoryStore();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  useEffect(() => {
    if (selectedStore?.id) {
      fetchInventoryItems(selectedStore.id);
    }
  }, [selectedStore?.id]);

  const lowStockItems = getLowStockItems();
  const addItemSheetRef = React.useRef<BottomSheet>(null);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "row">("card");

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

      {/* Search + View Toggle + Add */}
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

        {/* View toggle */}
        <TouchableOpacity
          onPress={() => setViewMode((m) => (m === "card" ? "row" : "card"))}
          style={{
            height: 40,
            width: 40,
            borderRadius: 8,
            backgroundColor: colors.panel,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {viewMode === "card" ? (
            <List size={16} color={colors.label} />
          ) : (
            <LayoutGrid size={16} color={colors.label} />
          )}
        </TouchableOpacity>

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

      {/* Row header (row view only) */}
      {viewMode === "row" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: 10,
            marginBottom: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 8,
          }}
        >
          <View style={{ width: 30, flexShrink: 0 }} />
          <Text style={{ flex: 3, fontSize: 9, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</Text>
          <Text style={{ flex: 2, fontSize: 9, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Stock</Text>
          <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Reorder</Text>
          <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Cost</Text>
          <Text style={{ flex: 2, fontSize: 9, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Vendor</Text>
          <View style={{ width: 26 }} />
        </View>
      )}

      {/* Card / Row List */}
      <FlatList
        key={viewMode}
        data={filteredInventory}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === "card" ? 5 : 1}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: viewMode === "card" ? 0 : 0 }}
        renderItem={({ item }) =>
          viewMode === "card" ? (
            <InventoryItemBox
              item={item}
              onTap={() => setDetailItemId(item.id)}
              onEdit={() => setDetailItemId(item.id)}
              onDelete={() => {
                setSelectedItem(item);
                setDeleteConfirmOpen(true);
              }}
            />
          ) : (
            <InventoryItemRow
              item={item}
              onTap={() => setDetailItemId(item.id)}
              onEdit={() => setDetailItemId(item.id)}
              onDelete={() => {
                setSelectedItem(item);
                setDeleteConfirmOpen(true);
              }}
            />
          )
        }
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

      <InventoryItemDetailModal
        isOpen={detailItemId !== null}
        itemId={detailItemId}
        onClose={() => setDetailItemId(null)}
        onUpdate={(id, data) => {
          if (selectedStore?.id) {
            return updateInventoryItem(id, data, selectedStore.id);
          }
          return Promise.resolve();
        }}
      />
    </View>
  );
};

export default InventoryScreen;