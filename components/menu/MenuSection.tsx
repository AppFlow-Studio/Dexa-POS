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
import { Link } from "expo-router";
import {
  ChevronDown,
  Logs,
  PackagePlus,
  Search,
  Sofa,
  Table,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadingTransition } from "react-native-reanimated";
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
    isCategoryAvailableNow,
    categories,
    getItemPriceForCategory,
  } = useMenuStore();
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

  // Get current order type
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const currentOrderType = activeOrder?.order_type || "Take Away";
  const handleOrderTypeSelect = (orderType: string) => {
    if (activeOrderId) {
      updateActiveOrderDetails({ order_type: orderType as any });
    }
  };

  const handleMenuSelect = (menuName: string) => {
    setActiveMeal(menuName);
    setActiveCategory(
      menus.find((menu) => menu.name === menuName)?.categories[0] || ""
    );
    setIsMenuDialogOpen(false);
  };

  useEffect(() => {
    const filtered = menuItems.filter((item) => {
      const categoryMatch = item.category.includes(activeCategory);
      const categoryAvailable = isCategoryAvailableNow(activeCategory);
      return categoryMatch && categoryAvailable;
    });
    setFilteredMenuItems(filtered);
  }, [activeMeal, activeCategory, isCategoryAvailableNow]);
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
      });
    }
    return items;
  }, [filteredMenuItems]);
  // Show modifier screen when in fullscreen mode (both add and edit), otherwise show regular menu
  if (isOpen && mode === "fullscreen") {
    return <ModifierScreen />;
  }

  return (
    <>
      <View className="mt-6 flex-1 bg-[#212121]">
        <View className="flex flex-row items-center justify-between pb-4 px-4">
          <View className="flex-row items-center gap-4">
            <Text className="text-2xl font-bold text-white">Menu</Text>
            {/* Order Type Button */}
            <TouchableOpacity
              onPress={() => {
                // This will be handled by the OrderDetails button
              }}
              className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-2"
            >
              <Text className="text-white font-medium mr-2">Order Type:</Text>
              <Text className="text-blue-400 font-semibold">
                {typeof currentOrderType === "string"
                  ? currentOrderType
                  : (currentOrderType as any)?.label || "Take Away"}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Right Section: Search Bar - Now positioned at the bottom */}
          <View className="flex-1 flex-row justify-end items-center gap-x-2">
            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Menu")}
                className={`flex-row items-center bg-[#303030] rounded-lg px-4 py-3 justify-start ${activeTab == "Menu" ? "border-2 border-blue-400" : "border border-gray-600"}`}
              >
                <Table color="#9CA3AF" size={24} />
              </TouchableOpacity>
            </View>
            {/* Search Bar */}
            <View className="w-fit">
              <TouchableOpacity
                onPress={openSearch}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
              >
                <Search color="#9CA3AF" size={24} />
                {/* <Text className="text-gray-300 ml-4">Search</Text> */}
              </TouchableOpacity>
            </View>
            {/* Open Item */}
            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Open Item")}
                className={`flex-row items-center bg-[#303030]  rounded-lg px-4 py-3 justify-start ${activeTab == "Open Item" ? "border-2 border-blue-400" : "border border-gray-600"}`}
              >
                <PackagePlus color="#9CA3AF" size={24} />
              </TouchableOpacity>
            </View>

            <View className="w-fit">
              <Link
                href="/tables"
                // onPress={openSearch}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
              >
                <Sofa color="#9CA3AF" size={24} />
              </Link>
            </View>

            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Orders")}
                className={`flex-row items-center bg-[#303030] rounded-lg px-4 py-3 justify-start ${activeTab == "Orders" ? "border-2 border-blue-400" : "border border-gray-600"}`}
              >
                <Logs color="#9CA3AF" size={24} />
                <Text className="text-gray-300 ml-4">Orders</Text>
              </TouchableOpacity>
            </View>

            <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-fit bg-[#303030] border-gray-600 flex-row items-center gap-2 h-[58px]"
                >
                  <Text className="text-white font-medium text-xl">
                    {activeMeal}
                  </Text>
                  <ChevronDown color="#9CA3AF" size={20} />
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
                  {menus.map((menu) => (
                    <TouchableOpacity
                      key={menu.id}
                      onPress={() => handleMenuSelect(menu.name)}
                      className={`p-4 rounded-lg border ${
                        activeMeal === menu.name
                          ? "bg-blue-600 border-blue-400"
                          : "bg-[#303030] border-gray-600"
                      }`}
                    >
                      <Text
                        className={`font-semibold text-lg ${
                          activeMeal === menu.name ? "text-white" : "text-white"
                        }`}
                      >
                        {menu.name}
                      </Text>
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
                  ))}
                </ScrollView>
              </DialogContent>
            </Dialog>
          </View>
        </View>

        <View className="flex-1 px-4">
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

          {activeTab === "Menu" ? (
            <Animated.View key={"Menu"}>
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
                  if (item.name === "spacer") {
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
            </Animated.View>
          ) : activeTab === "Open Item" ? (
            <Animated.View key={"Open Item"} className={"flex-1"}>
              <OpenItemAdder />
            </Animated.View>
          ) : activeTab === "Orders" ? (
            <Animated.View
              key={"Orders"}
              layout={FadingTransition.duration(1000).delay(500)}
              className="flex-1"
            >
              <PreviousOrdersSection />
            </Animated.View>
          ) : null}
        </View>
      </View>

      {/* Order Type Drawer */}
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
