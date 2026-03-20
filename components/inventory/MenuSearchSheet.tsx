import { bottomSheetTheme, colors } from "@/lib/theme";
import { MenuItemType } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Link } from "expo-router";
import { AlertTriangle, Check, Search } from "lucide-react-native";
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
    const isLowStock =
      typeof item.stockQuantity === "number" &&
      typeof item.reorderThreshold === "number" &&
      item.stockQuantity <= item.reorderThreshold;

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
          onPress={() => onToggle(item.id)}
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
        <Link href={`/inventory/menu-items/${item.id}`} asChild>
          <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            {/* Name & Category */}
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}
              >
                {item.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                {Array.isArray(item.category) ? item.category.join(", ") : item.category}
              </Text>
            </View>

            {/* Price */}
            <Text
              style={{ width: "18%", fontSize: 12, color: colors.label, textAlign: "right", paddingRight: 12 }}
              numberOfLines={1}
            >
              ${item.price.toFixed(2)}
            </Text>

            {/* Stock */}
            <View style={{ width: "15%", alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 4 }}>
              {isLowStock && <AlertTriangle size={11} color={colors.warning} />}
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, fontWeight: "600", color: isLowStock ? colors.warning : colors.label }}
              >
                {typeof item.stockQuantity === "number" ? item.stockQuantity : "—"}
              </Text>
            </View>
          </TouchableOpacity>
        </Link>
      </View>
    );
  },
  (prev, next) =>
    prev.isSelected === next.isSelected &&
    prev.item.id === next.item.id &&
    prev.item.stockQuantity === next.item.stockQuantity
);

const MenuSearchSheet = forwardRef<BottomSheet, MenuSearchSheetProps>(
  ({ menuItems, selectedIds, onToggle }, ref) => {
    const [searchQuery, setSearchQuery] = useState("");
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const [optimisticSelection, setOptimisticSelection] = useState<Set<string>>(
      new Set(selectedIds)
    );

    useEffect(() => {
      setOptimisticSelection(new Set(selectedIds));
    }, [selectedIds]);

    const handleOptimisticToggle = useCallback(
      (id: string) => {
        setOptimisticSelection((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
        requestAnimationFrame(() => onToggle(id));
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
        return (
          item.name.toLowerCase().includes(query) ||
          item.category.some((c) => c && c.toLowerCase().includes(query))
        );
      });
    }, [menuItems, searchQuery]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      ),
      []
    );

    const renderItem = useCallback(
      ({ item }: { item: MenuItemType }) => (
        <MenuItemRow
          item={item}
          isSelected={optimisticSelection.has(item.id)}
          onToggle={handleOptimisticToggle}
        />
      ),
      [optimisticSelection, handleOptimisticToggle]
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        topInset={60}
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
              placeholder="Search menu items..."
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

        {/* Column headers */}
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
          <View style={{ width: 30 }} />
          <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</Text>
          <Text style={{ width: "18%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right", paddingRight: 12 }}>Price</Text>
          <Text style={{ width: "15%", fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Stock</Text>
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
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No menu items found</Text>
            </View>
          }
        />
      </BottomSheet>
    );
  }
);

export default MenuSearchSheet;
