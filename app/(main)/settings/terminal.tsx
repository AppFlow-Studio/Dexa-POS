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
      className="flex-row items-center justify-between p-4 bg-[#353535] rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-[#454545] rounded-lg items-center justify-center mr-3">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color="#9ca3af" />
      ) : (
        <ChevronDown size={20} color="#9ca3af" />
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Terminal Management
        </Text>
        <Text className="text-gray-400 mt-2">
          Manage connected terminals and device updates.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Connected Devices */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Connected Devices",
            <Tablet size={20} color="#60a5fa" />,
            "list"
          )}
          {expandedSections.list && (
            <View className="p-5">
              {terminals.map((terminal) => (
                <View
                  key={terminal.id}
                  className="bg-[#404040] p-4 rounded-xl mb-3 flex-row items-center justify-between border border-gray-600"
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className={`w-3 h-3 rounded-full mr-3 ${terminal.status === "online" ? "bg-green-500" : "bg-gray-500"}`}
                    />
                    <View>
                      <Text className="text-white font-bold text-base">
                        {terminal.name}
                      </Text>
                      <Text className="text-gray-400 text-xs">
                        {terminal.model} • v{terminal.version}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center">
                      <Battery
                        size={16}
                        color={terminal.battery < 20 ? "#f87171" : "#9ca3af"}
                      />
                      <Text
                        className={`ml-1 text-sm ${terminal.battery < 20 ? "text-red-400" : "text-gray-400"}`}
                      >
                        {terminal.battery}%
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Wifi
                        size={16}
                        color={
                          terminal.status === "online" ? "#4ade80" : "#9ca3af"
                        }
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Software Updates */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Software Updates",
            <RefreshCw size={20} color="#f97316" />,
            "updates"
          )}
          {expandedSections.updates && (
            <View className="p-5">
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-white font-medium">
                    Current Version: 2.4.1
                  </Text>
                  <Text className="text-green-400 text-sm">
                    You are on the latest stable version.
                  </Text>
                </View>
                <TouchableOpacity className="bg-[#404040] border border-gray-600 px-4 py-2 rounded-lg">
                  <Text className="text-white font-medium">
                    Check for Updates
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="p-4 bg-blue-900/20 border border-blue-900/50 rounded-lg">
                <View className="flex-row items-start">
                  <CheckCircle2 size={18} color="#60a5fa" className="mt-0.5" />
                  <View className="ml-2 flex-1">
                    <Text className="text-blue-200 font-bold mb-1">
                      Auto-Update Enabled
                    </Text>
                    <Text className="text-blue-300/70 text-sm">
                      Terminals will automatically update when the restaurant is
                      closed (between 3AM - 5AM).
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Device Security */}
        <View className="bg-[#303030] rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Device Security",
            <ShieldCheck size={20} color="#a78bfa" />,
            "security"
          )}
          {expandedSections.security && (
            <View className="p-5">
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
                <View>
                  <Text className="text-white font-medium">
                    Require Manager Passcode
                  </Text>
                  <Text className="text-gray-400 text-sm">
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
              <View className="flex-row items-center justify-between py-3">
                <View>
                  <Text className="text-white font-medium">
                    Auto-Lock Screens
                  </Text>
                  <Text className="text-gray-400 text-sm">
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
