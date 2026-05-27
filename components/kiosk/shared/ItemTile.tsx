import type { KioskMenuItem } from "@/components/kiosk/types";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import { Image } from "expo-image";
import { UtensilsCrossed } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

export function ItemTile({
  item,
  onPress,
  width = 210,
}: {
  item: KioskMenuItem;
  onPress: () => void;
  width?: number;
}) {
  const theme = useKioskTheme();
  const imageSource = resolveMenuItemImageSource(item.image ?? undefined);
  const hasModifiers = item.modifierGroups.length > 0;

  return (
    <View
      style={{
        width,
        flexBasis: width,
        minWidth: width,
        maxWidth: width,
        flexGrow: 0,
        flexShrink: 0,
        marginBottom: 12,
      }}
    >
      <Pressable
        disabled={!item.isAvailable}
        onPress={onPress}
        style={({ pressed }) => ({
          width: "100%",
          height: 268,
          borderRadius: 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: pressed
            ? `${theme.primaryColor}70`
            : `${theme.textColor}12`,
          backgroundColor: theme.backgroundColor,
          opacity: !item.isAvailable ? 0.48 : pressed ? 0.88 : 1,
          elevation: pressed ? 1 : 4,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: pressed ? 4 : 12 },
          shadowOpacity: pressed ? 0.08 : 0.13,
          shadowRadius: pressed ? 8 : 20,
        })}
      >
        {hasModifiers && (
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              minWidth: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.primaryColor,
              zIndex: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "900" }}>
              +
            </Text>
          </View>
        )}

        <View style={{ height: 150, width: "100%" }}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={{ height: 150, width: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                height: "100%",
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${theme.primaryColor}10`,
              }}
            >
              <UtensilsCrossed color={`${theme.textColor}70`} size={30} />
            </View>
          )}
        </View>

        <View
          style={{
            flex: 1,
            width: "100%",
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              width: "100%",
              minHeight: 40,
              color: theme.textColor,
              fontSize: 15,
              lineHeight: 19,
              fontWeight: "900",
            }}
          >
            {item.name}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              gap: 8,
              marginTop: 1,
            }}
          >
            <View
              style={{
                flex: 1,
                minWidth: 0,
                height: 34,
                borderRadius: 999,
                backgroundColor: `${theme.textColor}08`,
                paddingHorizontal: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "900",
                  color: theme.textColor,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                ${item.price.toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                height: 34,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${theme.primaryColor}18`,
                borderWidth: 1,
                borderColor: `${theme.primaryColor}40`,
                borderRadius: 999,
                paddingHorizontal: 8,
                opacity: item.cashPrice == null ? 0 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: theme.primaryColor,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                ${item.cashPrice?.toFixed(2) ?? "0.00"}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
