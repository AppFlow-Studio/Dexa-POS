import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { Link } from "expo-router";
import {
  ChevronDown,
  Clock,
  Logs,
  PackagePlus,
  Search,
  Sofa,
  Table,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";
import ModifierScreen from "./ModifierScreen";
import OpenItemAdder from "./OpenItemAdder";
import OrderTypeDrawer from "./OrderTypeDrawer";
import PreviousOrdersSection from "./PreviousOrdersSection";
interface MenuSectionProps {
  onOrderClosedCheck?: () => boolean;
}

// Get image source for preview
const getImageSource = (item: MenuItemType) => {
  if (item.image && item.image.length > 200) {
    return { uri: `data:image/jpeg;base64,${item.image}` };
  }

  if (item.image) {
    // Try to get image from assets
    try {
      return MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP];
    } catch {
      return undefined;
    }
  }

  return undefined;
};
const MenuSection: React.FC<MenuSectionProps> = ({ onOrderClosedCheck }) => {
  // State for the active filters
  const {
    menuItems,
    menus,
    isMenuAvailableNow,
    temporaryActiveMenus,
    isCategoryAvailableNow,
    categories,
    getItemPriceForCategory,
  } = useMenuStore();
  const { requestPinOverride } = usePinOverrideStore();

  const { activeOrderId, orders, updateActiveOrderDetails } = useOrderStore();
  const { isOpen: isOrderTypeDrawerOpen, closeDrawer } =
    useOrderTypeDrawerStore();
  const [activeTab, setActiveTab] = useState("Menu");
  const [activeMeal, setActiveMeal] = useState(menus[0].name);
  const [activeCategory, setActiveCategory] = useState(menus[0].categories[0]);
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const { isOpen, mode, cartItem, close } = useModifierSidebarStore();

  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    []
  );
  const { openSearch } = useSearchStore();

  // Tick each minute to refresh availability indicators
  const [availabilityTick, setAvailabilityTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAvailabilityTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Get current order type
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const currentOrderType = activeOrder?.order_type || "Takeaway";
  const handleOrderTypeSelect = (orderType: string) => {
    if (activeOrderId) {
      updateActiveOrderDetails({ order_type: orderType as any });
    }
  };

  const handleMenuSelect = (menuName: string) => {
    const menu = menus.find((m) => m.name === menuName);
    if (!menu) return;

    const isAvailable =
      isMenuAvailableNow(menu.id) || temporaryActiveMenus.includes(menu.name);

    if (isAvailable) {
      setActiveMeal(menuName);
      setActiveCategory(menu.categories[0] || "");
      setIsMenuDialogOpen(false);
    } else {
      // Request override
      requestPinOverride({ type: "select_menu", payload: { menuName } });
    }
  };

  // Compute next availability window for the active category
  const nextAvailability = useMemo(() => {
    const cat = categories.find((c) => c.name === activeCategory);
    const rules = (cat?.schedules || []).filter((r) => r.isActive);
    const availableNow = isCategoryAvailableNow(activeCategory);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();

    let bestStart: Date | null = null;
    let bestEnd: Date | null = null;

    // Search up to two weeks ahead for the next window
    for (let offset = 0; offset < 14 && !availableNow; offset++) {
      const check = new Date(now);
      check.setDate(now.getDate() + offset);
      const dayKey = dayNames[check.getDay()];
      const todays = rules.filter((r) => r.days.includes(dayKey as any));
      for (const r of todays) {
        const [sh, sm] = r.startTime.split(":").map(Number);
        const [eh, em] = r.endTime.split(":").map(Number);
        const start = new Date(check);
        start.setHours(sh, sm || 0, 0, 0);
        const end = new Date(check);
        end.setHours(eh, em || 0, 0, 0);
        if (start > now) {
          if (!bestStart || start < bestStart) {
            bestStart = start;
            bestEnd = end;
          }
        }
      }
      if (bestStart) break;
    }

    return { availableNow, start: bestStart, end: bestEnd };
  }, [activeCategory, categories, isCategoryAvailableNow, availabilityTick]);

  useEffect(() => {
    const filtered = menuItems.filter((item) => {
      const categoryMatch = item.category.includes(activeCategory);
      const categoryAvailable = isCategoryAvailableNow(activeCategory);
      return categoryMatch && categoryAvailable;
    });
    setFilteredMenuItems(filtered);
  }, [
    activeMeal,
    activeCategory,
    isCategoryAvailableNow,
    menuItems,
    availabilityTick,
  ]);
  const numColumns = 4;
  const dataWithSpacers = useMemo(() => {
    const items = [...filteredMenuItems];
    const numberOfElementsLastRow = items.length % numColumns;
    if (numberOfElementsLastRow === 0) {
      return items;
    }
    const numberOfSpacers = numColumns - numberOfElementsLastRow;
    for (let i = 0; i < numberOfSpacers; i++) {
      items.push({
        id: `spacer-${i}`,
        name: "spacer",
        price: 0,
        category: [],
        meal: [],
      } as any);
    }
    return items;
  }, [filteredMenuItems]);
  // Show modifier screen when in fullscreen mode (both add and edit), otherwise show regular menu
  if (isOpen && mode === "fullscreen") {
    return <ModifierScreen />;
  }

  const formatTime = (d?: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <>
      <View className="mt-4 flex-1 bg-[#212121]">
        <View className="flex flex-row items-center justify-between pb-3">
          <View className="flex-row items-center gap-3">
            <Text className="text-xl font-bold text-white">Menu</Text>
            <TouchableOpacity
              onPress={() => {}}
              className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 py-2"
            >
              <Text className="text-white font-medium mr-2 text-base">
                Order Type:
              </Text>
              <Text className="text-blue-400 font-semibold text-base">
                {typeof currentOrderType === "string"
                  ? currentOrderType
                  : (currentOrderType as any)?.label || "Takeaway"}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-1 flex-row justify-end items-center gap-x-2">
            <TouchableOpacity
              onPress={() => setActiveTab("Menu")}
              className={`flex-row items-center bg-[#303030] rounded-lg p-3 justify-start ${
                activeTab == "Menu"
                  ? "border-2 border-blue-400"
                  : "border border-gray-600"
              }`}
            >
              <Table color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openSearch}
              className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg p-3 justify-start`}
            >
              <Search color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("Open Item")}
              className={`flex-row items-center bg-[#303030] rounded-lg p-3 justify-start ${
                activeTab == "Open Item"
                  ? "border-2 border-blue-400"
                  : "border border-gray-600"
              }`}
            >
              <PackagePlus color="#9CA3AF" size={20} />
            </TouchableOpacity>

            <Link
              href="/tables"
              className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg p-3 justify-start`}
            >
              <Sofa color="#9CA3AF" size={20} />
            </Link>

            <TouchableOpacity
              onPress={() => setActiveTab("Orders")}
              className={`flex-row items-center bg-[#303030] rounded-lg px-3 py-2.5 justify-start ${
                activeTab == "Orders"
                  ? "border-2 border-blue-400"
                  : "border border-gray-600"
              }`}
            >
              <Logs color="#9CA3AF" size={20} />
              <Text className="text-gray-300 ml-2 text-base">Orders</Text>
            </TouchableOpacity>

            <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-fit bg-[#303030] border-gray-600 flex-row items-center gap-2 h-14"
                >
                  <Text className="text-white font-medium text-lg">
                    {activeMeal}
                  </Text>
                  <ChevronDown color="#9CA3AF" size={18} />
                </Button>
              </DialogTrigger>
              <DialogContent className="min-w-2xl w-[500px] aspect-square bg-[#212121] border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white text-center">
                    Select Menu
                  </DialogTitle>
                </DialogHeader>
                <ScrollView
                  className="gap-3 mt-4 w-full"
                  contentContainerStyle={{ gap: 16 }}
                >
                  {menus.map((menu) => {
                    const isAvailable =
                      isMenuAvailableNow(menu.id) ||
                      temporaryActiveMenus.includes(menu.name);
                    const isScheduled =
                      menu.schedules && menu.schedules.length > 0;

                    return (
                      <TouchableOpacity
                        key={menu.id}
                        onPress={() => handleMenuSelect(menu.name)}
                        className={`p-4 rounded-lg border mb-3 ${
                          activeMeal === menu.name
                            ? "bg-blue-600 border-blue-400"
                            : !isAvailable
                            ? "bg-gray-700 border-gray-600 opacity-60"
                            : "bg-[#303030] border-gray-600"
                        }`}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text className="font-semibold text-lg text-white">
                            {menu.name}
                          </Text>
                          {isScheduled && <Clock size={16} color="#9CA3AF" />}
                        </View>
                        <Text
                          className={`text-sm mt-1 ${
                            activeMeal === menu.name
                              ? "text-blue-100"
                              : "text-gray-400"
                          }`}
                        >
                          {menu.description}
                        </Text>
                        <View className="flex-row flex-wrap gap-1 mt-2">
                          {menu.categories.map((category, index) => (
                            <View
                              key={index}
                              className={`px-2 py-1 rounded-full ${
                                activeMeal === menu.name
                                  ? "bg-blue-500"
                                  : "bg-gray-600"
                              }`}
                            >
                              <Text
                                className={`text-xs ${
                                  activeMeal === menu.name
                                    ? "text-white"
                                    : "text-gray-300"
                                }`}
                              >
                                {category}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </DialogContent>
            </Dialog>
          </View>
        </View>

        <View className="flex-1">
          {activeTab === "Menu" && (
            <MenuControls
              activeMeal={activeMeal}
              onMealChange={(value) => {
                setActiveMeal(value);
                setActiveCategory(
                  menus.find((menu) => menu.name === value)?.categories[0] || ""
                );
              }}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />
          )}

          {/* Availability indicator for active category */}
          {/* {activeTab === "Menu" && (
            <View className="mt-3 mb-1 flex-row items-center gap-3">
              <View
                className={`px-3 py-2 rounded-full ${nextAvailability.availableNow
                    ? "bg-green-900/30 border border-green-500"
                    : "bg-red-900/30 border border-red-500"
                  }`}
              >
                <Text
                  className={`text-sm ${nextAvailability.availableNow ? "text-green-400" : "text-red-400"
                    }`}
                >
                  {nextAvailability.availableNow ? "Available now" : "Unavailable now"}
                </Text>
              </View>
              {!nextAvailability.availableNow && (
                <Text className="text-sm text-gray-300">
                  {(() => {
                    const s = nextAvailability.start as Date | null | undefined;
                    const e = nextAvailability.end as Date | null | undefined;
                    return s
                      ? `Next: ${s.toLocaleDateString(undefined, { weekday: "short" })} ${formatTime(s)} – ${formatTime(e)}`
                      : "No upcoming window";
                  })()}
                </Text>
              )}
            </View>
          )} */}

          {activeTab === "Menu" ? (
            <View key={"Menu"}>
              <FlatList
                data={dataWithSpacers}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                className="mt-4 mb-20"
                showsVerticalScrollIndicator={false}
                columnWrapperStyle={{
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
                ListEmptyComponent={
                  <View className="flex-1 items-center justify-center h-48">
                    <Text className="text-gray-400 text-lg">
                      No items match the current filters.
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  if ((item as any).name === "spacer") {
                    return <View className="w-[23%]" />;
                  }

                  const currentCategory = categories.find(
                    (cat) => cat.name === activeCategory
                  );
                  const categoryId = currentCategory?.id;
                  return (
                    <MenuItem
                      item={item}
                      imageSource={getImageSource(item)}
                      onOrderClosedCheck={onOrderClosedCheck}
                      categoryId={categoryId}
                      getItemPriceForCategory={getItemPriceForCategory}
                    />
                  );
                }}
              />
            </View>
          ) : activeTab === "Open Item" ? (
            <View key={"Open Item"} className={"flex-1"}>
              <OpenItemAdder />
            </View>
          ) : activeTab === "Orders" ? (
            <View key={"Orders"} className="flex-1">
              <PreviousOrdersSection />
            </View>
          ) : null}
        </View>
      </View>

      <OrderTypeDrawer
        isVisible={isOrderTypeDrawerOpen}
        onClose={closeDrawer}
        onOrderTypeSelect={handleOrderTypeSelect}
        currentOrderType={currentOrderType}
      />
    </>
  );
};

export default MenuSection;
