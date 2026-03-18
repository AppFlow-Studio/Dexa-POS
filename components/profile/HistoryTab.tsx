import { ShiftHistoryEntry } from "@/lib/types";
import { colors } from "@/lib/theme";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Clock } from "lucide-react-native";
import { FlatList, Text, View } from "react-native";

const TABLE_HEADERS = [
  "Clock In",
  "Break",
  "Clock Out",
  "Duration",
];

const HistoryTableHeader = () => (
  <View className="flex-row px-4 py-2 border-b border-border">
    {TABLE_HEADERS.map((header) => (
      <Text key={header} className="flex-1 text-xs font-semibold uppercase tracking-wider text-label">
        {header}
      </Text>
    ))}
  </View>
);

const HistoryTableRow = ({ item, index }: { item: ShiftHistoryEntry; index: number }) => (
  <View
    className="flex-row px-4 py-3 border-b border-border"
    style={index % 2 === 0 ? { backgroundColor: colors.panel } : { backgroundColor: colors.screen }}
  >
    {/* Clock In */}
    <View className="flex-1">
      <Text style={{ fontSize: 11, color: colors.muted }}>{item.date}</Text>
      <Text className="text-sm font-semibold text-heading">{item.clockIn}</Text>
    </View>

    {/* Break */}
    <View className="flex-1">
      {item.breakInitiated !== "N/A" ? (
        <>
          <Text style={{ fontSize: 11, color: colors.teal }}>{item.breakInitiated}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>– {item.breakEnded}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic' }}>No break</Text>
      )}
    </View>

    {/* Clock Out */}
    <View className="flex-1">
      <Text style={{ fontSize: 11, color: colors.muted }}>{item.date}</Text>
      <Text className="text-sm font-semibold text-heading">{item.clockOut}</Text>
    </View>

    {/* Duration */}
    <View className="flex-1">
      <Text className="text-sm font-semibold text-heading">{item.duration}</Text>
    </View>
  </View>
);

const HistoryTab = () => {
  const { shiftHistory } = useTimeclockStore();

  return (
    <View className="flex-1">
      <View className="bg-panel rounded-xl border border-border overflow-hidden">
        <FlatList
          data={shiftHistory}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<HistoryTableHeader />}
          renderItem={({ item, index }) => <HistoryTableRow item={item} index={index} />}
          ListEmptyComponent={
            <View className="items-center py-10">
              <Clock size={32} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>No shift history yet.</Text>
            </View>
          }
          scrollEnabled={false}
        />
      </View>
    </View>
  );
};

export default HistoryTab;
