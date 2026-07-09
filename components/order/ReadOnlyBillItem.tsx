import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { Text, View } from "react-native";

interface ReadOnlyBillItemProps {
  item: CartItem;
  isLast?: boolean;
}

const ReadOnlyBillItem: React.FC<ReadOnlyBillItemProps> = ({ item, isLast }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const hasModifiers =
    (item.customizations.modifiers && item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  const isVoided = item.is_voided;
  const nameColor = isVoided ? colors.muted : colors.heading;
  const priceColor = isVoided ? colors.muted : colors.heading;

  return (
    <View style={{ opacity: isVoided ? 0.55 : 1 }}>
      {/* Item row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: s(8) }}>
        {/* Qty badge */}
        <View
          style={{
            minWidth: s(22),
            height: s(22),
            borderRadius: s(6),
            backgroundColor: isVoided ? colors.border : colors.teal + "18",
            borderWidth: 1,
            borderColor: isVoided ? colors.border : colors.teal + "40",
            alignItems: "center",
            justifyContent: "center",
            marginRight: s(9),
            marginTop: s(1),
          }}
        >
          <Text
            style={{
              fontSize: s(11),
              fontWeight: "700",
              color: isVoided ? colors.muted : colors.teal,
            }}
          >
            {item.quantity}
          </Text>
        </View>

        {/* Name + void badge */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: s(13),
                fontWeight: "600",
                color: nameColor,
                flex: 1,
                textDecorationLine: isVoided ? "line-through" : "none",
              }}
            >
              {item.is_to_go ? (
                <Text style={{ color: colors.teal, fontWeight: "700" }}>
                  [TO GO]{" "}
                </Text>
              ) : null}
              {item.name}
            </Text>
            {isVoided && (
              <View
                style={{
                  paddingHorizontal: s(6),
                  paddingVertical: s(2),
                  borderRadius: s(20),
                  backgroundColor: colors.danger + "20",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                }}
              >
                <Text style={{ fontSize: s(10), fontWeight: "600", color: colors.danger }}>
                  Voided
                </Text>
              </View>
            )}
          </View>

          {/* Modifiers */}
          {hasModifiers && (
            <View style={{ marginTop: s(3), gap: s(2) }}>
              {item.customizations.modifiers?.map((modifier, index) =>
                modifier.options.length > 0
                  ? modifier.options.map((option, optIdx) => (
                      <View
                        key={`${index}-${optIdx}`}
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: s(11), color: colors.label, flex: 1 }}
                        >
                          {modifier.categoryName}: {option.name}
                        </Text>
                        {option.price > 0 && (
                          <Text
                            style={{
                              fontSize: s(11),
                              fontWeight: "500",
                              color: colors.success,
                              marginLeft: s(6),
                            }}
                          >
                            +${option.price.toFixed(2)}
                          </Text>
                        )}
                      </View>
                    ))
                  : null,
              )}
              {item.customizations.notes && (
                <Text style={{ fontSize: s(11), fontStyle: "italic", color: colors.muted, marginTop: s(1) }}>
                  "{item.customizations.notes}"
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Price */}
        <Text
          style={{
            fontSize: s(13),
            fontWeight: "600",
            color: priceColor,
            fontVariant: ["tabular-nums"],
            marginLeft: s(10),
            minWidth: s(56),
            textAlign: "right",
            marginTop: s(1),
          }}
        >
          ${(item.price * item.quantity).toFixed(2)}
        </Text>
      </View>

      {!isLast && (
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        />
      )}
    </View>
  );
};

export default React.memo(ReadOnlyBillItem);
