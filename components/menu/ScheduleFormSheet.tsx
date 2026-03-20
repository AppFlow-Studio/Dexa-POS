import { bottomSheetTheme, colors } from "@/lib/theme";
import { Schedule } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayKey = (typeof DAY_ORDER)[number];

// ── Time stepper ──────────────────────────────────────────────────────────────
const TimeField: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const [hours, minutes] = useMemo(() => {
    const [h = "0", m = "0"] = value?.split(":") ?? [];
    return [parseInt(h, 10) || 0, parseInt(m, 10) || 0];
  }, [value]);

  const isPm = hours >= 12;
  const displayHours = hours % 12 || 12;

  const updateTime = (h: number, m: number) => {
    onChange(
      `${String(((h % 24) + 24) % 24).padStart(2, "0")}:${String(
        ((m % 60) + 60) % 60
      ).padStart(2, "0")}`
    );
  };

  const setHour = (newDisplayHour: number) => {
    let newH24 = newDisplayHour;
    if (isPm) {
      if (newDisplayHour !== 12) newH24 = newDisplayHour + 12;
    } else {
      if (newDisplayHour === 12) newH24 = 0;
    }
    updateTime(newH24, minutes);
  };

  const toggleAmPm = () => updateTime((hours + 12) % 24, minutes);

  const Stepper = ({
    value: val,
    onDec,
    onInc,
  }: {
    value: string;
    onDec: () => void;
    onInc: () => void;
  }) => (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.screen,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 4,
        paddingVertical: 6,
      }}
    >
      <TouchableOpacity onPress={onDec} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.label }}>−</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, minWidth: 28, textAlign: "center" }}>
        {val}
      </Text>
      <TouchableOpacity onPress={onInc} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.label }}>+</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Stepper
        value={String(displayHours).padStart(2, "0")}
        onDec={() => setHour(displayHours === 1 ? 12 : displayHours - 1)}
        onInc={() => setHour(displayHours === 12 ? 1 : displayHours + 1)}
      />
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.muted }}>:</Text>
      <Stepper
        value={String(minutes).padStart(2, "0")}
        onDec={() => updateTime(hours, (minutes + 45) % 60)}
        onInc={() => updateTime(hours, (minutes + 15) % 60)}
      />
      <TouchableOpacity
        onPress={toggleAmPm}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: isPm ? colors.teal + "20" : colors.card,
          borderWidth: 1,
          borderColor: isPm ? colors.teal + "50" : colors.border,
          minWidth: 48,
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: isPm ? colors.teal : colors.label }}>
          {isPm ? "PM" : "AM"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Sheet ─────────────────────────────────────────────────────────────────────
interface ScheduleFormSheetProps {
  rule: Schedule | null;
  onSave: (rule: Schedule) => void;
}

const ScheduleFormSheet = forwardRef<BottomSheet, ScheduleFormSheetProps>(
  function ScheduleFormSheet({ rule, onSave }, ref) {
    const [name, setName] = useState("");
    const [days, setDays] = useState<DayKey[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [msg, setMsg] = useState<string | null>(null);

    const getIsoTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d.toISOString();
    };

    const parseTimeFromIso = (isoStr: string) => {
      if (!isoStr || !isoStr.includes("T")) return isoStr;
      const d = new Date(isoStr);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    useEffect(() => {
      if (rule) {
        setName(rule.name || "");
        setDays((rule.days as DayKey[]) || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setStart(parseTimeFromIso(rule.startTime));
        setEnd(parseTimeFromIso(rule.endTime));
      } else {
        setName("");
        setDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setStart("09:00");
        setEnd("17:00");
      }
      setMsg(null);
    }, [rule]);

    const toggleDay = (d: DayKey) => {
      setDays((prev) => {
        const has = prev.includes(d);
        const next = has ? prev.filter((x) => x !== d) : [...prev, d];
        return DAY_ORDER.filter((x) => next.includes(x));
      });
    };

    const isValid = useMemo(() => {
      if (days.length === 0) return false;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return eh * 60 + (em || 0) > sh * 60 + (sm || 0);
    }, [days, start, end]);

    const handleSave = () => {
      if (!isValid) {
        setMsg(
          days.length === 0
            ? "Select at least one day."
            : "End time must be after start time."
        );
        return;
      }
      const finalRule: Schedule = {
        ...(rule || { id: `sch_${Date.now()}`, name: "", isActive: true }),
        name: name.trim() || rule?.name || "New Schedule",
        days,
        startTime: getIsoTime(start),
        endTime: getIsoTime(end),
      };
      onSave(finalRule);
      (ref as React.RefObject<BottomSheet>)?.current?.close();
    };

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        {...bottomSheetTheme}
      >
        <BottomSheetView style={{ flex: 1, padding: 16, gap: 16 }}>
          {/* Title */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              {rule ? "Edit Schedule Rule" : "Add Schedule Rule"}
            </Text>
          </View>

          {/* Error */}
          {!!msg && (
            <View
              style={{
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: colors.danger }}>{msg}</Text>
            </View>
          )}

          {/* Name */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Rule Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lunch, Happy Hour"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: colors.heading,
              }}
            />
          </View>

          {/* Days */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Days
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {DAY_ORDER.map((d) => {
                const active = days.includes(d);
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => toggleDay(d)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: active ? colors.teal : colors.card,
                      borderWidth: 1,
                      borderColor: active ? colors.teal : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: active ? colors.onSolid : colors.label,
                      }}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Times */}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>
                Start Time
              </Text>
              <TimeField value={start} onChange={setStart} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>
                End Time
              </Text>
              <TimeField value={end} onChange={setEnd} />
            </View>
          </View>

          {/* Save */}
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <TouchableOpacity
              onPress={handleSave}
              style={{
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal }}>
                {rule ? "Save Changes" : "Add Rule"}
              </Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

export default ScheduleFormSheet;
