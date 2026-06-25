import React from "react";
import { Text, View } from "react-native";
import { useUiScale } from "@/lib/uiScale";

interface StatCardProps {
  title: string;
  value: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value }) => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#ffffff",
        paddingHorizontal: s(16),
        paddingVertical: s(16),
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: "#e5e7eb",
      }}
    >
      <Text
        style={{
          fontSize: s(18),
          fontWeight: "600",
          color: "#a3a3a3",
          marginBottom: s(2),
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: s(32),
          fontWeight: "bold",
          color: "#1f2937",
        }}
      >
        ${value.toFixed(2)}
      </Text>
      <Text
        style={{
          fontSize: s(16),
          color: "#10b981",
          marginTop: s(8),
        }}
      >
        +$100.50
      </Text>
    </View>
  );
};

export default StatCard;
