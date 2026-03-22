import { bottomSheetTheme, colors } from "@/lib/theme";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import {
  Eye,
  EyeOff,
  Layers,
  ListOrdered,
  Search,
  Settings,
  Sliders,
  Utensils,
  X,
} from "lucide-react-native";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { ScheduleCard } from "./ScheduleCard";

type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

const TAB_ICON: Record<SidebarTab, React.ComponentType<any>> = {
  menus: Layers,
  categories: ListOrdered,
  items: Utensils,
  modifiers: Sliders,
  schedules: Settings,
};

interface MenuSearchSheetProps {
  activeTab: SidebarTab;
}

const MenuSearchSheet = forwardRef<BottomSheet, MenuSearchSheetProps>(
  ({ activeTab }, ref) => {
    const { closeSearch } = useMenuManagementSearchStore();
    const menuItems = useMenuStore((s) => s.menuItems);
    const storeCategories = useMenuStore((s) => s.categories);
    const storeMenus = useMenuStore((s) => s.menus);
    const modifierGroups = useMenuStore((s) => s.modifierGroups);
    const deleteMenuItem = useMenuStore((s) => s.deleteMenuItem);
    const toggleItemAvailability = useMenuStore((s) => s.toggleItemAvailability);
    const toggleMenuActive = useMenuStore((s) => s.toggleMenuActive);
    const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
      setSearchQuery("");
    }, [activeTab]);

    const searchResults = useMemo(() => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return [];

      switch (activeTab) {
        case "items":
          return menuItems.filter((item) =>
            item.name.toLowerCase().includes(query)
          );
        case "categories":
          return storeCategories.filter((cat) =>
            cat.name.toLowerCase().includes(query)
          );
        case "menus":
          return storeMenus.filter((menu) =>
            menu.name.toLowerCase().includes(query)
          );
        case "modifiers":
          return modifierGroups.filter((mod) =>
            mod.name.toLowerCase().includes(query)
          );
        case "schedules": {
          const scheduledMenus = storeMenus
            .filter(
              (m) =>
                m.schedules?.length &&
                m.name.toLowerCase().includes(query)
            )
            .map((m) => ({ ...m, type: "menu" as const, schedules: m.schedules || [] }));
          const scheduledCategories = storeCategories
            .filter(
              (c) =>
                c.schedules?.length &&
                c.name.toLowerCase().includes(query)
            )
            .map((c) => ({ ...c, type: "category" as const, schedules: c.schedules || [] }));
          return [...scheduledMenus, ...scheduledCategories];
        }
        default:
          return [];
      }
    }, [searchQuery, activeTab, menuItems, storeCategories, storeMenus, modifierGroups]);

    const groupedResults = useMemo(() => {
      const map: Record<string, any[]> = {};
      for (const item of searchResults) {
        const first = ((item as any).name || "?")[0].toUpperCase();
        const key = /[A-Z]/.test(first) ? first : "#";
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
      const letters = Object.keys(map).sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      });
      return letters.map((letter) => ({ title: letter, data: map[letter] }));
    }, [searchResults]);

    const handleDeleteItem = (id: string) =>
      Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMenuItem(id) },
      ]);

    const TabIcon = TAB_ICON[activeTab];
    const tabLabel = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

    const renderItem = ({ item }: { item: any }) => {
      switch (activeTab) {
        case "items": {
          const isAvailable = item.availability !== false;
          return (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                marginBottom: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                  ${item.price.toFixed(2)}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: isAvailable ? colors.success + "20" : colors.danger + "15",
                  borderWidth: 1,
                  borderColor: isAvailable ? colors.success + "50" : colors.danger + "30",
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: isAvailable ? colors.success : colors.danger }}>
                  {isAvailable ? "Available" : "Off"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleItemAvailability(item.id)}
                style={{ padding: 6 }}
              >
                {isAvailable
                  ? <EyeOff size={14} color={colors.label} />
                  : <Eye size={14} color={colors.label} />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteItem(item.id)}
                style={{ padding: 6 }}
              >
                <X size={13} color={colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { closeSearch(); router.push(`/menu/edit-item?itemId=${item.id}`); }}
                style={{
                  padding: 6,
                  backgroundColor: colors.panel,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Settings size={13} color={colors.label} />
              </TouchableOpacity>
            </View>
          );
        }

        case "categories": {
          const isActive = item.isActive;
          return (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                marginBottom: 6,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.heading }}>
                {item.name}
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: isActive ? colors.success + "20" : colors.danger + "15",
                  borderWidth: 1,
                  borderColor: isActive ? colors.success + "50" : colors.danger + "30",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: isActive ? colors.success : colors.danger }}>
                  {isActive ? "Active" : "Inactive"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { closeSearch(); router.push(`/menu/edit-category?id=${item.id}`); }}
                style={{
                  padding: 6,
                  backgroundColor: colors.panel,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Settings size={13} color={colors.label} />
              </TouchableOpacity>
            </View>
          );
        }

        case "menus": {
          const isActive = item.isActive;
          const isAvailableNow = isMenuAvailableNow(item.id);
          const statusOk = isActive && isAvailableNow;
          return (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                marginBottom: 6,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.heading }}>
                {item.name}
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: statusOk ? colors.success + "20" : colors.danger + "15",
                  borderWidth: 1,
                  borderColor: statusOk ? colors.success + "50" : colors.danger + "30",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: statusOk ? colors.success : colors.danger }}>
                  {isActive ? (isAvailableNow ? "Available" : "Unavailable") : "Inactive"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleMenuActive(item.id)}
                style={{ padding: 6, marginRight: 4 }}
              >
                {isActive
                  ? <Eye size={14} color={colors.success} />
                  : <EyeOff size={14} color={colors.danger} />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { closeSearch(); router.push(`/menu/edit-menu?id=${item.id}`); }}
                style={{
                  padding: 6,
                  backgroundColor: colors.panel,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Settings size={13} color={colors.label} />
              </TouchableOpacity>
            </View>
          );
        }

        case "modifiers": {
          const isRequired = item.type === "required";
          return (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
                marginBottom: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.heading }} numberOfLines={1}>
                {item.name}
              </Text>
              <View
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: isRequired ? colors.danger + "15" : colors.teal + "15",
                  borderWidth: 1,
                  borderColor: isRequired ? colors.danger + "30" : colors.teal + "30",
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: isRequired ? colors.danger : colors.teal }}>
                  {isRequired ? "Required" : "Optional"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { closeSearch(); router.push(`/menu/edit-modifier?id=${item.id}`); }}
                style={{
                  padding: 6,
                  backgroundColor: colors.panel,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Settings size={13} color={colors.label} />
              </TouchableOpacity>
            </View>
          );
        }

        case "schedules":
          return <ScheduleCard item={item} />;

        default:
          return null;
      }
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={["55%"]}
        enablePanDownToClose
        onClose={closeSearch}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        {...bottomSheetTheme}
      >
        <BottomSheetView style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TabIcon size={14} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>
                Search {tabLabel}
              </Text>
            </View>
            <TouchableOpacity
              onPress={closeSearch}
              style={{
                padding: 6,
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
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
                gap: 8,
              }}
            >
              <Search size={14} color={colors.muted} />
              <BottomSheetTextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={`Search ${activeTab}…`}
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  height: 38,
                  fontSize: 13,
                  color: colors.heading,
                }}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={13} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results */}
          <BottomSheetSectionList
            key={activeTab}
            sections={groupedResults}
            keyExtractor={(item) => item.id}
            renderSectionHeader={({ section }) => (
              <View style={{ paddingVertical: 4, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4, marginTop: 8 }}>
                <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{section.title}</Text>
              </View>
            )}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 32, gap: 8 }}>
                <Search size={24} color={colors.muted} />
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {searchQuery ? "No results found." : "Start typing to search."}
                </Text>
              </View>
            }
          />
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

export default MenuSearchSheet;
