import { getCartItemUnitPrice } from "@/components/kiosk/cartMath";
import { KioskButton } from "@/components/kiosk/shared/KioskButton";
import { ModifierSelector } from "@/components/kiosk/shared/ModifierSelector";
import { MoneyDisplay } from "@/components/kiosk/shared/MoneyDisplay";
import { QuantityStepper } from "@/components/kiosk/shared/QuantityStepper";
import { kioskStrings } from "@/components/kiosk/strings";
import type {
  KioskCartItem,
  KioskCartModifier,
  KioskMenuItem,
} from "@/components/kiosk/types";
import { useKioskFlow } from "@/contexts/kiosk/KioskFlowProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";

export function ItemDetailSheet({ item }: { item: KioskMenuItem }) {
  const theme = useKioskTheme();
  const flow = useKioskFlow();
  const { height, width } = useWindowDimensions();
  const isCompact = height < 900 || width > height;
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, KioskCartModifier[]>
  >({});

  const modifiers = useMemo(
    () => Object.values(selectedModifiers).flat(),
    [selectedModifiers],
  );

  const missingRequiredGroup = item.modifierGroups.find((group) => {
    const selected = selectedModifiers[group.id] ?? [];
    return selected.length < group.minRequired;
  });

  const previewCartItem: KioskCartItem = {
    id: "preview",
    menuItemId: item.id,
    name: item.name,
    image: item.image,
    basePrice: item.price,
    quantity,
    modifiers,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: isCompact ? 16 : 24,
          gap: 16,
          paddingBottom: 22,
        }}
      >
        {item.image && !isCompact ? (
          <Image
            source={{ uri: item.image }}
            style={{ width: "100%", height: 220, borderRadius: 12 }}
            contentFit="cover"
          />
        ) : null}
        <View
          style={{
            gap: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${theme.textColor}10`,
            backgroundColor: `${theme.textColor}04`,
            padding: 16,
          }}
        >
          <Text
            style={{
              color: theme.textColor,
              fontSize: isCompact ? 24 : 30,
              fontWeight: "900",
            }}
          >
            {item.name}
          </Text>
          {item.description ? (
            <Text
              numberOfLines={isCompact ? 2 : 4}
              style={{
                color: `${theme.textColor}AA`,
                fontSize: 15,
                lineHeight: 21,
              }}
            >
              {item.description}
            </Text>
          ) : null}
          <MoneyDisplay value={item.price} size={isCompact ? "md" : "lg"} />
        </View>
        {item.modifierGroups.map((group) => (
          <ModifierSelector
            key={group.id}
            group={group}
            selected={selectedModifiers[group.id] ?? []}
            onChange={(nextModifiers) =>
              setSelectedModifiers((current) => ({
                ...current,
                [group.id]: nextModifiers,
              }))
            }
          />
        ))}
        <View
          style={{
            minHeight: 72,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${theme.textColor}10`,
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{ color: theme.textColor, fontSize: 18, fontWeight: "900" }}
          >
            {kioskStrings.quantity}
          </Text>
          <QuantityStepper quantity={quantity} onChange={setQuantity} />
        </View>
      </ScrollView>
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: `${theme.textColor}12`,
          gap: 12,
          backgroundColor: theme.backgroundColor,
          elevation: 8,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        }}
      >
        {missingRequiredGroup ? (
          <Text style={{ color: "#B91C1C", fontSize: 13, textAlign: "center" }}>
            {missingRequiredGroup.name} requires{" "}
            {missingRequiredGroup.minRequired} selection
            {missingRequiredGroup.minRequired === 1 ? "" : "s"}.
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <KioskButton
              label={kioskStrings.back}
              variant="secondary"
              onPress={flow.closeItem}
            />
          </View>
          <View style={{ flex: 2 }}>
            <KioskButton
              label={`${kioskStrings.addToCart} - $${(
                getCartItemUnitPrice(previewCartItem) * quantity
              ).toFixed(2)}`}
              disabled={Boolean(missingRequiredGroup)}
              onPress={() => flow.addCartItem(item, quantity, modifiers)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
