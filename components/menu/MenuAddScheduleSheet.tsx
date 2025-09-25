import { Schedule } from "@/lib/types";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { forwardRef, useMemo, useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";

interface Props {
    existing: Schedule[];
    onSave: (rule: Schedule) => void;
}

const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MenuAddScheduleSheet = forwardRef<BottomSheet, Props>(function MenuAddScheduleSheet(
    { existing, onSave },
    ref
) {
    const [name, setName] = useState("");
    const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [msg, setMsg] = useState<string | null>(null);

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

    const toggleDay = (d: string) => {
        setDays((prev) => {
            const has = prev.includes(d);
            const next = has ? prev.filter((x) => x !== d) : [...prev, d];
            return dayOrder.filter((x) => next.includes(x));
        });
    };

    const hasOverlap = (a: Schedule, b: Schedule) => {
        const shared = a.days.some((d) => b.days.includes(d));
        if (!shared) return false;
        const [ash, asm] = a.startTime.split(":").map(Number);
        const [aeh, aem] = a.endTime.split(":").map(Number);
        const [bsh, bsm] = b.startTime.split(":").map(Number);
        const [beh, bem] = b.endTime.split(":").map(Number);
        const aStart = ash * 60 + (asm || 0);
        const aEnd = aeh * 60 + (aem || 0);
        const bStart = bsh * 60 + (bsm || 0);
        const bEnd = beh * 60 + (bem || 0);
        if (aEnd >= aStart && bEnd >= bStart) {
            return aStart < bEnd && bStart < aEnd;
        }
        return true;
    };

    const isValid = useMemo(() => {
        if (!name.trim()) return false;
        if (days.length === 0) return false;
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startM = sh * 60 + (sm || 0);
        const endM = eh * 60 + (em || 0);
        if (endM <= startM) return false;
        const candidate: Schedule = {
            id: "draft",
            name: name.trim(),
            startTime: start,
            endTime: end,
            days,
            isActive: true,
        };
        return !existing.some((r) => hasOverlap(candidate, r));
    }, [name, days, start, end, existing]);

    const handleSave = () => {
        if (!isValid) {
            setMsg(
                !name.trim()
                    ? "Please enter a schedule name."
                    : days.length === 0
                        ? "Select at least one day."
                        : "Invalid or conflicting time range."
            );
            return;
        }
        const rule: Schedule = {
            id: `sch_${Date.now()}`,
            name: name.trim(),
            startTime: start,
            endTime: end,
            days,
            isActive: true,
        };
        onSave(rule);
        setMsg(null);
        setName("");
        setDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setStart("09:00");
        setEnd("17:00");
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
                <Text className="text-white text-2xl font-semibold mb-4">Add Schedule</Text>
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
                        placeholder="e.g. Lunch"
                        placeholderTextColor="#9CA3AF"
                        className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                    />
                </View>
                <View className="mb-4">
                    <Text className="text-gray-300 mb-2">Days</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {dayOrder.map((d) => {
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
                    <View className="mb-4 flex-1 items-center justify-center">
                        <Text className="text-gray-300 text-lg mb-2 text-center">Start Time</Text>
                        <View className="rounded-xl p-3">
                            <DateTimePicker
                                mode="time"
                                textColor="white"
                                value={parseHHMM(start)}
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={(e, date) => setStart(toHHMM(date || parseHHMM(start)))}
                            />
                            <Text className="text-white text-center mt-2">{parseHHMM(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
                        </View>
                    </View>
                    <View className="mb-4 flex-1 items-center justify-center">
                        <Text className="text-gray-300 text-lg mb-2 text-center">End Time</Text>
                        <View className="rounded-xl p-3">
                            <DateTimePicker
                                mode="time"
                                textColor="white"
                                value={parseHHMM(end)}
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={(e, date) => setEnd(toHHMM(date || parseHHMM(end)))}
                            />
                            <Text className="text-white text-center mt-2">{parseHHMM(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
                        </View>
                    </View>
                </View>
                <View className="flex-1 justify-end">
                    <TouchableOpacity onPress={handleSave} className="px-4 py-4 rounded-lg bg-blue-600">
                        <Text className="text-white text-center text-lg font-semibold">Save</Text>
                    </TouchableOpacity>
                </View>
            </BottomSheetView>
        </BottomSheet>
    );
});

export default MenuAddScheduleSheet;
