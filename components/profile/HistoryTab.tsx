import { ShiftHistoryEntry } from "@/lib/types";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { PrinterService } from "@/services/printing/PrinterService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { Clock, Printer, RefreshCw } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";

const TABLE_HEADERS = ["Date", "Clock In", "Break", "Clock Out", "Duration"];

const formatTime = (isoString: string): string => {
  if (!isoString || isoString === "N/A") return "N/A";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
};

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
      {formatTime(item.clockIn)}
    </Text>

    {/* Break */}
    <View style={{ flex: 1 }}>
      {item.breakInitiated !== "N/A" ? (
        <>
          <Text style={{ fontSize: 11, color: colors.teal }}>{formatTime(item.breakInitiated)}</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>– {formatTime(item.breakEnded)}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>No break</Text>
      )}
    </View>

    {/* Clock Out */}
    <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: colors.heading }}>
      {item.clockOut === "N/A" ? (
        <Text style={{ color: colors.teal, fontStyle: "italic" }}>Active</Text>
      ) : (
        formatTime(item.clockOut)
      )}
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
          {item.duration}
        </Text>
      </View>
    </View>
  </View>
);

const HistoryTab = () => {
  const { shiftHistory, historyLoading, fetchShiftHistory } = useTimeclockStore();
  const { activeEmployeeId, getEmployeeById } = useEmployeeStore();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch history on mount and when employee changes
  useEffect(() => {
    if (selectedStore?.id && supabase) {
      fetchShiftHistory(supabase, selectedStore.id);
    }
  }, [selectedStore?.id, supabase, activeEmployeeId]);

  const myHistory = useMemo(
    () =>
      shiftHistory.filter(
        (e) => !activeEmployeeId || e.employeeId === activeEmployeeId,
      ),
    [shiftHistory, activeEmployeeId],
  );

  const handleRefresh = () => {
    if (selectedStore?.id && supabase) {
      fetchShiftHistory(supabase, selectedStore.id);
    }
  };

  const handlePrintTimesheet = async () => {
    if (!selectedStore?.id) {
      toastService.show({
        title: "No store selected",
        message: "Cannot print without an active location.",
        type: "error",
      });
      return;
    }
    if (myHistory.length === 0) {
      toastService.show({
        title: "Nothing to print",
        message: "No shifts in history yet.",
        type: "warning",
      });
      return;
    }

    const employee = activeEmployeeId
      ? getEmployeeById(activeEmployeeId)
      : null;

    const shifts = myHistory.map((s) => ({
      date: s.date,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      breakInitiated: s.breakInitiated,
      breakEnded: s.breakEnded,
      durationHours: parseFloat(s.duration) || 0,
    }));

    const totalHours = shifts.reduce((sum, s) => sum + s.durationHours, 0);

    const addressParts = selectedStore
      ? [
          selectedStore.address_line1,
          selectedStore.address_line2,
          `${selectedStore.city}, ${selectedStore.state} ${selectedStore.postal_code}`,
        ].filter(Boolean)
      : [];

    setIsPrinting(true);
    try {
      const ok = await PrinterService.printTimeSheet({
        storeName: selectedStore.name,
        storeAddress: addressParts.join(", ") || undefined,
        employeeName:
          employee?.displayName || employee?.fullName || "Employee",
        employeeRole: employee?.role,
        shifts,
        totalHours,
        timestamp: new Date().toISOString(),
        locationId: selectedStore.id,
      });
      if (ok) {
        toastService.show({
          title: "Printing...",
          message: "Time sheet sent to printer.",
          type: "success",
        });
      } else {
        toastService.show({
          title: "Print failed",
          message: "No receipt printer configured.",
          type: "error",
        });
      }
    } catch (err: any) {
      toastService.show({
        title: "Print failed",
        message: err?.message ?? "Unknown error",
        type: "error",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Shift History (Last 30 Days)
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={historyLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: historyLoading ? 0.6 : 1,
              gap: 5,
            }}
          >
            <RefreshCw size={12} color={colors.label} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label }}>
              Refresh
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePrintTimesheet}
            disabled={isPrinting || myHistory.length === 0}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor:
                myHistory.length === 0 ? colors.border : colors.teal + "50",
              backgroundColor:
                myHistory.length === 0 ? "transparent" : colors.teal + "15",
              opacity: isPrinting ? 0.6 : 1,
              gap: 5,
            }}
          >
            <Printer
              size={12}
              color={myHistory.length === 0 ? colors.muted : colors.teal}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: myHistory.length === 0 ? colors.muted : colors.teal,
              }}
            >
              {isPrinting ? "Printing..." : "Print Timesheet"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
        {historyLoading && myHistory.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>Loading shift history...</Text>
          </View>
        ) : myHistory.length === 0 ? (
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
