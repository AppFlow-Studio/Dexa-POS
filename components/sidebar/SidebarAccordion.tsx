import { SidebarNavigationItem } from "@/lib/sidebar-data";
import { Href, Link } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SidebarLink from "./SidebarLink";

interface SidebarAccordionProps {
  item: SidebarNavigationItem;
  isExpanded: boolean;
  activePath: string;
  openAccordions: string[];
  onToggle: (id: string) => void;
  onExpand: () => void; // Function to expand the sidebar
  level?: number;
}

const SidebarAccordion: React.FC<SidebarAccordionProps> = ({
  item,
  isExpanded,
  activePath,
  openAccordions,
  onToggle,
  onExpand, // Receive the handler
  level = 0,
}) => {
  const { id, label, icon: Icon, subItems = [], href } = item;
  const hasSubItems = subItems.length > 0;
  const isOpen = openAccordions.includes(id);

  const isChildActive = (items: SidebarNavigationItem[]): boolean => {
    return items.some(
      (child) =>
        child.href === activePath ||
        (child.subItems && isChildActive(child.subItems))
    );
  };
  const isActive = href === activePath || (!href && isChildActive(subItems));
  const indentation = level * 4; // 4px indentation for each level

  const handlePress = () => {
    // If the sidebar is collapsed...
    if (!isExpanded) {
      // ...and the item has children, expand the sidebar and open the accordion.
      if (hasSubItems) {
        onExpand();
        onToggle(id);
      }
      // If it doesn't have children, the <Link> component will handle navigation automatically.
    } else {
      // If the sidebar is already expanded, just toggle the accordion.
      if (hasSubItems) {
        onToggle(id);
      }
      // If it has no sub-items, the <Link> will navigate.
    }
  };

  // When sidebar is collapsed, only render icons for top-level items
  if (!isExpanded) {
    return (
      <Link href={(href || activePath) as Href} asChild>
        <SidebarLink
          label={label}
          icon={Icon}
          isActive={isActive}
          isExpanded={false}
          onCustomPress={handlePress}
        />
      </Link>
    );
  }

  // --- Expanded View ---

  // Case 1: The item is a simple link (no sub-items)
  if (href || subItems.length === 0) {
    return (
      <Link href={href as Href} asChild>
        <SidebarLink
          label={label}
          icon={Icon}
          isActive={isActive}
          isExpanded={isExpanded}
        />
      </Link>
    );
  }

  // Case 2: The item is an accordion (has sub-items)
  return (
    <View>
      <TouchableOpacity
        onPress={() => onToggle(id)}
        style={{ paddingLeft: level === 0 ? 8 : indentation + 8 }}
        className="flex-row items-center justify-between py-3 rounded-lg"
      >
        <View className="flex-row items-center">
          {Icon && (
            <Icon className="text-accent-500" size={22} strokeWidth={2.5} />
          )}
          <Text className="ml-4 text-base font-semibold text-accent-500">
            {label}
          </Text>
        </View>
        <ChevronDown
          style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
          className="text-accent-500"
          size={20}
        />
      </TouchableOpacity>

      {/* Render Sub-Items Recursively */}
      {isOpen && (
        <View
          style={{
            marginLeft: level * 6 + 6,
            paddingLeft: Icon ? 14 : 8,
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
              onExpand={onExpand}
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
