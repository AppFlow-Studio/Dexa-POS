import { logo } from "@/lib/image";
import { SIDEBAR_DATA } from "@/lib/sidebar-data";
import { Menu, X } from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import SidebarAccordion from "./sidebar/SidebarAccordion";
import SidebarLink from "./sidebar/SidebarLink";

const Sidebar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeId, setActiveId] = useState("home");
  const [openAccordions, setOpenAccordions] = useState<string[]>(["menu"]);

  const handleToggleAccordion = (id: string) => {
    setOpenAccordions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const containerWidth = isExpanded ? "w-64" : "w-20";

  return (
    <View
      className={`h-full bg-white p-4 border-r border-gray-200 transition-all duration-300 ${containerWidth}`}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        {isExpanded && (
          <View className="flex-row items-center">
            <Image source={logo} className="ml-4" />
            <Text className="ml-2 text-xl font-bold text-gray-800">
              MTechPOS
            </Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setIsExpanded(!isExpanded)}
          className="p-2"
        >
          {isExpanded ? (
            <X color="#4b5563" size={24} />
          ) : (
            <Menu color="#1f2937" size={26} />
          )}
        </TouchableOpacity>
      </View>

      {/* Navigation Items */}
      <View className="flex-1 space-y-1">
        {SIDEBAR_DATA.map((item) =>
          item.subItems ? (
            <SidebarAccordion
              key={item.id}
              item={item}
              isOpen={openAccordions.includes(item.id)}
              onToggle={() => handleToggleAccordion(item.id)}
              activeId={activeId}
              onSubItemPress={setActiveId}
              isExpanded={isExpanded}
            />
          ) : (
            <SidebarLink
              key={item.id}
              label={item.label}
              icon={item.icon}
              isActive={activeId === item.id}
              onPress={() => setActiveId(item.id)}
              isExpanded={isExpanded}
            />
          )
        )}
      </View>
    </View>
  );
};

export default Sidebar;
