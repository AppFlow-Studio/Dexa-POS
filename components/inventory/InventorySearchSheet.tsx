import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InventoryItem, Vendor } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Link } from "expo-router";
import { Check, Edit, MoreHorizontal, Trash2 } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

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
    // Local state for 0ms lag
    const [isSelected, setIsSelected] = useState(initialIsSelected);

    // Sync if parent changes (e.g. Select All)
    useEffect(() => {
      setIsSelected(initialIsSelected);
    }, [initialIsSelected]);

    const handlePress = useCallback(() => {
      setIsSelected((prev) => !prev);
      onToggle(item.id);
    }, [item.id, onToggle]);

    const isLowStock = item.stockQuantity <= item.reorderThreshold;

    return (
      <View className="flex-row items-center px-4 py-3 border-b border-border h-16">
        {/* Checkbox (6%) */}
        <View className="w-[6%] mr-2">
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.7}
            className={`h-6 w-6 items-center justify-center border rounded ${
              isSelected ? "bg-blue-600 border-blue-500" : "border-border"
            }`}
          >
            {isSelected && <Check color="#fff" size={14} />}
          </TouchableOpacity>
        </View>

        {/* Content Container (Remaining Width) */}
        <Link href={`/inventory/ingredient-items/${item.id}`} asChild>
          <TouchableOpacity className="flex-1 flex-row items-center">
            {/* Name (25%) */}
            <Text
              className="w-[25%] text-lg font-semibold text-white pr-2"
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {/* Stock (15%) */}
            <View className="w-[15%] items-center justify-center">
              <Text
                className={`text-lg font-semibold ${
                  isLowStock ? "text-red-400" : "text-white"
                }`}
                numberOfLines={1}
              >
                {item.stockQuantity?.toFixed(0)} {item.unit}
              </Text>
            </View>

            {/* Reorder (15%) */}
            <View className="w-[15%] items-center justify-center">
              <Text className="text-lg text-gray-300" numberOfLines={1}>
                {item.reorderThreshold}
              </Text>
            </View>

            {/* Cost (15%) */}
            <Text className="w-[15%] text-lg text-gray-300" numberOfLines={1}>
              ${item.cost.toFixed(2)}
            </Text>

            {/* Vendor (20%) */}
            <Text className="w-[20%] text-lg text-gray-300" numberOfLines={1}>
              {vendorName}
            </Text>
          </TouchableOpacity>
        </Link>

        {/* Actions (Floating Right) */}
        <View className="absolute right-2 top-0 bottom-0 justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="p-3">
                <MoreHorizontal size={24} color={colors.label} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-panel border-border">
              <DropdownMenuItem onPress={onEdit}>
                <Edit className="mr-2 h-5 w-5" color={colors.label} />
                <Text className="text-lg text-white">Edit Item</Text>
              </DropdownMenuItem>
              <DropdownMenuItem onPress={onDelete}>
                <Trash2 className="mr-2 h-5 w-5" color={colors.danger} />
                <Text className="text-lg text-red-400">Delete Item</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      </View>
    );
  },
  // Performance comparison
  (prev, next) => {
    return (
      prev.initialIsSelected === next.initialIsSelected &&
      prev.item.id === next.item.id &&
      prev.item.stockQuantity === next.item.stockQuantity
    );
  }
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

    // Create Set for fast lookups
    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    // Filter & Deduplicate
    const filteredInventory = useMemo(() => {
      const seenIds = new Set<string>();
      const query = searchQuery.trim().toLowerCase();

      return inventoryItems.filter((i) => {
        // Fix Duplicate Key Error
        if (seenIds.has(i.id)) return false;
        seenIds.add(i.id);

        if (!query) return true;
        return [i.name, i.category].some((s) =>
          String(s).toLowerCase().includes(query)
        );
      });
    }, [searchQuery, inventoryItems]);

    const isAllSelected =
      filteredInventory.length > 0 &&
      selectedIds.length >= filteredInventory.length;

    const handleToggleAll = () => {
      if (isAllSelected) {
        onClear();
      } else {
        onToggleAll(filteredInventory.map((i) => i.id));
      }
    };

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
      []
    );

    const renderItem = useCallback(
      ({ item }: { item: InventoryItem }) => {
        const vendor = vendors.find((v) => v.id === item.vendorId);
        return (
          <InventorySearchRow
            item={item}
            vendorName={vendor?.name || "Unknown"}
            initialIsSelected={selectedIdsSet.has(item.id)}
            onToggle={onToggle}
            onEdit={() => {
              // @ts-ignore - Close sheet logic handles in parent or here
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
        {/* Search Header */}
        <View className="px-3 pb-2 pt-2 border-b border-border bg-panel">
          <BottomSheetTextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search inventory..."
            placeholderTextColor={colors.label}
            style={{
              backgroundColor: colors.screen,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: "white",
              fontSize: 16,
            }}
          />
        </View>

        {/* Select All Header */}
        <View className="flex-row items-center px-4 py-2 border-b border-border bg-panel">
          <View className="w-[6%] mr-2">
            <TouchableOpacity
              onPress={handleToggleAll}
              className="h-5 w-5 items-center justify-center border border-border rounded"
            >
              {isAllSelected && <Check color="#fff" size={12} />}
            </TouchableOpacity>
          </View>
          <Text className="text-gray-400 text-sm font-medium">Select All</Text>
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
        />

        {/* Bulk Actions Footer */}
        {selectedIds.length > 0 && (
          <View className="absolute bottom-5 left-4 right-4 bg-screen p-4 rounded-xl border border-border shadow-xl flex-row items-center justify-between">
            <Text className="text-white font-semibold">
              {selectedIds.length} items selected
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClear}
                className="px-4 py-2 bg-gray-700 rounded-lg"
              >
                <Text className="text-white font-medium">Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onBulkUpdate}
                className="px-4 py-2 bg-blue-600 rounded-lg"
              >
                <Text className="text-white font-medium">Bulk Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>
    );
  }
);

export default InventorySearchSheet;
