import { SidebarNavigationItem } from "@/lib/sidebar-data";
import { Href, Link } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SidebarLink from "./SidebarLink";

interface SidebarAccordionProps {
  item: SidebarNavigationItem;
  isExpanded: boolean;
  activePath: string;
  openAccordions: string[];
  onToggle: (id: string) => void;
  onExpand: () => void;
  onActiveLayout: (y: number) => void;
  level?: number;
}

const SidebarAccordion: React.FC<SidebarAccordionProps> = ({
  item,
  isExpanded,
  activePath,
  openAccordions,
  onToggle,
  onExpand,
  onActiveLayout,
  level = 0,
}) => {
  const { id, label, icon: Icon, subItems = [], href } = item;
  const hasSubItems = subItems.length > 0;
  const isOpen = openAccordions.includes(id);
  const indentation = level * 4;

  const viewRef = useRef<View>(null);

  const isActive = React.useMemo(() => {
    if (
      typeof href === "string" &&
      href.length > 1 &&
      activePath.startsWith(href)
    ) {
      return true;
    }
    if (href && activePath === href) {
      return true;
    }
    const checkChildren = (items: SidebarNavigationItem[]): boolean => {
      return items.some((child) => {
        if (typeof child.href === "string" && activePath.startsWith(child.href))
          return true;
        if (child.subItems) return checkChildren(child.subItems);
        return false;
      });
    };
    if (hasSubItems) {
      return checkChildren(subItems);
    }
    return false;
  }, [activePath, href, subItems, hasSubItems]);

  const handlePress = () => {
    if (!isExpanded) {
      if (hasSubItems) {
        onExpand();
        onToggle(id);
      }
    } else {
      if (hasSubItems) {
        onToggle(id);
      }
    }
  };

  useEffect(() => {
    // Only measure and report if this item is currently active AND the sidebar is expanded.
    // Also, ensure the accordion containing it is open if it has sub-items.
    if (isActive && isExpanded && viewRef.current) {
      // Use a short delay to ensure layout has settled after accordions open
      const measureTimer = setTimeout(() => {
        viewRef.current?.measureInWindow((x, y, width, height) => {
          // console.log(`Measuring ${label} (id: ${id}): y=${y}`);
          if (y > 0) {
            // Ensure y is a valid position (not off-screen negatively)
            onActiveLayout(y);
          }
        });
      }, 50); // Shorter delay for individual item measurement

      return () => clearTimeout(measureTimer);
    }
  }, [isActive, isExpanded, onActiveLayout, isOpen, label, id]); // Added label and id for better debug context

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
      <View ref={isActive ? viewRef : null}>
        <Link href={href as Href} asChild>
          <SidebarLink
            label={label}
            icon={Icon}
            isActive={isActive}
            isExpanded={isExpanded}
          />
        </Link>
      </View>
    );
  }

  // Case 2: The item is an accordion (has sub-items)
  return (
    <View ref={isActive ? viewRef : null}>
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
            <SidebarAccordion
              key={subItem.id}
              item={subItem}
              level={level + 1}
              isExpanded={isExpanded}
              onExpand={onExpand}
              openAccordions={openAccordions}
              onToggle={onToggle}
              activePath={activePath}
              onActiveLayout={onActiveLayout}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default SidebarAccordion;
