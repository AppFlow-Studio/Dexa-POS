import { Schedule } from "@/lib/types";
import { Clock, Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAY_ORDER: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ScheduleEditorProps {
    value: Schedule[] | undefined;
    onChange: (next: Schedule[]) => void;
    onAddPress?: () => void;
    onEditPress?: (rule: Schedule, index: number) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ value, onChange, onAddPress, onEditPress }) => {
    const schedules = value ?? [];
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    const addRule = () => {
        if (onAddPress) onAddPress();
    };

    const formatTime = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m || 0, 0, 0);
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    return (
        <View className="gap-3">
            {!!errorMsg && (
                <View className="bg-red-900/30 border border-red-500 rounded-lg p-2">
                    <Text className="text-red-400 text-xs">{errorMsg}</Text>
                </View>
            )}
            {schedules.length === 0 && (
                <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                    <Text className="text-gray-300">No schedules yet.</Text>
                </View>
            )}

            {schedules.map((rule, idx) => (
                <TouchableOpacity
                    key={rule.id}
                    onPress={() => onEditPress && onEditPress(rule, idx)}
                    activeOpacity={0.9}
                    className={`bg-[#303030] border rounded-xl p-5 ${overlaps[idx] ? "border-red-500" : "border-gray-600"}`}
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-white text-2xl font-semibold" numberOfLines={1}>
                            {rule.name || `Rule ${idx + 1}`}
                        </Text>
                        <View className="flex-row items-center">
                            <Clock size={18} color="#9CA3AF" />
                        </View>
                    </View>

                    <Text className="text-white text-xl font-medium">
                        {formatTime(rule.startTime)}
                        <Text className="text-gray-400">  to  </Text>
                        {formatTime(rule.endTime)}
                    </Text>

                    <View className="mt-2">
                        <Text className="text-gray-300 text-lg">Days available</Text>
                        <View className="flex-row flex-wrap gap-2 mt-1">
                            {DAY_ORDER.map((d) => (
                                <View
                                    key={d}
                                    className={`px-3 py-1.5 rounded-full border ${rule.days.includes(d)
                                        ? "bg-blue-900/40 border-blue-500"
                                        : "bg-[#212121] border-gray-600"}`}
                                >
                                    <Text className={`${rule.days.includes(d) ? "text-blue-200" : "text-gray-400"} text-base`}>{d}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {overlaps[idx] && (
                        <View className="mt-3 bg-red-900/30 border border-red-500 rounded-lg p-2">
                            <Text className="text-red-400 text-sm">
                                This rule overlaps another. Tap to edit.
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={addRule} className="flex-row items-center gap-2 px-5 py-4 rounded-lg bg-blue-600 self-start">
                <Plus size={18} color="#FFFFFF" />
                <Text className="text-white text-xl font-semibold">Add Schedule</Text>
            </TouchableOpacity>
        </View>
    );
};

export default ScheduleEditor;


