import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

interface ReadOnlyBillItemProps {
  item: CartItem;
  isLast?: boolean;
}

const ReadOnlyBillItem: React.FC<ReadOnlyBillItemProps> = ({
  item,
  isLast,
}) => {
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  return (
    <View>
      {/* Item header row: name ... xQty  $price */}
      <View className="flex-row items-center py-2">
        <Text
          className="text-sm font-semibold"
          numberOfLines={1}
          style={{ color: colors.heading, flex: 1 }}
        >
          {item.name}
        </Text>
        <Text
          className="text-xs mx-2"
          style={{ color: colors.muted }}
        >
          x{item.quantity}
        </Text>
        <Text
          className="text-sm font-semibold"
          style={{ color: colors.heading, fontFamily: "monospace", minWidth: 56, textAlign: "right" }}
        >
          ${(item.price * item.quantity).toFixed(2)}
        </Text>
      </View>

      {/* Modifiers — always visible, indented */}
      {hasModifiers && (
        <View className="pl-3 pb-2 gap-y-0.5">
          {item.customizations.modifiers?.map((modifier, index) =>
            modifier.options.length > 0
              ? modifier.options.map((option, optIdx) => (
                  <View
                    key={`${index}-${optIdx}`}
                    className="flex-row items-center"
                  >
                    <Text
                      className="text-xs"
                      numberOfLines={1}
                      style={{ color: colors.label, flex: 1 }}
                    >
                      {modifier.categoryName}: {option.name}
                    </Text>
                    {option.price > 0 && (
                      <Text
                        className="text-xs font-medium ml-2"
                        style={{
                          color: colors.success,
                          fontFamily: "monospace",
                        }}
                      >
                        +${option.price.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))
              : null,
          )}

          {/* Notes — italic */}
          {item.customizations.notes && (
            <Text
              className="text-xs italic mt-0.5"
              style={{ color: colors.muted }}
            >
              "{item.customizations.notes}"
            </Text>
          )}
        </View>
      )}

      {/* Dashed separator (except after last item) */}
      {!isLast && (
        <View
          className="border-b border-dashed my-1"
          style={{ borderColor: colors.border }}
        />
      )}
    </View>
  );
};

export default React.memo(ReadOnlyBillItem);
