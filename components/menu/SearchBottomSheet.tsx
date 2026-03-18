import { bottomSheetTheme, colors } from "@/lib/theme";
import { MenuItemType, Schedule } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search, X } from "lucide-react-native";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SearchResultItem from "./SearchResultItem";

// Helper to check schedule availability
const isScheduleActive = (schedules: Schedule[] | undefined): boolean => {
  if (!schedules || schedules.length === 0) return true;

  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDay = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return schedules.some((schedule) => {
    if (!schedule.isActive) return false;
    if (!schedule.days.includes(currentDay)) return false;

    const [startH, startM] = schedule.startTime.split(":").map(Number);
    const [endH, endM] = schedule.endTime.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (endTotal < startTotal) {
      // Overnight schedule (e.g. 10PM to 2AM)
      return currentMinutes >= startTotal || currentMinutes <= endTotal;
    }
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  });
};

interface SearchSection {
  title: string;
  data: (MenuItemType & {
    menuName: string;
    displayPrice: number;
    isDisabled: boolean;
    disabledReason?: string;
    uniqueKey: string;
  })[];
}

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["85%"], []);
  const [searchText, setSearchText] = useState("");

  const { menus } = useMenuStore((state) => state);
  const { closeSearch, setSearchSheetRef } = useSearchStore();

  // Menu-Aware Search Logic
  const searchResults = useMemo<SearchSection[]>(() => {
    const trimmedSearch = searchText.trim().toLowerCase();

    const availableSections: SearchSection[] = [];
    const unavailableSections: SearchSection[] = [];

    menus.forEach((menu) => {
      // 1. Check Menu Schedule
      const isMenuAvailable = isScheduleActive(menu.schedules);
      const menuItems: SearchSection["data"] = [];

      menu.categories.forEach((category) => {
        // 2. Check Category Schedule (if categories have schedules?)
        // Assuming undefined schedules means available
        const isCategoryAvailable = isScheduleActive(category.schedules);

        category.items?.forEach((item) => {
          // 3. Match Search Text (show all items when search is empty)
          // 3. Match Search Text (show all items when search is empty)
          if (trimmedSearch) {
            const matchName = item.name.toLowerCase().includes(trimmedSearch);
            const matchDesc = item.description
              ?.toLowerCase()
              .includes(trimmedSearch);
            if (!matchName && !matchDesc) return;
          }

          // 4. Calculate Price (Menu > Category > Item)
          let price = item.price;
          if (
            item.menuPriceOverrides &&
            item.menuPriceOverrides[menu.id] !== undefined
          ) {
            price = item.menuPriceOverrides[menu.id];
          } else if (
            item.categoryPriceOverrides &&
            item.categoryPriceOverrides[category.id] !== undefined
          ) {
            price = item.categoryPriceOverrides[category.id];
          }

          // 5. Determine Availability
          let isDisabled = false;
          let disabledReason = undefined;

          if (item.availability === false) {
            isDisabled = true;
            disabledReason = "Out of Stock";
          } else if (!isMenuAvailable) {
            isDisabled = true;
            disabledReason = "Menu Unavailable";
          } else if (!isCategoryAvailable) {
            isDisabled = true;
            disabledReason = "Category Unavailable";
          }

          menuItems.push({
            ...item,
            uniqueKey: `${menu.id}-${category.id}-${item.id}`,
            menuName: menu.name,
            displayPrice: price,
            isDisabled,
            disabledReason,
          });
        });
      });

      if (menuItems.length > 0) {
        const section = {
          title: menu.name,
          data: menuItems,
        };

        if (isMenuAvailable) {
          availableSections.push(section);
        } else {
          unavailableSections.push(section);
        }
      }
    });

    return [...availableSections, ...unavailableSections];
  }, [searchText, menus]);

  useLayoutEffect(() => {
    setSearchSheetRef(searchSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSearchSheetRef]);

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
    <BottomSheet
      ref={searchSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={closeSearch}
      backdropComponent={renderBackdrop}
      keyboardBehavior="extend"
      backgroundStyle={{ backgroundColor: colors.screen }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      {...bottomSheetTheme}
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Search header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, backgroundColor: colors.panel, borderColor: colors.border }}>
              <Search color={colors.label} size={16} />
              <BottomSheetTextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search items..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, marginLeft: 10, color: colors.heading, fontSize: 14 }}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")}>
                  <X color={colors.muted} size={16} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={closeSearch}>
              <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "500" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        <BottomSheetScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >

        {/* Manual List Rendering */}
        <View className="px-5 mt-2">
          {searchResults.length === 0 ? (
            <View className="flex-1 items-center justify-center h-48 mt-10">
              <Search size={48} color={colors.muted} />
              <Text style={{ color: colors.muted, marginTop: 16, textAlign: "center" }}>
                {searchText
                  ? `No items found for "${searchText}"`
                  : "No menu items available"}
              </Text>
            </View>
          ) : (
            searchResults.map((section, sectionIndex) => (
              <View key={`section-${sectionIndex}`} className="mb-6">
                <View className="py-2 mb-1" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                    {section.title}
                  </Text>
                </View>

                {/* Section Items */}
                <View>
                  {section.data.map((item) => (
                    <SearchResultItem
                      key={item.uniqueKey}
                      item={item}
                      menuName={item.menuName}
                      displayPrice={item.displayPrice}
                      isDisabled={item.isDisabled}
                      disabledReason={item.disabledReason}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
});

export default SearchBottomSheet;
