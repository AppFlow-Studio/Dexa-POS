import { Text, View } from "react-native";

const LegendRow = ({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) => (
  <View className="flex-row items-center justify-between">
    <View className="flex-row items-center">
      <View
        className="w-2.5 h-2.5 rounded-full mr-3"
        style={{ backgroundColor: color }}
      />
      <Text className="text-gray-100 text-sm">{label}</Text>
    </View>
    <Text className="font-semibold text-gray-300 text-sm">
      ${value.toFixed(2)}
    </Text>
  </View>
);

export default LegendRow;
