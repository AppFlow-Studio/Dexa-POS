import { ShiftHistoryEntry } from "@/lib/types";
import { colors } from "@/lib/theme";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { Clock } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";

const TABLE_HEADERS = ["Date", "Clock In", "Break", "Clock Out", "Duration"];

const HistoryTableHeader = () => (
  <View
    style={{
      flexDirection: "row",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.screen,
    }}
  >
    {TABLE_HEADERS.map((h) => (
      <Text
        key={h}
        style={{
          flex: 1,
          fontSize: 10,
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {h}
      </Text>
    ))}
  </View>
);

const HistoryTableRow = ({
  item,
  index,
}: {
  item: ShiftHistoryEntry;
  index: number;
}) => (
  <View
    style={{
      flexDirection: "row",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: index % 2 === 0 ? colors.card : "transparent",
      alignItems: "center",
    }}
  >
    {/* Date */}
    <Text style={{ flex: 1, fontSize: 12, color: colors.label }}>{item.date}</Text>

    {/* Clock In */}
    <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.heading }}>
      {item.clockIn}
    </Text>

    {/* Break */}
    <View style={{ flex: 1 }}>
      {item.breakInitiated !== "N/A" ? (
        <>
          <Text style={{ fontSize: 11, color: colors.teal }}>{item.breakInitiated}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>– {item.breakEnded}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>No break</Text>
      )}
    </View>

    {/* Clock Out */}
    <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.heading }}>
      {item.clockOut}
    </Text>

    {/* Duration */}
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
          backgroundColor: colors.teal + "15",
          borderWidth: 1,
          borderColor: colors.teal + "30",
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.teal }}>
          {item.duration}h
        </Text>
      </View>
    </View>
  </View>
);

const HistoryTab = () => {
  const { shiftHistory } = useTimeclockStore();
  const { activeEmployeeId } = useEmployeeStore();

  const myHistory = shiftHistory.filter(
    (e) => !activeEmployeeId || e.employeeId === activeEmployeeId
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Shift History
      </Text>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <HistoryTableHeader />
        {myHistory.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
            <Clock size={28} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>No shift history yet.</Text>
          </View>
        ) : (
          myHistory.map((item, index) => (
            <HistoryTableRow key={item.id} item={item} index={index} />
          ))
        )}
      </View>
    </ScrollView>
  );
};

export default HistoryTab;
