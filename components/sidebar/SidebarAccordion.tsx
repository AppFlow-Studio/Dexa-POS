import { SidebarNavigationItem } from "@/lib/sidebar-data";
import { Href, Link } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SidebarAccordionProps {
  item: SidebarNavigationItem;
  isExpanded: boolean;
  activeId: string | null;
  openAccordions: string[];
  onToggle: (id: string) => void;
  level?: number;
  activePath: string;
}

const SidebarAccordion: React.FC<SidebarAccordionProps> = ({
  item,
  isExpanded,
  activePath,
  activeId,
  openAccordions,
  onToggle,
  level = 0,
}) => {
  const { id, label, icon: Icon, subItems = [], href } = item;
  const isOpen = openAccordions.includes(id);

  const isChildActive = (items: SidebarNavigationItem[]): boolean => {
    return items.some(
      (child) =>
        child.href === activePath ||
        (child.subItems && isChildActive(child.subItems))
    );
  };
  const isActive = href === activePath || (!href && isChildActive(subItems));

  // Dynamic styles based on state
  const textColor = isActive ? "text-gray-800" : "text-gray-500";
  const iconColor = isActive ? "#374151" : "#6b7280";
  const indentation = level * 24; // 24px indentation for each level

  // When sidebar is collapsed, only render icons for top-level items
  if (!isExpanded) {
    if (Icon) {
      return (
        <TouchableOpacity
          // onPress={() => onLinkPress(id)}
          className="items-center justify-center p-3 my-1 rounded-lg"
        >
          <Icon
            color={isActive ? "#3b82f6" : "#4b5563"}
            size={24}
            strokeWidth={2.5}
          />
        </TouchableOpacity>
      );
    }
    return null; // Don't render sub-items in collapsed mode
  }

  // --- Expanded View ---

  // Case 1: The item is a simple link (no sub-items)
  if (href || subItems.length === 0) {
    const isSelected = activeId === id;

    return (
      <Link href={href as Href} asChild>
        <TouchableOpacity
          // onPress={() => onLinkPress(id)}
          style={{ paddingLeft: indentation + 16 }}
          className={`py-2.5 rounded-lg ${isSelected ? "bg-blue-50" : ""}`}
        >
          <Text className={`text-base font-semibold ${textColor}`}>
            {label}
          </Text>
        </TouchableOpacity>
      </Link>
    );
  }

  // Case 2: The item is an accordion (has sub-items)
  return (
    <View>
      <TouchableOpacity
        onPress={() => onToggle(id)}
        style={{ paddingLeft: level === 0 ? 16 : indentation + 16 }}
        className="flex-row items-center justify-between py-3 rounded-lg"
      >
        <View className="flex-row items-center">
          {Icon && <Icon className={textColor} size={22} strokeWidth={2} />}
          <Text className={`ml-4 text-base font-semibold ${textColor}`}>
            {label}
          </Text>
        </View>
        <ChevronDown
          style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
          className={textColor}
          size={20}
        />
      </TouchableOpacity>

      {/* Render Sub-Items Recursively */}
      {isOpen && (
        <View
          style={{
            marginLeft: level * 24 + (Icon ? 12 : 0),
            paddingLeft: Icon ? 28 : 16,
          }}
          className="border-l-2 border-gray-200"
        >
          {subItems.map((subItem) => (
            // The recursive call now correctly passes ALL necessary props
            <SidebarAccordion
              key={subItem.id}
              item={subItem}
              level={level + 1}
              isExpanded={isExpanded}
              activeId={activeId}
              openAccordions={openAccordions}
              onToggle={onToggle}
              activePath={activePath}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default SidebarAccordion;
