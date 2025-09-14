import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { Link } from "expo-router";
import { Logs, PackagePlus, Search, SquareMenu, Table } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadingTransition, ReduceMotion } from "react-native-reanimated";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";
import ModifierScreen from "./ModifierScreen";
import OpenItemAdder from "./OpenItemAdder";
import OrderTypeDrawer from "./OrderTypeDrawer";
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
  const { menuItems, menus, isCategoryAvailableNow } = useMenuStore();
  const { activeOrderId, orders, updateActiveOrderDetails } = useOrderStore();
  const { isOpen: isOrderTypeDrawerOpen, closeDrawer } = useOrderTypeDrawerStore();
  const [activeTab, setActiveTab] = useState("Menu");
  const [activeMeal, setActiveMeal] = useState(menus[0].name);
  const [activeCategory, setActiveCategory] = useState(menus[0].categories[0]);
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
  useEffect(() => {
    const filtered = menuItems.filter((item) => {
      const categoryMatch = item.category.includes(activeCategory);
      const categoryAvailable = isCategoryAvailableNow(activeCategory);
      return categoryMatch && categoryAvailable;
    });
    setFilteredMenuItems(filtered);
  }, [activeMeal, activeCategory, isCategoryAvailableNow]);

  // Show modifier screen when in fullscreen mode (both add and edit), otherwise show regular menu
  if (isOpen && mode === "fullscreen") {
    return <ModifierScreen />;
  }
  console.log(activeOrder);

  return (
    <>
      <View className="mt-6 flex-1 border-gray-700 pr-4 bg-[#212121]">
        <View className="flex flex-row items-center justify-between pb-4">
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
              <Text className="text-blue-400 font-semibold">{typeof currentOrderType === 'string' ? currentOrderType : (currentOrderType as any)?.label || 'Take Away'}</Text>
            </TouchableOpacity>
          </View>
          {/* Right Section: Search Bar - Now positioned at the bottom */}
          <View className="flex-1 flex-row justify-end items-center gap-x-2">

            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Menu")}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start ${activeTab == "Menu" ? 'border-2 border-blue-400' : ''}`}
              >
                <SquareMenu color="#9CA3AF" size={20} />
                <Text className="text-gray-300 ml-4">Menu</Text>
              </TouchableOpacity>
            </View>
            {/* Search Bar */}
            <View className="w-fit">
              <TouchableOpacity
                onPress={openSearch}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
              >
                <Search color="#9CA3AF" size={20} />
                {/* <Text className="text-gray-300 ml-4">Search</Text> */}
              </TouchableOpacity>
            </View>
            {/* Open Item */}
            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Open Item")}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start ${activeTab == "Open Item" ? 'border-2 border-blue-400' : ''}`}
              >
                <PackagePlus color="#9CA3AF" size={20} />
              </TouchableOpacity>
            </View>

            <View className="w-fit">
              <Link href="/tables"
                // onPress={openSearch}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start`}
              >
                <Table color="#9CA3AF" size={20} />
              </Link>
            </View>

            <View className="w-fit">
              <TouchableOpacity
                onPress={() => setActiveTab("Orders")}
                className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 justify-start ${activeTab == "Orders" ? 'border-2 border-blue-400' : ''}`}
              >
                <Logs color="#9CA3AF" size={20} />
                <Text className="text-gray-300 ml-4">Orders</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {activeTab === "Menu" && <MenuControls
          activeMeal={activeMeal}
          onMealChange={(value) => { setActiveMeal(value); setActiveCategory(menus.find((menu) => menu.name === value)?.categories[0] || '') }}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />}

        {activeTab === "Menu" ?
          <Animated.View key={"Menu"} >
            <FlatList
              data={filteredMenuItems}
              keyExtractor={(item) => item.id}
              numColumns={4}
              className="mt-4 flex"
              contentContainerStyle={{  marginLeft : 'auto', width : '99%', alignSelf : 'center' }}
              showsVerticalScrollIndicator={false}
              columnWrapperStyle={{ gap: 16 }}
              removeClippedSubviews={false}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center h-48">
                  <Text className="text-gray-400 text-lg">
                    No items match the current filters.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <MenuItem
                  item={item}
                  imageSource={getImageSource(item)}
                  onOrderClosedCheck={onOrderClosedCheck}
                />
              )}
            />
          </Animated.View>
          : activeTab === "Open Item" ?
            <Animated.View key={"Open Item"} className={"flex-1"} layout={FadingTransition.reduceMotion(ReduceMotion.Never).duration(1000)
              .delay(500)
              .reduceMotion(ReduceMotion.Never)} >
              <OpenItemAdder />
            </Animated.View> : activeTab === "Orders" ?
              <Animated.View key={"Orders"} layout={FadingTransition.duration(1000)
                .delay(500)
                .reduceMotion(ReduceMotion.Never)} >
              </Animated.View> : null
        }
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
