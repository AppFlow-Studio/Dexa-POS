import { TableData } from "@/stores/useAnalyticsStore";
import React from "react";
import { ScrollView, Text, View } from "react-native";

interface ReportTableProps {
    data: TableData;
}

const ReportTable: React.FC<ReportTableProps> = ({ data }) => {
    if (!data || !data.headers || !data.rows || data.rows.length === 0) {
        return (
            <View className="p-8 items-center justify-center">
                <Text className="text-gray-400 text-lg">No data available</Text>
            </View>
        );
    }

    const formatCellValue = (value: string | number): string => {
        if (typeof value === 'number') {
            // Check if it's a currency value
            if (value.toString().includes('$') || value > 100) {
                return value.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                });
            }
            return value.toLocaleString();
        }
        return value.toString();
    };

    const isNumericColumn = (columnIndex: number): boolean => {
        return data.rows.some(row => {
            const value = row[columnIndex];
            return typeof value === 'number' ||
                (typeof value === 'string' && !isNaN(parseFloat(value)));
        });
    };

    return (
        <View className="flex-1">
            {/* Table Header */}
            <View className="bg-[#212121] border-b border-gray-600">
                <View className="flex-row">
                    {data.headers.map((header, index) => (
                        <View
                            key={index}
                            className={`flex-1 p-4 ${index < data.headers.length - 1 ? 'border-r border-gray-600' : ''
                                }`}
                        >
                            <Text className="text-white font-semibold text-center">
                                {header}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Table Body */}
            <ScrollView className="flex-1" showsVerticalScrollIndicator={true}>
                {data.rows.map((row, rowIndex) => (
                    <View
                        key={rowIndex}
                        className={`flex-row ${rowIndex % 2 === 0 ? 'bg-[#303030]' : 'bg-[#2a2a2a]'
                            }`}
                    >
                        {row.map((cell, cellIndex) => (
                            <View
                                key={cellIndex}
                                className={`flex-1 p-4 ${cellIndex < row.length - 1 ? 'border-r border-gray-600' : ''
                                    }`}
                            >
                                <Text
                                    className={`text-center ${isNumericColumn(cellIndex) ? 'text-green-400 font-mono' : 'text-gray-200'
                                        }`}
                                >
                                    {formatCellValue(cell)}
                                </Text>
                            </View>
                        ))}
                    </View>
                ))}
            </ScrollView>

            {/* Table Footer */}
            <View className="bg-[#212121] border-t border-gray-600 p-4">
                <View className="flex-row justify-between items-center">
                    <Text className="text-gray-400 text-sm">
                        {data.rows.length} row{data.rows.length !== 1 ? 's' : ''}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                        {data.headers.length} column{data.headers.length !== 1 ? 's' : ''}
                    </Text>
                </View>
            </View>
        </View>
    );
};

export default ReportTable;
