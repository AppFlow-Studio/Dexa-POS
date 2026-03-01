import { colors } from "@/lib/theme";
import { AlertCircle, AlertTriangle, BarChart3, ChevronDown, ChevronUp, GitBranch, Map, RefreshCw, UploadCloud } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Switch } from "~/components/ui/switch";

const MultiLocationScreen = () => {
    const [locations, setLocations] = useState([
        { id: 1, name: "Downtown Flagship", address: "123 Main St", type: "HQ", status: "online", sales: "$4,250", orders: 152 },
        { id: 2, name: "Westside Mall", address: "450 West Ave", type: "Franchise", status: "online", sales: "$2,100", orders: 85 },
        { id: 3, name: "Airport Kiosk", address: "Terminal 4", type: "Corporate", status: "offline", sales: "$0", orders: 0 },
        { id: 4, name: "North Hills", address: "880 North Blvd", type: "Corporate", status: "setup", sales: "-", orders: -1 },
    ]);

    const [inheritance, setInheritance] = useState({
        enabled: true,
        mode: "selective", // full, selective, independent
    });

    const [expandedSections, setExpandedSections] = useState({
        locations: true,
        menu: true,
        updates: false,
        analytics: false,
    });

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
        <TouchableOpacity
            onPress={() => toggleSection(section)}
            className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700"
        >
            <View className="flex-row items-center">
                <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">
                    {icon}
                </View>
                <Text className="text-white font-bold text-lg">{title}</Text>
            </View>
            {expandedSections[section] ? <ChevronUp size={20} color={colors.label} /> : <ChevronDown size={20} color={colors.label} />}
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-screen p-6">
            <View className="mb-6">
                <Text className="text-3xl font-bold text-white">Multi-Location Management</Text>
                <Text className="text-gray-400 mt-2">Manage multiple store locations, menu inheritance, and global updates.</Text>
            </View>

            <View className="h-[1px] w-full bg-gray-700 mb-6" />

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* Locations Overview */}
                <View className="bg-panel rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Locations Overview", <Map size={20} color={colors.info} />, "locations")}
                    {expandedSections.locations && (
                        <View className="p-5">
                            <View className="flex-row flex-wrap gap-4">
                                {locations.map(loc => (
                                    <View key={loc.id} className="w-full md:w-[48%] bg-surface p-4 rounded-xl border border-gray-600">
                                        <View className="flex-row justify-between items-start mb-2">
                                            <View>
                                                <Text className="text-white font-bold text-lg">{loc.name}</Text>
                                                <Text className="text-gray-400 text-xs">{loc.address}</Text>
                                            </View>
                                            <View className={`px-2 py-1 rounded-full ${loc.status === 'online' ? 'bg-green-500/20' : loc.status === 'setup' ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
                                                <Text className={`text-xs font-bold ${loc.status === 'online' ? 'text-green-400' : loc.status === 'setup' ? 'text-blue-400' : 'text-red-400'}`}>
                                                    {loc.status === 'setup' ? 'OPENING SOON' : loc.status.toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>
                                        <View className="flex-row gap-4 mt-2">
                                            <View>
                                                <Text className="text-gray-500 text-xs">TYPE</Text>
                                                <Text className="text-gray-300 text-sm">{loc.type}</Text>
                                            </View>
                                            {loc.status !== 'setup' && (
                                                <>
                                                    <View>
                                                        <Text className="text-gray-500 text-xs">SALES (TODAY)</Text>
                                                        <Text className="text-white text-sm font-bold">{loc.sales}</Text>
                                                    </View>
                                                    <View>
                                                        <Text className="text-gray-500 text-xs">ORDERS</Text>
                                                        <Text className="text-white text-sm font-bold">{loc.orders}</Text>
                                                    </View>
                                                </>
                                            )}
                                        </View>
                                        <TouchableOpacity className="mt-4 bg-card py-2 rounded-lg items-center">
                                            <Text className="text-white font-medium text-sm">Manage Location</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <TouchableOpacity className="w-full bg-blue-600/20 border border-blue-600/50 border-dashed p-4 rounded-xl items-center justify-center h-40">
                                    <Text className="text-blue-400 font-bold text-lg">+ Add New Location</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Menu Inheritance */}
                <View className="bg-panel rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Menu Inheritance System", <GitBranch size={20} color="#a78bfa" />, "menu")}
                    {expandedSections.menu && (
                        <View className="p-5">
                            <View className="flex-row items-center justify-between py-3 border-b border-gray-700 mb-4">
                                <View className="flex-1 pr-4">
                                    <Text className="text-white font-medium">Enable Global Menu Sync</Text>
                                    <Text className="text-gray-400 text-sm">Automatically push menu changes from HQ to other locations.</Text>
                                </View>
                                <Switch checked={inheritance.enabled} onCheckedChange={(v) => setInheritance({ ...inheritance, enabled: v })} />
                            </View>

                            {inheritance.enabled && (
                                <View className="bg-surface p-4 rounded-xl border border-gray-600">
                                    <Text className="text-gray-300 font-medium mb-3">Inheritance Mode</Text>
                                    <View className="flex-row gap-2 mb-4">
                                        {['Full', 'Selective', 'Independent'].map((mode) => (
                                            <TouchableOpacity
                                                key={mode}
                                                onPress={() => setInheritance({ ...inheritance, mode: mode.toLowerCase() })}
                                                className={`flex-1 py-2 px-3 rounded-lg border ${inheritance.mode === mode.toLowerCase() ? 'bg-purple-600 border-purple-500' : 'bg-card border-gray-600'}`}
                                            >
                                                <Text className={`text-center font-bold ${inheritance.mode === mode.toLowerCase() ? 'text-white' : 'text-gray-400'}`}>{mode}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <View className="bg-card p-3 rounded-lg flex-row items-center">
                                        <AlertCircle size={16} color="#a78bfa" />
                                        <Text className="text-gray-300 text-xs ml-2 flex-1">
                                            {inheritance.mode === 'full' && "All locations perfectly mirror the HQ menu. No local overrides allowed."}
                                            {inheritance.mode === 'selective' && "Locations inherit core items but can add local specials and pricing."}
                                            {inheritance.mode === 'independent' && "Locations manage their own menus. Sync is disabled."}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Push Menu Updates */}
                <View className="bg-panel rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Push Menu Updates", <UploadCloud size={20} color={colors.warning} />, "updates")}
                    {expandedSections.updates && (
                        <View className="p-5">
                            <View className="bg-yellow-500/10 border border-yellow-500/30 p-5 rounded-lg flex-row items-start mb-6">
                                <AlertTriangle size={20} color={colors.warning} className="mt-0.5" />
                                <View className="ml-4 flex-1">
                                    <Text className="text-yellow-500 font-bold mb-1">Pending Changes Detected</Text>
                                    <Text className="text-yellow-200/70 text-sm">You have 12 menu changes saved in draft (3 new items, 9 price updates). These have not been pushed to live locations.</Text>
                                </View>
                            </View>

                            <View className="flex-row gap-4">
                                <TouchableOpacity className="flex-1 bg-surface py-3 rounded-lg border border-gray-600 items-center">
                                    <Text className="text-white font-medium">Preview Changes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity className="flex-1 bg-blue-600 py-3 rounded-lg items-center flex-row justify-center gap-3">
                                    <RefreshCw size={18} color="white" />
                                    <Text className="text-white font-bold">Push Updated Menu</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Performance Comparison */}
                <View className="bg-panel rounded-xl border border-gray-700 mb-6">
                    {renderSectionHeader("Performance Benchmarking", <BarChart3 size={20} color={colors.success} />, "analytics")}
                    {expandedSections.analytics && (
                        <View className="p-5">
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-white font-bold">Sales per Labor Hour</Text>
                                <Text className="text-blue-400 text-xs">View Full Report</Text>
                            </View>
                            {locations.filter(l => l.status !== 'setup').map((loc, index) => (
                                <View key={loc.id} className="mb-3">
                                    <View className="flex-row justify-between mb-1">
                                        <View className="flex-row items-center">
                                            {index === 0 && <Text className="mr-2">🥇</Text>}
                                            <Text className="text-gray-300 text-sm">{loc.name}</Text>
                                        </View>
                                        <Text className="text-white font-bold">{index === 0 ? "$124/hr" : index === 1 ? "$98/hr" : "$0/hr"}</Text>
                                    </View>
                                    <View className="h-2 bg-card rounded-full overflow-hidden">
                                        <View className="h-full bg-blue-600 rounded-full" style={{ width: index === 0 ? '100%' : index === 1 ? '75%' : '0%' }} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

            </ScrollView>
        </View>
    );
};

export default MultiLocationScreen;
