import { Schedule } from "@/lib/types";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";

interface Props {
    rule: Schedule | null;
    onSave: (rule: Schedule) => void;
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type DayKey = typeof DAY_ORDER[number];

const ScheduleEditSheet = forwardRef<BottomSheet, Props>(function ScheduleEditSheet(
    { rule, onSave },
    ref
) {
    const [name, setName] = useState("");
    const [days, setDays] = useState<DayKey[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        if (rule) {
            setName(rule.name || "");
            setDays((rule.days as DayKey[]) || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
            setStart(rule.startTime);
            setEnd(rule.endTime);
            setMsg(null);
        }
    }, [rule]);

    const parseHHMM = (value: string) => {
        const [h, m] = value.split(":").map((n) => parseInt(n, 10) || 0);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
    };
    const toHHMM = (date: Date) => {
        const h = date.getHours();
        const m = date.getMinutes();
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

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
        const startM = sh * 60 + (sm || 0);
        const endM = eh * 60 + (em || 0);
        if (endM <= startM) return false;
        return true;
    }, [days, start, end]);

    const handleSave = () => {
        if (!rule) return;
        if (!isValid) {
            setMsg(
                days.length === 0
                    ? "Select at least one day."
                    : "End time must be after start time."
            );
            return;
        }
        const updated: Schedule = {
            ...rule,
            name: name.trim() || rule.name,
            days,
            startTime: start,
            endTime: end,
        } as Schedule;
        onSave(updated);
        // @ts-ignore
        (ref as any)?.current?.close?.();
    };

    return (
        <BottomSheet
            ref={ref}
            index={-1}
            snapPoints={["70%", "85%"]}
            enablePanDownToClose
            backdropComponent={(props) => (
                <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
            )}
            backgroundStyle={{ backgroundColor: "#212121" }}
            handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        >
            <BottomSheetView className="p-4 h-full">
                <Text className="text-white text-2xl font-semibold mb-4">Edit Schedule</Text>
                {!!msg && (
                    <View className="bg-red-900/30 border border-red-500 rounded-lg p-2 mb-3">
                        <Text className="text-red-400 text-xs">{msg}</Text>
                    </View>
                )}
                <View className="mb-4">
                    <Text className="text-gray-300 mb-2">Name</Text>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="e.g. Happy Hour"
                        placeholderTextColor="#9CA3AF"
                        className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                    />
                </View>
                <View className="mb-4">
                    <Text className="text-gray-300 mb-2">Days</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {DAY_ORDER.map((d) => {
                            const active = days.includes(d);
                            return (
                                <TouchableOpacity
                                    key={d}
                                    onPress={() => toggleDay(d)}
                                    className={`px-3 py-2 rounded-lg border ${active ? "bg-blue-600 border-blue-500" : "bg-[#212121] border-gray-600"}`}
                                >
                                    <Text className={`text-sm ${active ? "text-white" : "text-gray-300"}`}>{d}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
                <View className="flex-row gap-4 w-full justify-between">
                    <View className="mb-4 flex-1">
                        <Text className="text-gray-300 text-lg mb-2 text-center">Start Time</Text>
                        <View className="rounded-xl p-3 bg-[#1f1f1f]">
                            <DateTimePicker
                                mode="time"
                                textColor="white"
                                value={parseHHMM(start)}
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={(e, date) => setStart(toHHMM(date || parseHHMM(start)))}
                            />
                            <Text className="text-white text-center mt-2">{parseHHMM(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                        </View>
                    </View>
                    <View className="mb-6 flex-1">
                        <Text className="text-gray-300 text-lg mb-2 text-center">End Time</Text>
                        <View className="rounded-xl p-3 bg-[#1f1f1f]">
                            <DateTimePicker
                                mode="time"
                                textColor="white"
                                value={parseHHMM(end)}
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={(e, date) => setEnd(toHHMM(date || parseHHMM(end)))}
                            />
                            <Text className="text-white text-center mt-2">{parseHHMM(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                        </View>
                    </View>
                </View>
                <View className="flex-row gap-3">
                    <TouchableOpacity onPress={() => { /* @ts-ignore */ (ref as any)?.current?.close?.(); }} className="flex-1 px-4 py-4 rounded-lg bg-[#303030] border border-gray-600">
                        <Text className="text-white text-center text-lg font-semibold">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSave} className="flex-1 px-4 py-4 rounded-lg bg-blue-600">
                        <Text className="text-white text-center text-lg font-semibold">Save</Text>
                    </TouchableOpacity>
                </View>
            </BottomSheetView>
        </BottomSheet>
    );
});

export default ScheduleEditSheet;
