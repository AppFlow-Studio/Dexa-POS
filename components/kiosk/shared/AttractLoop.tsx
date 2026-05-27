import { KioskButton } from "@/components/kiosk/shared/KioskButton";
import { kioskStrings } from "@/components/kiosk/strings";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

export function AttractLoop({
  imageUrls,
  logoUrl,
  message,
  onStart,
}: {
  imageUrls: string[];
  logoUrl: string | null;
  message: string;
  onStart: () => void;
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
          justifyContent: "flex-end",
          paddingHorizontal: 48,
          paddingBottom: 72,
          gap: 28,
        }}
      >
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{
              width: 210,
              height: 128,
              marginBottom: "auto",
              marginTop: 72,
            }}
            contentFit="contain"
          />
        ) : null}
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
        <View style={{ minWidth: 280 }}>
          <KioskButton label={kioskStrings.startOrder} onPress={onStart} />
        </View>
      </View>
    </Pressable>
  );
}
