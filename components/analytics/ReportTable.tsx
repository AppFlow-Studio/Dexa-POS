// components/analytics/ReportTable.tsx

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
            <View className="bg-panel w-full rounded-2xl border border-border p-6">
                {title && (
                    <Text className="text-white text-lg font-semibold mb-4">{title}</Text>
                )}
                <View className="items-center justify-center py-8">
                    <Text className="text-gray-400 text-lg">No data available</Text>
                </View>
            </View>
        );
    }

    const headerWidth = data.headers.length;
    return (
        <View className="bg-panel w-full rounded-2xl border border-border overflow-hidden">
            {title && (
                <View className="p-4 border-b border-border">
                    <Text className="text-white text-lg font-semibold">{title}</Text>
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
                                className={`px-4 py-3 border-r border-border min-w-[120px] w-1/${headerWidth} `}
                            >
                                <Text className="text-white font-semibold text-sm">
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
                                    className={`px-4 py-3 border-r border-border min-w-[120px] w-1/${headerWidth}`}
                                >
                                    <Text className="text-gray-300 text-sm">
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
                <Text className="text-gray-400 text-xs text-center">
                    {data.rows.length} row{data.rows.length !== 1 ? 's' : ''} • {data.headers.length} column{data.headers.length !== 1 ? 's' : ''}
                </Text>
            </View>
        </View>
    );
}