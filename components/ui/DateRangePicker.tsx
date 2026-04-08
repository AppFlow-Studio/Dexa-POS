import { colors } from '@/lib/theme';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onDateRangeChange: (startDate: string, endDate: string) => void;
    placeholder?: string;
    className?: string;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate,
    endDate,
    onDateRangeChange,
    placeholder = 'Select date range',
}) => {
    const today = new Date();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempStart, setTempStart] = useState(startDate);
    const [tempEnd, setTempEnd] = useState(endDate);
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getDisplayText = () => {
        if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
        if (startDate) return `From ${formatDate(startDate)}`;
        if (endDate) return `Until ${formatDate(endDate)}`;
        return placeholder;
    };

    const hasValue = !!(startDate || endDate);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };

    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const generateDays = () => {
        const firstDay = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0);
        const days: Array<{ day: number; dateStr: string; isSelected: boolean; isInRange: boolean; isToday: boolean; isStart: boolean; isEnd: boolean } | null> = [];

        for (let i = 0; i < firstDay.getDay(); i++) days.push(null);

        const startObj = tempStart ? new Date(tempStart + 'T00:00:00') : null;
        const endObj = tempEnd ? new Date(tempEnd + 'T00:00:00') : null;
        const todayStr = today.toISOString().split('T')[0];

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(viewYear, viewMonth, day);
            const dateStr = date.toISOString().split('T')[0];
            const isStart = dateStr === tempStart;
            const isEnd = dateStr === tempEnd;
            const isSelected = isStart || isEnd;
            const isInRange = !!(startObj && endObj && date > startObj && date < endObj);
            days.push({ day, dateStr, isSelected, isInRange, isToday: dateStr === todayStr, isStart, isEnd });
        }

        return days;
    };

    const handleDateSelect = (dateStr: string) => {
        if (!tempStart || (tempStart && tempEnd)) {
            setTempStart(dateStr);
            setTempEnd('');
        } else {
            if (dateStr >= tempStart) setTempEnd(dateStr);
            else { setTempEnd(tempStart); setTempStart(dateStr); }
        }
    };

    const handleSave = () => {
        onDateRangeChange(tempStart, tempEnd);
        setIsModalOpen(false);
    };

    const handleClear = () => {
        setTempStart(''); setTempEnd('');
        onDateRangeChange('', '');
        setIsModalOpen(false);
    };

    const handleOpen = () => {
        setTempStart(startDate);
        setTempEnd(endDate);
        setViewMonth(today.getMonth());
        setViewYear(today.getFullYear());
        setIsModalOpen(true);
    };

    const days = generateDays();

    return (
        <>
            <TouchableOpacity
                onPress={handleOpen}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 38,
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: hasValue ? colors.teal + '50' : colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    gap: 8,
                }}
            >
                <Text style={{ flex: 1, fontSize: 13, color: hasValue ? colors.heading : colors.muted }} numberOfLines={1}>
                    {getDisplayText()}
                </Text>
                {hasValue ? (
                    <TouchableOpacity
                        onPress={(e) => { e.stopPropagation?.(); onDateRangeChange('', ''); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <X size={13} color={colors.muted} />
                    </TouchableOpacity>
                ) : (
                    <Calendar size={13} color={colors.muted} />
                )}
            </TouchableOpacity>

            <Modal visible={isModalOpen} transparent animationType="fade" onRequestClose={() => setIsModalOpen(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                    <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, width: '100%', maxWidth: 420 }}>

                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>Select Date Range</Text>
                            <TouchableOpacity onPress={() => setIsModalOpen(false)} style={{ padding: 4 }}>
                                <X size={16} color={colors.muted} />
                            </TouchableOpacity>
                        </View>

                        {/* Selected range display */}
                        {(tempStart || tempEnd) && (
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                <View style={{ flex: 1, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '40', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>From</Text>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, marginTop: 1 }}>
                                        {tempStart ? formatDate(tempStart) : '—'}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '40', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>To</Text>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, marginTop: 1 }}>
                                        {tempEnd ? formatDate(tempEnd) : '—'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Month navigator */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <TouchableOpacity onPress={prevMonth} style={{ padding: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 7 }}>
                                <ChevronLeft size={14} color={colors.label} />
                            </TouchableOpacity>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                                {MONTH_NAMES[viewMonth]} {viewYear}
                            </Text>
                            <TouchableOpacity onPress={nextMonth} style={{ padding: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 7 }}>
                                <ChevronRight size={14} color={colors.label} />
                            </TouchableOpacity>
                        </View>

                        {/* Day headers */}
                        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                            {DAY_NAMES.map((d) => (
                                <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>{d}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Calendar grid */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
                            {days.map((dayData, index) => {
                                if (!dayData) {
                                    return <View key={`empty-${index}`} style={{ width: '14.28%', height: 36 }} />;
                                }
                                const { day, dateStr, isSelected, isInRange, isToday, isStart, isEnd } = dayData;
                                return (
                                    <TouchableOpacity
                                        key={dateStr}
                                        onPress={() => handleDateSelect(dateStr)}
                                        style={{
                                            width: '14.28%',
                                            height: 36,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: isSelected
                                                ? colors.teal
                                                : isInRange
                                                    ? colors.teal + '20'
                                                    : 'transparent',
                                            borderRadius: isStart || isEnd ? 8 : isInRange ? 0 : 8,
                                            borderTopLeftRadius: isStart || (!isInRange && !isSelected) ? 8 : isInRange ? 0 : 8,
                                            borderBottomLeftRadius: isStart || (!isInRange && !isSelected) ? 8 : isInRange ? 0 : 8,
                                            borderTopRightRadius: isEnd || (!isInRange && !isSelected) ? 8 : isInRange ? 0 : 8,
                                            borderBottomRightRadius: isEnd || (!isInRange && !isSelected) ? 8 : isInRange ? 0 : 8,
                                        }}
                                    >
                                        <Text style={{
                                            fontSize: 12,
                                            fontWeight: isSelected || isToday ? '700' : '400',
                                            color: isSelected
                                                ? colors.onSolid
                                                : isInRange
                                                    ? colors.teal
                                                    : isToday
                                                        ? colors.teal
                                                        : colors.label,
                                        }}>
                                            {day}
                                        </Text>
                                        {isToday && !isSelected && (
                                            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.teal, position: 'absolute', bottom: 4 }} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Action buttons */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                onPress={handleClear}
                                style={{ flex: 1, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center' }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                style={{ flex: 1, paddingVertical: 9, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', borderRadius: 8, alignItems: 'center' }}
                            >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
};
