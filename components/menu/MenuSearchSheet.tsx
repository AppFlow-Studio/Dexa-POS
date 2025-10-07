import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import { Search } from "lucide-react-native";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { CategoryCard } from "./CategoryCard";
import { DraggableMenu as MenuCard } from "./MenuCard";
import { MenuItemCard } from "./MenuItemCard";
import { ModifierGroupCard } from "./ModifierGroupCard";
import { ScheduleCard } from "./ScheduleCard";

type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuSearchSheetProps {
  activeTab: SidebarTab;
}

const MenuSearchSheet = forwardRef<BottomSheet, MenuSearchSheetProps>(
  ({ activeTab }, ref) => {
    const { closeSearch } = useMenuManagementSearchStore();
    const {
      menuItems,
      categories: storeCategories,
      menus: storeMenus,
      modifierGroups,
      deleteMenuItem,
      toggleItemAvailability,
      toggleMenuActive,
      isMenuAvailableNow,
    } = useMenuStore();
    const [searchQuery, setSearchQuery] = useState("");

    const searchResults = useMemo(() => {
      const query = searchQuery.toLowerCase().trim();

      // Always filter based on query for ALL tabs
      switch (activeTab) {
        case "items":
          return menuItems.filter((item) =>
            query ? item.name.toLowerCase().includes(query) : false
          );
        case "categories":
          return storeCategories.filter((cat) =>
            query ? cat.name.toLowerCase().includes(query) : false
          );
        case "menus":
          return storeMenus.filter((menu) =>
            query ? menu.name.toLowerCase().includes(query) : false
          );
        case "modifiers":
          return modifierGroups.filter((mod) =>
            query ? mod.name.toLowerCase().includes(query) : false
          );
        case "schedules":
          const scheduledMenus = storeMenus
            .filter((m) => {
              const hasSchedules = m.schedules && m.schedules.length > 0;
              const matchesSearch = m.name.toLowerCase().includes(query);
              return hasSchedules && matchesSearch;
            })
            .map((m) => ({
              ...m,
              type: "menu" as const,
              schedules: m.schedules || [],
            }));

          const scheduledCategories = storeCategories
            .filter((c) => {
              const hasSchedules = c.schedules && c.schedules.length > 0;
              const matchesSearch = c.name.toLowerCase().includes(query);
              return hasSchedules && matchesSearch;
            })
            .map((c) => ({
              ...c,
              type: "category" as const,
              schedules: c.schedules || [],
            }));

          return [...scheduledMenus, ...scheduledCategories];

        default:
          return [];
      }
    }, [
      searchQuery,
      activeTab,
      menuItems,
      storeCategories,
      storeMenus,
      modifierGroups,
    ]);

    useEffect(() => {
      setSearchQuery("");
    }, [activeTab]);

    const handleDeleteItem = (id: string) => {
      Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMenuItem(id),
        },
      ]);
    };

    const renderItem = ({ item }: { item: any }) => {
      switch (activeTab) {
        case "items":
          return (
            <View className="w-[48%] aspect-[3/4] mb-4">
              <MenuItemCard
                item={item}
                onEdit={(itemToEdit) => {
                  closeSearch();
                  router.push(`/menu/edit-item?itemId=${itemToEdit.id}`);
                }}
                onDelete={handleDeleteItem}
                onToggleAvailability={toggleItemAvailability}
              />
            </View>
          );
        case "categories":
          return (
            <CategoryCard
              categoryName={item.name}
              isExpanded={false}
              onToggleExpand={() => {}}
              onEdit={() => {
                closeSearch();
                router.push(`/menu/edit-category?id=${item.id}`);
              }}
            />
          );
        case "menus":
          const menu = { ...item, isAvailableNow: isMenuAvailableNow(item.id) };
          return (
            <MenuCard
              menu={menu}
              onToggleActive={() => toggleMenuActive(item.id)}
              onEdit={() => {
                closeSearch();
                router.push(`/menu/edit-menu?id=${item.id}`);
              }}
            />
          );
        case "modifiers":
          return (
            <ModifierGroupCard
              modifierGroup={item}
              onEdit={() => {
                closeSearch();
                router.push(`/menu/edit-modifier?id=${item.id}`);
              }}
            />
          );
        case "schedules":
          return <ScheduleCard item={item} />;
        default:
          return null;
      }
    };

    const numColumns = useMemo(
      () => (activeTab === "items" ? 2 : 1),
      [activeTab]
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={["85%", "90%"]}
        enablePanDownToClose
        onClose={closeSearch}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <BottomSheetView className="flex-1">
          <View className="p-4 border-b border-gray-700">
            <Text className="text-white text-xl font-bold">
              Search {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </Text>
          </View>
          <View className="p-4">
            <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3">
              <Search color="#9CA3AF" size={20} />
              <BottomSheetTextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={`Search for a ${activeTab.slice(0, -1)}...`}
                placeholderTextColor="#9CA3AF"
                className="flex-1 h-12 ml-2 text-white text-base"
              />
            </View>
          </View>
          <BottomSheetFlatList
            key={activeTab} // Using activeTab as key is smart for re-renders
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={numColumns}
            columnWrapperStyle={
              numColumns > 1 ? { justifyContent: "space-between" } : undefined
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
            ListEmptyComponent={
              <View className="items-center justify-center p-10">
                <Text className="text-lg text-gray-400">
                  {searchQuery
                    ? "No results found."
                    : "Start typing to search."}
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
