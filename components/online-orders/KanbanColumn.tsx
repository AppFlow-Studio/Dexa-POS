import { FlashList } from "@shopify/flash-list";
import { ArrowLeft } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import OnlineOrderCard, {
  type OnlineColumnVariant,
} from "./OnlineOrderCard";

interface KanbanColumnProps {
  title: string;
  color: string;
  /** Stable list of order keys (db_order_id ?? id) for this column. */
  orderIds: string[];
  variant: OnlineColumnVariant;
  isFocused: boolean;
  onHeaderPress: () => void;
}

// Card height estimate (header + body + details link + footer). FlashList only
// needs a ballpark to seed virtualization; it self-corrects after first layout.
const ESTIMATED_CARD_HEIGHT = 210;

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  color,
  orderIds,
  variant,
  isFocused,
  onHeaderPress,
}) => {
  const numColumns = isFocused ? 4 : 1;

  const keyExtractor = useCallback((item: string) => item, []);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <View
        style={{
          flex: 1,
          paddingBottom: 12,
          paddingHorizontal: isFocused ? 6 : 0,
        }}
      >
        <OnlineOrderCard orderId={item} variant={variant} />
      </View>
    ),
    [isFocused, variant],
  );

  return (
    <View className="flex-1 flex-col bg-surface rounded-xl overflow-hidden border border-gray-700">
      <TouchableOpacity
        onPress={onHeaderPress}
        style={{ backgroundColor: color }}
        className="p-3 flex-row items-center justify-center"
      >
        {isFocused && (
          <ArrowLeft size={20} color="white" className="absolute left-4" />
        )}
        <Text className="text-xl font-bold text-center text-white">
          {title} ({orderIds.length})
        </Text>
      </TouchableOpacity>

      <FlashList
        // numColumns changes 1<->4 on focus; FlashList re-lays cleanly.
        key={`fl-${numColumns}`}
        data={orderIds}
        numColumns={numColumns}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        estimatedItemSize={ESTIMATED_CARD_HEIGHT}
        drawDistance={500}
        contentContainerStyle={{ padding: 12 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center">
            <Text className="text-gray-500 text-center">
              No orders in this status.
            </Text>
          </View>
        }
      />
    </View>
  );
};

export default KanbanColumn;
