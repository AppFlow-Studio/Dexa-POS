import { Text, View } from "react-native";
import { useUiScale } from "@/lib/uiScale";

const LegendRow = ({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) => {
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: s(10),
            height: s(10),
            borderRadius: s(5),
            marginRight: s(12),
            backgroundColor: color,
          }}
        />
        <Text style={{ color: "#f3f4f6", fontSize: s(14) }}>{label}</Text>
      </View>
      <Text style={{ fontWeight: "600", color: "#d1d5db", fontSize: s(14) }}>
        ${value.toFixed(2)}
      </Text>
    </View>
  );
};

export default LegendRow;
