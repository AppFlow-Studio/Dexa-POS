import { kioskStrings } from "@/components/kiosk/strings";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Store } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

export function AttractLoop({
  imageUrls,
  logoUrl,
  message,
  onStart,
  onSettingsLongPress,
}: {
  imageUrls: string[];
  logoUrl: string | null;
  message: string;
  onStart: () => void;
  onSettingsLongPress: () => void;
}) {
  const theme = useKioskTheme();
  const [index, setIndex] = useState(0);
  const activeImage = imageUrls[index % Math.max(1, imageUrls.length)] ?? null;

  useEffect(() => {
    if (imageUrls.length <= 1) return;
    const timer = setInterval(() => setIndex((current) => current + 1), 5000);
    return () => clearInterval(timer);
  }, [imageUrls.length]);

  return (
    <Pressable
      onPress={onStart}
      style={{ flex: 1, backgroundColor: theme.backgroundColor }}
    >
      {activeImage ? (
        <Image
          source={{ uri: activeImage }}
          style={{ position: "absolute", inset: 0 }}
          contentFit="cover"
        />
      ) : null}
      <LinearGradient
        colors={
          activeImage
            ? ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.42)"]
            : [`${theme.primaryColor}10`, theme.backgroundColor]
        }
        style={{ position: "absolute", inset: 0 }}
      />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 48,
          paddingVertical: 56,
        }}
      >
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{
              position: "absolute",
              top: 56,
              width: 210,
              height: 128,
            }}
            contentFit="contain"
          />
        ) : null}
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            width: "100%",
            maxWidth: 900,
          }}
        >
          <Pressable
            delayLongPress={1200}
            hitSlop={24}
            onLongPress={onSettingsLongPress}
            onPress={() => undefined}
            style={{
              width: 132,
              height: 132,
              borderRadius: 66,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: activeImage
                ? "rgba(255,255,255,0.18)"
                : `${theme.primaryColor}14`,
              borderWidth: 1,
              borderColor: activeImage
                ? "rgba(255,255,255,0.32)"
                : `${theme.primaryColor}28`,
            }}
          >
            <Store
              color={activeImage ? "#FFFFFF" : theme.primaryColor}
              size={58}
              strokeWidth={2.3}
            />
          </Pressable>
          <Text
            style={{
              color: activeImage ? "#FFFFFF" : theme.textColor,
              fontSize: 56,
              lineHeight: 64,
              fontWeight: "900",
              textAlign: "center",
              maxWidth: 880,
              textShadowColor: activeImage ? "rgba(0,0,0,0.22)" : "transparent",
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 8,
            }}
          >
            {message || kioskStrings.attractTitle}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
