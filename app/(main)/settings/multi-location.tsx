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

    const getStatusColor = (status: string) => {
        if (status === "online") return colors.success;
        if (status === "setup") return colors.info;
        return colors.danger;
    };

    const getStatusLabel = (status: string) => {
        if (status === "setup") return "OPENING SOON";
        return status.toUpperCase();
    };

    const renderSectionHeader = (title: string, icon: React.ReactNode, section: keyof typeof expandedSections) => (
        <TouchableOpacity
            onPress={() => toggleSection(section)}
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                backgroundColor: colors.panel,
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomWidth: expandedSections[section] ? 1 : 0,
                borderBottomColor: colors.border,
            }}
        >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: colors.teal + "15",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                }}>
                    {icon}
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{title}</Text>
            </View>
            {expandedSections[section]
                ? <ChevronUp size={16} color={colors.label} />
                : <ChevronDown size={16} color={colors.label} />}
        </TouchableOpacity>
    );

    return (
        <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
            <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Multi-Location Management</Text>
                <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>Manage multiple store locations, menu inheritance, and global updates.</Text>
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* Locations Overview */}
                <View style={{
                    backgroundColor: colors.panel,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 14,
                }}>
                    {renderSectionHeader("Locations Overview", <Map size={16} color={colors.teal} />, "locations")}
                    {expandedSections.locations && (
                        <View style={{ padding: 14 }}>
                            <View style={{ gap: 10 }}>
                                {locations.map(loc => {
                                    const statusColor = getStatusColor(loc.status);
                                    return (
                                        <View key={loc.id} style={{
                                            backgroundColor: colors.card,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            padding: 12,
                                        }}>
                                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{loc.name}</Text>
                                                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{loc.address}</Text>
                                                </View>
                                                <View style={{
                                                    backgroundColor: statusColor + "20",
                                                    borderWidth: 1,
                                                    borderColor: statusColor + "50",
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 20,
                                                }}>
                                                    <Text style={{ fontSize: 11, fontWeight: "700", color: statusColor }}>{getStatusLabel(loc.status)}</Text>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
                                                <View>
                                                    <Text style={{ fontSize: 11, color: colors.muted }}>TYPE</Text>
                                                    <Text style={{ fontSize: 12, color: colors.label, marginTop: 1 }}>{loc.type}</Text>
                                                </View>
                                                {loc.status !== "setup" && (
                                                    <>
                                                        <View>
                                                            <Text style={{ fontSize: 11, color: colors.muted }}>SALES (TODAY)</Text>
                                                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, marginTop: 1 }}>{loc.sales}</Text>
                                                        </View>
                                                        <View>
                                                            <Text style={{ fontSize: 11, color: colors.muted }}>ORDERS</Text>
                                                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, marginTop: 1 }}>{loc.orders}</Text>
                                                        </View>
                                                    </>
                                                )}
                                            </View>
                                            <TouchableOpacity style={{
                                                backgroundColor: colors.teal + "20",
                                                borderWidth: 1,
                                                borderColor: colors.teal + "50",
                                                borderRadius: 8,
                                                paddingVertical: 7,
                                                alignItems: "center",
                                            }}>
                                                <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>Manage Location</Text>
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}
                                <TouchableOpacity style={{
                                    backgroundColor: colors.teal + "10",
                                    borderWidth: 1,
                                    borderColor: colors.teal + "40",
                                    borderStyle: "dashed",
                                    borderRadius: 10,
                                    padding: 20,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: 64,
                                }}>
                                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal }}>+ Add New Location</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Menu Inheritance */}
                <View style={{
                    backgroundColor: colors.panel,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 14,
                }}>
                    {renderSectionHeader("Menu Inheritance System", <GitBranch size={16} color={colors.teal} />, "menu")}
                    {expandedSections.menu && (
                        <View style={{ padding: 14 }}>
                            <View style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: colors.border,
                                marginBottom: 12,
                            }}>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>Enable Global Menu Sync</Text>
                                    <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>Automatically push menu changes from HQ to other locations.</Text>
                                </View>
                                <Switch checked={inheritance.enabled} onCheckedChange={(v) => setInheritance({ ...inheritance, enabled: v })} />
                            </View>

                            {inheritance.enabled && (
                                <View style={{
                                    backgroundColor: colors.card,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    padding: 12,
                                }}>
                                    <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600", marginBottom: 10 }}>Inheritance Mode</Text>
                                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                                        {["Full", "Selective", "Independent"].map((mode) => {
                                            const isActive = inheritance.mode === mode.toLowerCase();
                                            return (
                                                <TouchableOpacity
                                                    key={mode}
                                                    onPress={() => setInheritance({ ...inheritance, mode: mode.toLowerCase() })}
                                                    style={{
                                                        flex: 1,
                                                        paddingVertical: 8,
                                                        paddingHorizontal: 6,
                                                        borderRadius: 8,
                                                        borderWidth: 1,
                                                        backgroundColor: isActive ? colors.teal + "20" : "transparent",
                                                        borderColor: isActive ? colors.teal + "60" : colors.border,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <Text style={{
                                                        fontSize: 12,
                                                        fontWeight: "700",
                                                        color: isActive ? colors.teal : colors.label,
                                                    }}>{mode}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    <View style={{
                                        backgroundColor: colors.screen,
                                        borderRadius: 8,
                                        padding: 10,
                                        flexDirection: "row",
                                        alignItems: "center",
                                    }}>
                                        <AlertCircle size={14} color={colors.teal} />
                                        <Text style={{ fontSize: 11, color: colors.label, marginLeft: 8, flex: 1 }}>
                                            {inheritance.mode === "full" && "All locations perfectly mirror the HQ menu. No local overrides allowed."}
                                            {inheritance.mode === "selective" && "Locations inherit core items but can add local specials and pricing."}
                                            {inheritance.mode === "independent" && "Locations manage their own menus. Sync is disabled."}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Push Menu Updates */}
                <View style={{
                    backgroundColor: colors.panel,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 14,
                }}>
                    {renderSectionHeader("Push Menu Updates", <UploadCloud size={16} color={colors.warning} />, "updates")}
                    {expandedSections.updates && (
                        <View style={{ padding: 14 }}>
                            <View style={{
                                backgroundColor: colors.warning + "10",
                                borderWidth: 1,
                                borderColor: colors.warning + "30",
                                borderRadius: 10,
                                padding: 12,
                                flexDirection: "row",
                                alignItems: "flex-start",
                                marginBottom: 12,
                            }}>
                                <AlertTriangle size={16} color={colors.warning} />
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.warning, marginBottom: 3 }}>Pending Changes Detected</Text>
                                    <Text style={{ fontSize: 11, color: colors.label }}>You have 12 menu changes saved in draft (3 new items, 9 price updates). These have not been pushed to live locations.</Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <TouchableOpacity style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    alignItems: "center",
                                }}>
                                    <Text style={{ fontSize: 12, color: colors.label, fontWeight: "600" }}>Preview Changes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 8,
                                    backgroundColor: colors.teal + "20",
                                    borderWidth: 1,
                                    borderColor: colors.teal + "50",
                                    alignItems: "center",
                                    flexDirection: "row",
                                    justifyContent: "center",
                                    gap: 6,
                                }}>
                                    <RefreshCw size={14} color={colors.teal} />
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal }}>Push Updated Menu</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Performance Comparison */}
                <View style={{
                    backgroundColor: colors.panel,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginBottom: 14,
                }}>
                    {renderSectionHeader("Performance Benchmarking", <BarChart3 size={16} color={colors.success} />, "analytics")}
                    {expandedSections.analytics && (
                        <View style={{ padding: 14 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Sales per Labor Hour</Text>
                                <Text style={{ fontSize: 11, color: colors.teal }}>View Full Report</Text>
                            </View>
                            {locations.filter(l => l.status !== "setup").map((loc, index) => (
                                <View key={loc.id} style={{ marginBottom: 10 }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                                            {index === 0 && <Text style={{ marginRight: 6 }}>🥇</Text>}
                                            <Text style={{ fontSize: 12, color: colors.label }}>{loc.name}</Text>
                                        </View>
                                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>
                                            {index === 0 ? "$124/hr" : index === 1 ? "$98/hr" : "$0/hr"}
                                        </Text>
                                    </View>
                                    <View style={{ height: 6, backgroundColor: colors.card, borderRadius: 4, overflow: "hidden" }}>
                                        <View style={{
                                            height: "100%",
                                            backgroundColor: colors.teal,
                                            borderRadius: 4,
                                            width: index === 0 ? "100%" : index === 1 ? "75%" : "0%",
                                        }} />
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
