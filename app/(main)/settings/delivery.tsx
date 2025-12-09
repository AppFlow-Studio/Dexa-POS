import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Slider from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Map, MapPin, Plus, TrendingUp, Truck } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PARTNER_LOGO_MAP } from "@/lib/mockData";
import { Image } from "react-native";

// Helper for mapping store names to logo keys
const getPartnerLogo = (name: string) => {
  const map: Record<string, any> = {
    DoorDash: PARTNER_LOGO_MAP["Door Dash"],
    UberEats: PARTNER_LOGO_MAP["Uber-Eats"],
    Grubhub: PARTNER_LOGO_MAP["grubhub"],
  };
  return map[name];
};

const DeliveryManagementScreen = () => {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">
          Delivery Management
        </Text>
        <Text className="text-gray-400 mt-2">
          Optimize delivery operations and manage third-party integrations.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-6">
          {/* Delivery Zones */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Map color="#3b82f6" size={24} />
                <CardTitle className="text-white">Delivery Zones</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Map Placeholder */}
              <View className="w-full h-64 bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 items-center justify-center relative overflow-hidden">
                <View className="absolute inset-0 bg-[#262626] opacity-50" />
                <View className="items-center z-10">
                  <MapPin size={40} color="#60a5fa" />
                  <Text className="text-gray-400 font-bold mt-2 text-xs uppercase tracking-wider">
                    [Map View]
                  </Text>
                  <Text className="text-gray-500 text-xs mt-1">
                    {`• [Your Restaurant]\n◦ Zone 1 (0-2 mi)\n○○ Zone 2 (2-4 mi)\n○○○ Zone 3 (4-6 mi)`}
                  </Text>
                </View>
              </View>

              {/* Zones Table */}
              <View className="bg-[#212121] rounded-lg border border-gray-700 overflow-hidden">
                <View className="flex-row bg-gray-800/50 p-3 border-b border-gray-700">
                  <Text className="flex-1 text-gray-400 text-xs font-bold uppercase">
                    Zone
                  </Text>
                  <Text className="flex-1 text-gray-400 text-xs font-bold uppercase">
                    Distance
                  </Text>
                  <Text className="w-20 text-gray-400 text-xs font-bold uppercase text-right">
                    Fee
                  </Text>
                  <Text className="w-20 text-gray-400 text-xs font-bold uppercase text-right">
                    ETA
                  </Text>
                </View>
                {settings.zones.map((zone, index) => (
                  <View
                    key={zone.id}
                    className="flex-row p-3 border-b border-gray-700 last:border-0"
                  >
                    <Text className="flex-1 text-white font-medium">
                      {zone.name}
                    </Text>
                    <Text className="flex-1 text-gray-400">
                      {zone.distanceRange}
                    </Text>
                    <Text className="w-20 text-white text-right">
                      ${zone.fee.toFixed(2)}
                    </Text>
                    <Text className="w-20 text-white text-right">
                      {zone.eta} min
                    </Text>
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>

          {/* Connected Delivery Partners */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <Truck color="#10b981" size={24} />
                  <CardTitle className="text-white">
                    Connected Delivery Partners
                  </CardTitle>
                </View>
                <Button
                  variant="outline"
                  className="h-8 border-gray-600 bg-transparent"
                >
                  <Plus size={14} color="white" className="mr-2" />
                  <Text className="text-white text-xs">Add Partner</Text>
                </Button>
              </View>
            </CardHeader>
            <CardContent className="gap-4">
              {settings.partners.map((partner) => {
                const logoSource = getPartnerLogo(partner.name);
                return (
                  <View
                    key={partner.id}
                    className="bg-[#212121] p-4 rounded-lg border border-gray-700"
                  >
                    <View className="flex-row justify-between items-start mb-4">
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 bg-white rounded-lg items-center justify-center overflow-hidden">
                          {logoSource ? (
                            <Image
                              source={logoSource}
                              className="w-full h-full"
                              resizeMode="contain"
                            />
                          ) : (
                            <Text className="text-black font-bold text-lg">
                              {partner.name.substring(0, 2).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View>
                          <Text className="text-white font-bold text-lg">
                            {partner.name}
                          </Text>
                          <View
                            className={`self-start px-2 py-0.5 rounded-full mt-1 ${
                              partner.status === "Active"
                                ? "bg-green-500/20"
                                : "bg-yellow-500/20"
                            }`}
                          >
                            <Text
                              className={`text-[10px] uppercase font-bold ${
                                partner.status === "Active"
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }`}
                            >
                              {partner.status}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View className="flex-row gap-2">
                        {partner.status === "Paused" ? (
                          <TouchableOpacity
                            onPress={() =>
                              settings.toggleDeliveryPartnerStatus(partner.id)
                            }
                            className="bg-gray-600 px-3 py-1.5 rounded-md"
                          >
                            <Text className="text-white text-xs font-semibold">
                              Activate
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity className="bg-[#303030] border border-gray-600 px-3 py-1.5 rounded-md">
                            <Text className="text-gray-300 text-xs font-semibold">
                              Configure
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View className="flex-row border-t border-gray-700 pt-3">
                      <View className="flex-1">
                        <Text className="text-gray-500 text-xs uppercase mb-1">
                          Commission
                        </Text>
                        <Text className="text-white font-bold">
                          {partner.commission}%
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-gray-500 text-xs uppercase mb-1">
                          Orders
                        </Text>
                        <Text className="text-white font-bold">
                          {partner.orders}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-gray-500 text-xs uppercase mb-1">
                          Revenue
                        </Text>
                        <Text className="text-white font-bold">
                          ${partner.revenue.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </CardContent>
          </Card>

          {/* Delivery Optimization */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <TrendingUp color="#f59e0b" size={24} />
                <CardTitle className="text-white">
                  Delivery Optimization
                </CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-white text-base">
                    Batch Orders by Zone
                  </Text>
                  <Text className="text-gray-400 text-xs">
                    Group nearby orders for single delivery
                  </Text>
                </View>
                <Switch
                  checked={settings.batchOrdersByZone}
                  onCheckedChange={(v) =>
                    settings.updateDeliverySettings({ batchOrdersByZone: v })
                  }
                />
              </View>

              <View className="bg-gray-800/30 p-4 rounded-lg border border-gray-700/50">
                <View className="flex-row items-center justify-between mb-4">
                  <View>
                    <Text className="text-white text-base">
                      Delay Orders to Batch
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      Wait for potential batch matches
                    </Text>
                  </View>
                  <Switch
                    checked={settings.delayOrdersToBatch}
                    onCheckedChange={(v) =>
                      settings.updateDeliverySettings({ delayOrdersToBatch: v })
                    }
                  />
                </View>

                {settings.delayOrdersToBatch && (
                  <View className="pl-2">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-gray-300 font-medium">
                        Max Delay
                      </Text>
                      <Text className="text-blue-400 font-bold">
                        {settings.maxBatchDelayMinutes} min
                      </Text>
                    </View>
                    <Slider
                      value={settings.maxBatchDelayMinutes}
                      min={0}
                      max={30}
                      step={1}
                      onValueChange={(v) =>
                        settings.updateDeliverySettings({
                          maxBatchDelayMinutes: v,
                        })
                      }
                      width={280}
                    />
                    <Text className="text-green-500/80 text-xs mt-3">
                      Average Savings: $2.40 per order
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-white text-base">
                    Prioritize Delivery Orders
                  </Text>
                  <Text className="text-gray-400 text-xs">
                    Delivery orders prepared before dine-in
                  </Text>
                </View>
                <Switch
                  checked={settings.prioritizeDeliveryOrders}
                  onCheckedChange={(v) =>
                    settings.updateDeliverySettings({
                      prioritizeDeliveryOrders: v,
                    })
                  }
                />
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

export default DeliveryManagementScreen;
