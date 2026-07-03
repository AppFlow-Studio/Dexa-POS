import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { FlashList } from "@shopify/flash-list";
import { ArrowLeft } from "lucide-react-native";
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import OnlineOrderCard, { type OnlineColumnVariant } from "./OnlineOrderCard";

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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const numColumns = isFocused ? 4 : 1;

  const keyExtractor = useCallback((item: string) => item, []);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <View
        style={{
          flex: 1,
          paddingBottom: Math.round(12 * uiScale),
          paddingHorizontal: isFocused ? Math.round(6 * uiScale) : 0,
        }}
      >
        <OnlineOrderCard orderId={item} variant={variant} />
      </View>
    ),
    [isFocused, variant, uiScale],
  );

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "column",
        backgroundColor: colors.panel,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <TouchableOpacity
        onPress={onHeaderPress}
        style={{
          backgroundColor: color,
          padding: s(12),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isFocused && (
          <ArrowLeft
            size={s(20)}
            color="white"
            style={{ position: "absolute", left: s(16) }}
          />
        )}
        <Text
          style={{
            fontSize: s(20),
            fontWeight: "700",
            textAlign: "center",
            color: "#FFFFFF",
          }}
        >
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
        contentContainerStyle={{ padding: s(12) }}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: "transparent" }}
        ListEmptyComponent={
          <View
            style={{
              height: s(160),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.muted, textAlign: "center" }}>
              No orders in this status.
            </Text>
          </View>
        }
      />
    </View>
  );
};

export default KanbanColumn;
