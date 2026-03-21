// components/analytics/ReportTable.tsx

import { colors } from '@/lib/theme';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

interface TableData {
    headers: string[];
    rows: any[][];
}

interface ReportTableProps {
    data: TableData;
    title?: string;
}

export default function ReportTable({ data, title }: ReportTableProps) {
    if (!data || !data.headers || !data.rows || data.rows.length === 0) {
        return (
            <View
                style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 14
                }}
            >
                {title && (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, marginBottom: 8 }}>{title}</Text>
                )}
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
                    <Text style={{ fontSize: 13, color: colors.label }}>No data available</Text>
                </View>
            </View>
        );
    }

    const headerWidth = data.headers.length;
    return (
        <View
            style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                overflow: 'hidden'
            }}
        >
            {title && (
                <View
                    style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border
                    }}
                >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{title}</Text>
                </View>
            )}

            <ScrollView
                className="w-full"
                contentContainerClassName="w-full"
                horizontal showsHorizontalScrollIndicator={false}>
                <View className="w-full">
                    {/* Header Row */}
                    <View className="flex-row bg-card">
                        {data.headers.map((header, index) => (
                            <View
                                key={index}
                                className={`px-3 py-2 border-r border-border min-w-[120px] w-1/${headerWidth} `}
                            >
                                <Text
                                    style={{
                                        fontSize: 11,
                                        fontWeight: '600',
                                        color: colors.label,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5
                                    }}
                                >
                                    {header}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Data Rows */}
                    {data.rows.map((row, rowIndex) => (
                        <View
                            key={rowIndex}
                            className={`flex-row ${rowIndex % 2 === 0 ? 'bg-panel' : 'bg-screen'}`}
                        >
                            {row.map((cell, cellIndex) => (
                                <View
                                    key={cellIndex}
                                    className={`px-3 py-2 border-r border-border min-w-[120px] w-1/${headerWidth}`}
                                >
                                    <Text style={{ fontSize: 12, color: colors.heading }}>
                                        {cell}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Footer with row count */}
            <View className="p-3 bg-card border-t border-border">
                <Text style={{ fontSize: 10, color: colors.muted, textAlign: 'center' }}>
                    {data.rows.length} row{data.rows.length !== 1 ? 's' : ''} • {data.headers.length} column{data.headers.length !== 1 ? 's' : ''}
                </Text>
            </View>
        </View>
    );
}
