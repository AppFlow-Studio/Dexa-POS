import TableListItem from "@/components/tables/TableListItem"; // Our existing TableListItem
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, Layout } from "react-native-reanimated";

interface SectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

// Local Section component for collapsible dining areas
const Section: React.FC<SectionProps> = ({
  title,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <Animated.View
      layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
      className="space-y-1"
    >
      <TouchableOpacity
        onPress={onToggle}
        className="flex-row items-center w-full p-2 text-sm font-semibold text-white hover:bg-gray-800 rounded-md"
      >
        {isOpen ? (
          <ChevronDown size={16} color="#9CA3AF" className="mr-2" />
        ) : (
          <ChevronRight size={16} color="#9CA3AF" className="mr-2" />
        )}
        <Text className="text-white text-base font-semibold">{title}</Text>
      </TouchableOpacity>
      {isOpen && (
        <Animated.View
          layout={Layout.easing(Easing.inOut(Easing.ease)).duration(200)}
          className="pl-2"
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
};

const TablesPanel: React.FC = () => {
  const { layouts } = useFloorPlanStore();
  const [sections, setSections] = useState<{ [key: string]: boolean }>({});

  // Initialize sections state based on available layouts
  useMemo(() => {
    const initialSections: { [key: string]: boolean } = {};
    layouts.forEach((layout) => {
      initialSections[layout.id] = true; // Start all sections expanded by default
    });
    setSections(initialSections);
  }, [layouts]);

  const allTables = useMemo(
    () => layouts.flatMap((layout) => layout.tables),
    [layouts]
  );

  const occupiedTables = useMemo(
    () =>
      allTables.filter(
        (table) =>
          table.type === "table" &&
          (table.status === "In Use" || table.status === "Needs Cleaning")
      ),
    [allTables]
  );

  const totalTables = allTables.filter(
    (table) => table.type === "table"
  ).length; // Only count actual tables

  const capacityPercentage = useMemo(
    () =>
      totalTables > 0
        ? Math.floor((occupiedTables.length / totalTables) * 100)
        : 0,
    [occupiedTables.length, totalTables]
  );

  return (
    <View className="h-full flex-col bg-[#292929]">
      {/* Capacity Info */}
      <View className="p-4 border-b border-gray-700">
        <View className="flex-row items-center justify-between text-xs text-gray-400 font-medium">
          <Text className="text-gray-400">
            {occupiedTables.length}/{totalTables} tables
          </Text>
          <Text className="text-gray-400">{capacityPercentage}% capacity</Text>
        </View>
        <View className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
          <View
            style={{ width: `${capacityPercentage}%` }}
            className="h-full bg-blue-500"
          />
        </View>
      </View>

      {/* Table Sections */}
      <FlatList
        data={layouts}
        keyExtractor={(item) => item.id}
        renderItem={({ item: layout }) => (
          <Section
            title={layout.name}
            isOpen={sections[layout.id] || false}
            onToggle={() =>
              setSections((s) => ({ ...s, [layout.id]: !s[layout.id] }))
            }
          >
            {layout.tables.filter((t) => t.type === "table").length > 0 ? (
              layout.tables
                .filter((t) => t.type === "table")
                .map((table) => (
                  <TableListItem
                    key={table.id}
                    table={table}
                    isExpanded={false} // Always false in this panel
                    onToggleExpand={() => {}} // No expansion here
                    onNavigateToOrder={() => {}} // No navigation here
                    activeLayoutId={layout.id}
                    handleTablePress={() => {}} // No direct table press action here
                  />
                ))
            ) : (
              <Text className="text-gray-400 text-sm p-2 italic">
                No tables assigned
              </Text>
            )}
          </Section>
        )}
        contentContainerStyle={{ padding: 8 }}
      />
    </View>
  );
};

export default TablesPanel;
