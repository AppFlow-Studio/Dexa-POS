import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

interface ReadOnlyBillItemProps {
  item: CartItem;
  isLast?: boolean;
}

const ReadOnlyBillItem: React.FC<ReadOnlyBillItemProps> = ({ item, isLast }) => {
  const hasModifiers =
    (item.customizations.modifiers && item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  const isVoided = item.is_voided;
  const nameColor = isVoided ? colors.muted : colors.heading;
  const priceColor = isVoided ? colors.muted : colors.heading;

  return (
    <View style={{ opacity: isVoided ? 0.55 : 1 }}>
      {/* Item row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 }}>
        {/* Qty badge */}
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 6,
            backgroundColor: isVoided ? colors.border : colors.teal + "18",
            borderWidth: 1,
            borderColor: isVoided ? colors.border : colors.teal + "40",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 9,
            marginTop: 1,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: isVoided ? colors.muted : colors.teal,
            }}
          >
            {item.quantity}
          </Text>
        </View>

        {/* Name + void badge */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
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
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 20,
                  backgroundColor: colors.danger + "20",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", color: colors.danger }}>
                  Voided
                </Text>
              </View>
            )}
          </View>

          {/* Modifiers */}
          {hasModifiers && (
            <View style={{ marginTop: 3, gap: 2 }}>
              {item.customizations.modifiers?.map((modifier, index) =>
                modifier.options.length > 0
                  ? modifier.options.map((option, optIdx) => (
                      <View
                        key={`${index}-${optIdx}`}
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 11, color: colors.label, flex: 1 }}
                        >
                          {modifier.categoryName}: {option.name}
                        </Text>
                        {option.price > 0 && (
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "500",
                              color: colors.success,
                              marginLeft: 6,
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
                <Text style={{ fontSize: 11, fontStyle: "italic", color: colors.muted, marginTop: 1 }}>
                  "{item.customizations.notes}"
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Price */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: priceColor,
            fontVariant: ["tabular-nums"],
            marginLeft: 10,
            minWidth: 56,
            textAlign: "right",
            marginTop: 1,
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
