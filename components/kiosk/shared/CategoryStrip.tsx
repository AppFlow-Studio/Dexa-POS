import type { KioskCategory } from "@/components/kiosk/types";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import React from "react";
import { ScrollView, Pressable, Text } from "react-native";

export function CategoryStrip({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: KioskCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}) {
  const theme = useKioskTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {categories.map((category) => {
        const active = category.id === selectedCategoryId;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            style={{
              minHeight: 48,
              borderRadius: 8,
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? theme.primaryColor : `${theme.primaryColor}14`,
              borderWidth: 1,
              borderColor: active ? theme.primaryColor : `${theme.primaryColor}44`,
            }}
          >
            <Text style={{ color: active ? "#FFFFFF" : theme.textColor, fontSize: 14, fontWeight: "800" }}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
