import {
  Battery,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  Tablet,
  Wifi,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Switch } from "~/components/ui/switch";
import { colors } from "@/lib/theme";

const TerminalManagementScreen = () => {
  const [terminals, setTerminals] = useState([
    {
      id: 1,
      name: "Payment Terminal",
      model: "Dejavoo P8",
      battery: 85,
      status: "online",
      version: "1.2.0",
    },
    {
      id: 2,
      name: "Kitchen Printer",
      model: "Epson TM-T88VI",
      battery: 100,
      status: "online",
      version: "2.1.0",
    },
    {
      id: 3,
      name: "Receipt Printer",
      model: "Star TSP143IV",
      battery: 100,
      status: "online",
      version: "1.0.5",
    },
    {
      id: 4,
      name: "Cash Drawer",
      model: "APG Vasario",
      battery: 100,
      status: "offline",
      version: "N/A",
    },
  ]);

  const [security, setSecurity] = useState({
    passcode: true,
    autoLock: true,
    autoLockTime: "5",
  });

  const [expandedSections, setExpandedSections] = useState({
    list: true,
    updates: true,
    security: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
          {title}
        </Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={16} color={colors.label} />
      ) : (
        <ChevronDown size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Page Header */}
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
          Terminal Management
        </Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
          Manage connected terminals and device updates.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Connected Devices */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Connected Devices",
            <Tablet size={16} color={colors.teal} />,
            "list"
          )}
          {expandedSections.list && (
            <View style={{ padding: 12, gap: 8 }}>
              {terminals.map((terminal) => {
                const isOnline = terminal.status === "online";
                const batteryLow = terminal.battery < 20;
                return (
                  <View
                    key={terminal.id}
                    style={{
                      backgroundColor: colors.card,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: isOnline ? colors.success : colors.muted,
                          marginRight: 10,
                        }}
                      />
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                          {terminal.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
                          {terminal.model} · v{terminal.version}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Battery
                          size={14}
                          color={batteryLow ? colors.danger : colors.label}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            color: batteryLow ? colors.danger : colors.label,
                          }}
                        >
                          {terminal.battery}%
                        </Text>
                      </View>
                      <Wifi
                        size={14}
                        color={isOnline ? colors.success : colors.muted}
                      />
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                          backgroundColor: (isOnline ? colors.success : colors.muted) + "20",
                          borderWidth: 1,
                          borderColor: (isOnline ? colors.success : colors.muted) + "50",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: isOnline ? colors.success : colors.muted,
                          }}
                        >
                          {isOnline ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Software Updates */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Software Updates",
            <RefreshCw size={16} color={colors.teal} />,
            "updates"
          )}
          {expandedSections.updates && (
            <View style={{ padding: 12, gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                    Current Version: 2.4.1
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.success, marginTop: 2 }}>
                    You are on the latest stable version.
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }}>
                    Check for Updates
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  padding: 12,
                  backgroundColor: colors.teal + "10",
                  borderWidth: 1,
                  borderColor: colors.teal + "30",
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <CheckCircle2 size={16} color={colors.teal} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal, marginBottom: 3 }}>
                    Auto-Update Enabled
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    Terminals will automatically update when the restaurant is
                    closed (between 3AM - 5AM).
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Device Security */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 14,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Device Security",
            <ShieldCheck size={16} color={colors.teal} />,
            "security"
          )}
          {expandedSections.security && (
            <View style={{ padding: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                    Require Manager Passcode
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                    For sensitive actions (refunds, voids)
                  </Text>
                </View>
                <Switch
                  checked={security.passcode}
                  onCheckedChange={(v) =>
                    setSecurity({ ...security, passcode: v })
                  }
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                }}
              >
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                    Auto-Lock Screens
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
                    Lock terminals after inactivity
                  </Text>
                </View>
                <Switch
                  checked={security.autoLock}
                  onCheckedChange={(v) =>
                    setSecurity({ ...security, autoLock: v })
                  }
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default TerminalManagementScreen;
