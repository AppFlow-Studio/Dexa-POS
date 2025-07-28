import {
  BarChart3,
  Home, // Good icon for Dine-in / Tables
  LucideIcon,
  Menu,
  Package, // Good icon for the Restaurant/Store itself
  Settings,
  ShoppingBag, // Good icon for Dashboard/Reports
  ShoppingBasket, // Good icon for Products
  Store, // Good icon for Dine-in / Tables
  Users,
  UtensilsCrossed,
} from "lucide-react-native";
import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";

interface IconButtonProps {
  onPress: () => void;
  icon: LucideIcon;
  isActive: boolean;
}
// Reusable IconButton component
const IconButton = ({ onPress, icon: Icon, isActive }: IconButtonProps) => {
  // Define active and inactive colors
  const activeColor = "#3b82f6"; // blue-500
  const inactiveColor = "#6b7280"; // gray-500
  const iconColor = isActive ? activeColor : inactiveColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      className="p-3 my-2 rounded-lg relative items-center justify-center"
    >
      {/* Blue indicator bar for the active icon */}
      {isActive && <View className="absolute left-0 h-full w-1 bg-blue-500" />}
      <Icon color={iconColor} size={26} strokeWidth={isActive ? 2.5 : 2} />
    </TouchableOpacity>
  );
};

const Sidebar = () => {
  // State to track the active icon. 'home' is active by default.
  const [active, setActive] = useState("home");

  // Define the navigation items for the middle section
  const navItems = [
    { id: "home", icon: Home },
    { id: "tables", icon: UtensilsCrossed },
    { id: "users", icon: Users },
    { id: "bag", icon: ShoppingBag },
    { id: "inventory", icon: Package },
    { id: "dashboard", icon: BarChart3 },
  ];

  // Define the utility/settings items for the bottom section
  const utilityItems = [
    { id: "products", icon: ShoppingBasket },
    { id: "store", icon: Store },
    { id: "settings", icon: Settings },
  ];

  return (
    <View className="w-20 bg-white h-full p-2 flex-col justify-between items-center border-r border-gray-200">
      {/* Top Section: Menu Icon */}
      <View>
        <TouchableOpacity className="p-3 my-2 bg-gray-100 rounded-full">
          <Menu color="#1f2937" size={26} />
        </TouchableOpacity>

        {/* Main Navigation Icons */}
        <View className="mt-4">
          {navItems.map((item) => (
            <IconButton
              key={item.id}
              icon={item.icon}
              isActive={active === item.id}
              onPress={() => setActive(item.id)}
            />
          ))}
        </View>
      </View>

      {/* Bottom Section: Utility Icons */}
      <View>
        {utilityItems.map((item) => (
          <IconButton
            key={item.id}
            icon={item.icon}
            isActive={active === item.id}
            onPress={() => setActive(item.id)}
          />
        ))}
      </View>
    </View>
  );
};

export default Sidebar;
