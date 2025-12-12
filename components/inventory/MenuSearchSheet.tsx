import { MenuItemType } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Link } from "expo-router";
import { Check } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MenuSearchSheetProps {
  menuItems: MenuItemType[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

// ---------------------------------------------------------
// 1. Optimized Row Component
// ---------------------------------------------------------
const MenuItemRow = React.memo(
  ({
    item,
    isSelected,
    onToggle,
  }: {
    item: MenuItemType;
    isSelected: boolean;
    onToggle: (id: string) => void;
  }) => {
    // Stock Logic for Color
    const isLowStock =
      typeof item.stockQuantity === "number" &&
      typeof item.reorderThreshold === "number" &&
      item.stockQuantity <= item.reorderThreshold;

    return (
      <View className="flex-row items-center px-4 py-3 border-b border-gray-700">
        {/* Selection Checkbox - Optimized Hit Area */}
        <View className="w-[10%] mr-2">
          <TouchableOpacity
            onPress={() => onToggle(item.id)}
            activeOpacity={0.7}
            className={`h-6 w-6 items-center justify-center border rounded ${
              isSelected ? "bg-blue-600 border-blue-500" : "border-gray-500"
            }`}
          >
            {isSelected && <Check color="#fff" size={14} />}
          </TouchableOpacity>
        </View>

        {/* Content - Click to Navigate */}
        <Link href={`/inventory/menu-items/${item.id}`} asChild>
          <TouchableOpacity className="flex-1 flex-row items-center">
            {/* Name & Category */}
            <View className="flex-1 pr-2">
              <Text
                className="text-white text-lg font-semibold"
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text className="text-gray-400 text-sm" numberOfLines={1}>
                {Array.isArray(item.category)
                  ? item.category.join(", ")
                  : item.category}
              </Text>
            </View>

            {/* Price */}
            <View className="w-[20%] items-end mr-4">
              <Text className="text-gray-300 text-base">
                ${item.price.toFixed(2)}
              </Text>
            </View>

            {/* Stock (Read Only) */}
            <View className="w-[15%] items-end">
              <Text
                className={`text-base font-medium ${
                  isLowStock ? "text-red-400" : "text-gray-300"
                }`}
              >
                {typeof item.stockQuantity === "number"
                  ? `${item.stockQuantity}`
                  : "—"}
              </Text>
            </View>
          </TouchableOpacity>
        </Link>
      </View>
    );
  },
  // Custom Comparison for Performance
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.item.id === next.item.id &&
      prev.item.stockQuantity === next.item.stockQuantity
    );
  }
);

// ---------------------------------------------------------
// 2. Main Sheet Component
// ---------------------------------------------------------
const MenuSearchSheet = forwardRef<BottomSheet, MenuSearchSheetProps>(
  ({ menuItems, selectedIds, onToggle }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    // OPTIMIZATION: Local Set for O(1) lookup and Instant Feedback
    const [optimisticSelection, setOptimisticSelection] = useState<Set<string>>(
      new Set(selectedIds)
    );

    // Sync local state when parent props change (e.g. "Select All" pressed in parent)
    useEffect(() => {
      setOptimisticSelection(new Set(selectedIds));
    }, [selectedIds]);

    // THE FIX: Instant Update Wrapper
    const handleOptimisticToggle = useCallback(
      (id: string) => {
        // 1. Update UI Immediately (Instant Feedback)
        setOptimisticSelection((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });

        // 2. Update Parent in next frame (prevents UI freeze)
        requestAnimationFrame(() => {
          onToggle(id);
        });
      },
      [onToggle]
    );

    const filteredMenu = useMemo(() => {
      const seenIds = new Set<string>();
      const query = searchQuery.toLowerCase().trim();

      return menuItems.filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);

        if (!query) return true;

        const nameMatch = item.name.toLowerCase().includes(query);
        const catMatch = item.category.some(
          (c) => c && c.toLowerCase().includes(query)
        );

        return nameMatch || catMatch;
      });
    }, [menuItems, searchQuery]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      []
    );

    const renderItem = useCallback(
      ({ item }: { item: MenuItemType }) => {
        // Use .has() on Set (Much faster than Array.includes)
        const isSelected = optimisticSelection.has(item.id);

        return (
          <MenuItemRow
            item={item}
            isSelected={isSelected}
            onToggle={handleOptimisticToggle}
          />
        );
      },
      [optimisticSelection, handleOptimisticToggle]
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        topInset={60}
      >
        <View className="px-4 pb-2 pt-2 border-b border-gray-700">
          <BottomSheetTextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search menu items..."
            placeholderTextColor="#9CA3AF"
            style={{
              backgroundColor: "#212121",
              borderColor: "#374151",
              borderWidth: 1,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: "white",
              fontSize: 16,
            }}
          />
        </View>

        <BottomSheetFlatList
          data={filteredMenu}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          extraData={optimisticSelection}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
        />
      </BottomSheet>
    );
  }
);

export default MenuSearchSheet;
