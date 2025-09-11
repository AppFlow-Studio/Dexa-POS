import { Schedule } from "@/lib/types";
import { Clock, Plus, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface TimeFieldProps {
    value: string;
    onChange: (next: string) => void;
}

const TimeField: React.FC<TimeFieldProps> = ({ value, onChange }) => {
    // Very simple time picker made of increment buttons for iPad quick taps
    const [hours, minutes] = useMemo(() => {
        const [h = "0", m = "0"] = value?.split(":") ?? [];
        return [parseInt(h, 10) || 0, parseInt(m, 10) || 0];
    }, [value]);

    const set = (h: number, m: number) => onChange(`${String((h + 24) % 24).padStart(2, "0")}:${String((m + 60) % 60).padStart(2, "0")}`);

    const toAmPm = (h: number, m: number) => {
        const period = h >= 12 ? "PM" : "AM";
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const minutesStr = String(m).padStart(2, "0");
        return `${hour12}:${minutesStr} ${period}`;
    };

    return (
        <View className="flex-row items-center gap-2">
            <TouchableOpacity onPress={() => set(hours === 23 ? 0 : hours + 1, minutes)} className="px-2 py-1 bg-[#212121] border border-gray-600 rounded">
                <Text className="text-white">+1h</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => set(hours === 0 ? 23 : hours - 1, minutes)} className="px-2 py-1 bg-[#212121] border border-gray-600 rounded">
                <Text className="text-white">-1h</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => set(hours, (minutes + 15) % 60)} className="px-2 py-1 bg-[#212121] border border-gray-600 rounded">
                <Text className="text-white">+15m</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => set(hours, (minutes + 45) % 60)} className="px-2 py-1 bg-[#212121] border border-gray-600 rounded">
                <Text className="text-white">-15m</Text>
            </TouchableOpacity>
            <View className="flex-row items-center gap-2 ml-2">
                <View className="flex-row items-center gap-1">
                    <Clock size={16} color="#9CA3AF" />
                    <Text className="text-white font-medium">{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}</Text>
                </View>
                <View className="px-2 py-1 rounded bg-[#212121] border border-gray-600">
                    <Text className="text-gray-300 text-xs">{toAmPm(hours, minutes)}</Text>
                </View>
            </View>
        </View>
    );
};

export interface ScheduleEditorProps {
    value: Schedule[] | undefined;
    onChange: (next: Schedule[]) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ value, onChange }) => {
    const schedules = value ?? [];
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const toggleDay = (idx: number, day: DayKey) => {
        const rule = schedules[idx];
        const has = rule.days.includes(day);
        const nextDays = has ? rule.days.filter((d) => d !== day) : [...rule.days, day];
        const ordered = DAY_ORDER.filter((d) => nextDays.includes(d));
        changeRule(idx, { days: ordered });
    };

    const changeRule = (idx: number, updates: Partial<Schedule>) => {
        const next = schedules.map((r, i) => (i === idx ? { ...r, ...updates } : r));
        // block if overlap would be introduced
        for (let i = 0; i < next.length; i++) {
            for (let j = i + 1; j < next.length; j++) {
                if (hasOverlap(next[i], next[j])) {
                    setErrorMsg("Change prevented: overlapping rules are not allowed.");
                    return;
                }
            }
        }
        setErrorMsg(null);
        onChange(next);
    };

    const removeRule = (idx: number) => {
        const next = schedules.filter((_, i) => i !== idx);
        onChange(next);
    };

    const addRule = () => {
        const newRule: Schedule = {
            id: `sch_${Date.now()}`,
            name: "New Rule",
            startTime: "11:00",
            endTime: "15:00",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
            isActive: true,
        };
        const next = [...(schedules ?? []), newRule];
        for (let i = 0; i < next.length; i++) {
            for (let j = i + 1; j < next.length; j++) {
                if (hasOverlap(next[i], next[j])) {
                    setErrorMsg("Cannot add rule: it overlaps an existing one.");
                    return;
                }
            }
        }
        setErrorMsg(null);
        onChange(next);
    };

    const hasOverlap = (a: Schedule, b: Schedule) => {
        const sharedDays = a.days.some((d) => b.days.includes(d));
        if (!sharedDays) return false;
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
        // Overnight windows considered overlapping for shared days to keep UX simple
        return true;
    };

    const overlaps = useMemo(() => {
        const flags: boolean[] = schedules.map(() => false);
        for (let i = 0; i < schedules.length; i++) {
            for (let j = i + 1; j < schedules.length; j++) {
                if (hasOverlap(schedules[i], schedules[j])) {
                    flags[i] = true; flags[j] = true;
                }
            }
        }
        return flags;
    }, [schedules]);

    return (
        <View className="gap-3">
            {!!errorMsg && (
                <View className="bg-red-900/30 border border-red-500 rounded-lg p-2">
                    <Text className="text-red-400 text-xs">{errorMsg}</Text>
                </View>
            )}
            {schedules.length === 0 && (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-4 items-center">
                    <Text className="text-gray-300">No schedules yet.</Text>
                </View>
            )}

            {schedules.map((rule, idx) => (
                <View key={rule.id} className={`bg-[#303030] border rounded-lg p-4 ${overlaps[idx] ? "border-red-500" : "border-gray-600"}`}>
                    <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-white font-semibold">{rule.name || `Rule ${idx + 1}`}</Text>
                        <TouchableOpacity onPress={() => removeRule(idx)} className="p-2 bg-red-900/30 border border-red-500 rounded">
                            <Trash2 size={16} color="#F87171" />
                        </TouchableOpacity>
                    </View>

                    <View className="mb-3">
                        <Text className="text-gray-300 mb-2">Days</Text>
                        <View className="flex-row flex-wrap gap-2">
                            {DAY_ORDER.map((d) => {
                                const active = rule.days.includes(d);
                                return (
                                    <TouchableOpacity key={d} onPress={() => toggleDay(idx, d)} className={`px-3 py-2 rounded-lg border ${active ? "bg-blue-600 border-blue-500" : "bg-[#212121] border-gray-600"}`}>
                                        <Text className={`text-sm ${active ? "text-white" : "text-gray-300"}`}>{d}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View className="mb-2">
                        <Text className="text-gray-300 mb-2">Start Time</Text>
                        <TimeField value={rule.startTime} onChange={(v) => changeRule(idx, { startTime: v })} />
                    </View>

                    <View className="mb-2">
                        <Text className="text-gray-300 mb-2">End Time</Text>
                        <TimeField value={rule.endTime} onChange={(v) => changeRule(idx, { endTime: v })} />
                    </View>

                    <View className="mt-2">
                        <Text className={`text-xs ${overlaps[idx] ? "text-red-400" : "text-gray-400"}`}>
                            {overlaps[idx] ? "This rule overlaps another. Adjust times or days." : ""}
                        </Text>
                    </View>
                </View>
            ))}

            <TouchableOpacity onPress={addRule} className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-blue-600 self-start">
                <Plus size={16} color="#FFFFFF" />
                <Text className="text-white font-medium">Add Schedule</Text>
            </TouchableOpacity>
        </View>
    );
};

export default ScheduleEditor;


