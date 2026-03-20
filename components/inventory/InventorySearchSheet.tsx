import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { InventoryItem, Vendor } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Link } from "expo-router";
import { AlertTriangle, Check, Edit, MoreHorizontal, Search, Trash2 } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface InventorySearchSheetProps {
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onClear: () => void;
  onBulkUpdate: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}

const InventorySearchRow = React.memo(
  ({
    item,
    vendorName,
    initialIsSelected,
    onToggle,
    onEdit,
    onDelete,
  }: {
    item: InventoryItem;
    vendorName: string;
    initialIsSelected: boolean;
    onToggle: (id: string) => void;
    onEdit: () => void;
    onDelete: () => void;
  }) => {
    const [isSelected, setIsSelected] = useState(initialIsSelected);

    useEffect(() => {
      setIsSelected(initialIsSelected);
    }, [initialIsSelected]);

    const handlePress = useCallback(() => {
      setIsSelected((prev) => !prev);
      onToggle(item.id);
    }, [item.id, onToggle]);

    const isLowStock = item.stockQuantity <= item.reorderThreshold;

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Checkbox */}
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.7}
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: isSelected ? colors.teal : colors.border,
            backgroundColor: isSelected ? colors.teal + "20" : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          {isSelected && <Check size={12} color={colors.teal} />}
        </TouchableOpacity>

        {/* Content */}
        <Link href={`/inventory/ingredient-items/${item.id}`} asChild>
          <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            {/* Name */}
            <Text
              numberOfLines={1}
              style={{ width: "25%", fontSize: 13, fontWeight: "600", color: colors.heading, paddingRight: 8 }}
            >
              {item.name}
            </Text>

            {/* Stock */}
            <View style={{ width: "15%", flexDirection: "row", alignItems: "center", gap: 4 }}>
              {isLowStock && <AlertTriangle size={10} color={colors.warning} />}
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, fontWeight: "600", color: isLowStock ? colors.warning : colors.label }}
              >
                {item.stockQuantity?.toFixed(0)} {item.unit}
              </Text>
            </View>

            {/* Reorder */}
            <Text
              numberOfLines={1}
              style={{ width: "15%", fontSize: 12, color: colors.label }}
            >
              {item.reorderThreshold}
            </Text>

            {/* Cost */}
            <Text
              numberOfLines={1}
              style={{ width: "15%", fontSize: 12, color: colors.label }}
            >
              ${item.cost.toFixed(2)}
            </Text>

            {/* Vendor */}
            <Text
              numberOfLines={1}
              style={{ width: "20%", fontSize: 12, color: colors.muted }}
            >
              {vendorName}
            </Text>
          </TouchableOpacity>
        </Link>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity style={{ padding: 6 }}>
              <MoreHorizontal size={15} color={colors.muted} />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-44"
            style={{ backgroundColor: colors.panel, borderColor: colors.border }}
          >
            <DropdownMenuItem onPress={onEdit}>
              <Edit size={14} color={colors.label} />
              <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>Edit Item</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={onDelete}>
              <Trash2 size={14} color={colors.danger} />
              <Text style={{ fontSize: 13, color: colors.danger, marginLeft: 8 }}>Delete Item</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    );
  },
  (prev, next) =>
    prev.initialIsSelected === next.initialIsSelected &&
    prev.item.id === next.item.id &&
    prev.item.stockQuantity === next.item.stockQuantity
);

const InventorySearchSheet = forwardRef<BottomSheet, InventorySearchSheetProps>(
  (
    {
      inventoryItems,
      vendors,
      selectedIds,
      onToggle,
      onToggleAll,
      onClear,
      onBulkUpdate,
      onEdit,
      onDelete,
    },
    ref
  ) => {
    const [searchQuery, setSearchQuery] = useState("");
    const snapPoints = useMemo(() => ["85%"], []);

    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const filteredInventory = useMemo(() => {
      const seenIds = new Set<string>();
      const query = searchQuery.trim().toLowerCase();
      return inventoryItems.filter((i) => {
        if (seenIds.has(i.id)) return false;
        seenIds.add(i.id);
        if (!query) return true;
        return [i.name, i.category].some((s) => String(s).toLowerCase().includes(query));
      });
    }, [searchQuery, inventoryItems]);

    const isAllSelected =
      filteredInventory.length > 0 && selectedIds.length >= filteredInventory.length;

    const handleToggleAll = () => {
      if (isAllSelected) {
        onClear();
      } else {
        onToggleAll(filteredInventory.map((i) => i.id));
      }
    };

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
      ),
      []
    );

    const renderItem = useCallback(
      ({ item }: { item: InventoryItem }) => {
        const vendor = vendors.find((v) => v.id === item.vendorId);
        return (
          <InventorySearchRow
            item={item}
            vendorName={vendor?.name || "—"}
            initialIsSelected={selectedIdsSet.has(item.id)}
            onToggle={onToggle}
            onEdit={() => {
              (ref as any)?.current?.close();
              onEdit(item);
            }}
            onDelete={() => onDelete(item)}
          />
        );
      },
      [selectedIdsSet, vendors, onToggle, onEdit, onDelete, ref]
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        topInset={60}
        enablePanDownToClose
      >
        {/* Search bar */}
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              height: 38,
              gap: 8,
            }}
          >
            <Search size={14} color={colors.muted} />
            <BottomSheetTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search inventory..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.heading,
                paddingVertical: 0,
                height: 38,
              }}
            />
          </View>
        </View>

        {/* Column headers + select all */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.screen,
          }}
        >
          <TouchableOpacity
            onPress={handleToggleAll}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: isAllSelected ? colors.teal : colors.border,
              backgroundColor: isAllSelected ? colors.teal + "20" : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            {isAllSelected && <Check size={12} color={colors.teal} />}
          </TouchableOpacity>
          <Text style={{ width: "25%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</Text>
          <Text style={{ width: "15%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>In Stock</Text>
          <Text style={{ width: "15%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Reorder</Text>
          <Text style={{ width: "15%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Cost</Text>
          <Text style={{ width: "20%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Vendor</Text>
        </View>

        {/* List */}
        <BottomSheetFlatList
          data={filteredInventory}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No inventory items found</Text>
            </View>
          }
        />

        {/* Bulk Actions Footer */}
        {selectedIds.length > 0 && (
          <View
            style={{
              position: "absolute",
              bottom: 16,
              left: 12,
              right: 12,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
              {selectedIds.length} selected
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={onClear}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onBulkUpdate}
                style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Bulk Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>
    );
  }
);

export default InventorySearchSheet;
