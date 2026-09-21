import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { CheckBody } from "../components/check/CheckBody";
import { OfflineBanner } from "../components/OfflineBanner";
import { type } from "../lib/type";
import { PageHeader } from "../primitives";

/**
 * The pushed check page shared by tables and orders: `.bar` header, the
 * offline card, course cards and totals. No footer until Wave 2 brings
 * Pay / Send; the "more" button (S5) lands in the header's right slot then.
 */
export function CheckPage({
  title,
  subtitle,
  orderId,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  orderId: string | null;
  emptyText: string;
}) {
  const router = useRouter();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title={title} subtitle={subtitle} onBack={() => router.back()} />
      <OfflineBanner />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {orderId ? (
          <CheckBody orderId={orderId} />
        ) : (
          <Text className="px-5 pt-2" style={[type.sheetDesc, { color: colors.label }]}>
            {emptyText}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
