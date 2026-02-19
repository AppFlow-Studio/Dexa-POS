import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Clock,
  Grid,
  LayoutTemplate,
  Map,
  Plus,
  Settings2,
  Users,
} from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DiningRoomScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Stores
  const { floorPlans, createFloorPlan, tables, setActiveFloorPlan } =
    useFloorPlanStore();
  const settings = useSettingsStore();

  const handleCreateFloorPlan = async () => {
    try {
      await createFloorPlan("New Floor Plan");
    } catch (error) {
      console.error("Failed to create floor plan:", error);
    }
  };

  // Calculate live table stats
  // Note: This only calculates stats for the currently loaded tables (Active Floor Plan)
  // because we don't load all tables for all floor plans at once anymore.
  const tableStats = useMemo(() => {
    const allTables = tables;
    return {
      total: allTables.length,
      available: allTables.filter(
        (t) =>
          (t.session?.status || "available") === "available" &&
          (t.category === "table" || t.category === "booth"),
      ).length,
      inUse: allTables.filter(
        (t) =>
          (t.session?.status || "available") !== "available" &&
          t.session?.status !== "cleaning" &&
          (t.category === "table" || t.category === "booth"),
      ).length,
      cleaning: allTables.filter((t) => t.session?.status === "cleaning")
        .length,
    };
  }, [tables]);

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Dining Room</Text>
        <Text className="text-gray-400 mt-2">
          Manage floor plans, table configurations, and server sections.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-6">
          {/* Floor Plans Section */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Map color="#3b82f6" size={24} />
                <CardTitle className="text-white">Floor Plans</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-4">
              {floorPlans.length === 0 ? (
                <View className="p-8 items-center justify-center border border-dashed border-gray-600 rounded-lg">
                  <Text className="text-gray-400 mb-4">
                    No floor plans created yet.
                  </Text>
                  <Button
                    onPress={handleCreateFloorPlan}
                    className="bg-blue-600"
                  >
                    <Plus size={16} color="white" className="mr-2" />
                    <Text className="text-white font-bold">Create Layout</Text>
                  </Button>
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-4">
                  {floorPlans.map((layout) => (
                    <View
                      key={layout.id}
                      className="w-[48%] bg-[#212121] p-4 rounded-lg border border-gray-700"
                    >
                      <View className="flex-row items-center gap-2 mb-2">
                        <LayoutTemplate size={18} color="#9ca3af" />
                        <Text className="text-white font-bold text-lg">
                          {layout.name}
                        </Text>
                      </View>
                      <Text className="text-gray-400 text-sm mb-4">
                        {layout.table_count || 0} Tables configured
                      </Text>
                      <TouchableOpacity
                        onPress={async () => {
                          await setActiveFloorPlan(layout.id);
                          router.push({
                            pathname: "/tables/floor-plan",
                            params: { returnTo: "/settings/dining-room" },
                          });
                        }}
                        className="flex-row items-center justify-center bg-gray-700 py-2 rounded-md"
                      >
                        <Text className="text-white font-medium mr-2">
                          Edit Layout
                        </Text>
                        <ArrowRight size={14} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={handleCreateFloorPlan}
                    className="w-[48%] bg-[#212121] p-4 rounded-lg border border-dashed border-gray-600 items-center justify-center min-h-[140px]"
                  >
                    <Plus size={24} color="#6b7280" className="mb-2" />
                    <Text className="text-gray-400 font-medium">
                      Create New
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </CardContent>
          </Card>

          {/* Table Configuration Section */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Settings2 color="#f59e0b" size={24} />
                <CardTitle className="text-white">
                  Table Configuration
                </CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Label className="text-gray-400 text-xs mb-1.5">
                    Start Number
                  </Label>
                  <Input
                    className="bg-[#212121] border-gray-600 text-white h-10"
                    value={settings.tableStartNumber.toString()}
                    onChangeText={(v) =>
                      settings.updateDiningSettings({
                        tableStartNumber: parseInt(v) || 1,
                      })
                    }
                    keyboardType="numeric"
                  />
                </View>
                <View className="flex-1">
                  <Label className="text-gray-400 text-xs mb-1.5">Prefix</Label>
                  <Input
                    className="bg-[#212121] border-gray-600 text-white h-10"
                    value={settings.tablePrefix}
                    onChangeText={(v) =>
                      settings.updateDiningSettings({ tablePrefix: v })
                    }
                  />
                </View>
                <View className="flex-1">
                  <Label className="text-gray-400 text-xs mb-1.5">
                    Default Party
                  </Label>
                  <Input
                    className="bg-[#212121] border-gray-600 text-white h-10"
                    value={settings.defaultPartySize.toString()}
                    onChangeText={(v) =>
                      settings.updateDiningSettings({
                        defaultPartySize: parseInt(v) || 2,
                      })
                    }
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View className="h-[1px] bg-gray-700" />

              {/* Merging & Splitting */}
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-white text-base">
                      Allow Table Merging
                    </Label>
                    <Text className="text-gray-400 text-xs">
                      Enables combining tables for large parties
                    </Text>
                  </View>
                  <Switch
                    checked={settings.allowTableMerging}
                    onCheckedChange={(v) =>
                      settings.updateDiningSettings({ allowTableMerging: v })
                    }
                  />
                </View>

                {settings.allowTableMerging && (
                  <View>
                    <Label className="text-gray-400 text-xs mb-1.5">
                      Merge Timeout (minutes)
                    </Label>
                    <Input
                      className="bg-[#212121] border-gray-600 text-white h-10 w-32"
                      placeholder="0 = None"
                      placeholderClassName="text-gray-500"
                      value={
                        settings.mergeTimeoutMinutes === 0
                          ? ""
                          : settings.mergeTimeoutMinutes.toString()
                      }
                      onChangeText={(v) =>
                        settings.updateDiningSettings({
                          mergeTimeoutMinutes: parseInt(v) || 0,
                        })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                )}

                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-white text-base">
                      Allow Table Splitting
                    </Label>
                    <Text className="text-gray-400 text-xs">
                      Multiple checks per table
                    </Text>
                  </View>
                  <Switch
                    checked={settings.allowTableSplitting}
                    onCheckedChange={(v) =>
                      settings.updateDiningSettings({ allowTableSplitting: v })
                    }
                  />
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Table Status Section */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Clock color="#10b981" size={24} />
                <CardTitle className="text-white">Table Status</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Status Legend / Live Counts */}
              <View className="flex-row gap-4 flex-wrap">
                <View className="flex-row items-center gap-2 bg-[#212121] px-3 py-2 rounded-full border border-gray-700">
                  <View className="w-2 h-2 rounded-full bg-green-500" />
                  <Text className="text-white text-sm">
                    {tableStats.available} Available
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 bg-[#212121] px-3 py-2 rounded-full border border-gray-700">
                  <View className="w-2 h-2 rounded-full bg-blue-500" />
                  <Text className="text-white text-sm">
                    {tableStats.inUse} Seated
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 bg-[#212121] px-3 py-2 rounded-full border border-gray-700">
                  <View className="w-2 h-2 rounded-full bg-red-500" />
                  <Text className="text-white text-sm">
                    {tableStats.cleaning} Dirty
                  </Text>
                </View>
              </View>

              <View className="h-[1px] bg-gray-700" />

              {/* Sitting Time & Automation */}
              <View className="gap-4">
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <View>
                      <Label className="text-white text-base">
                        Limit Sitting Time
                      </Label>
                      <Text className="text-gray-400 text-xs">
                        Alert when tables exceed time limit
                      </Text>
                    </View>
                    <Switch
                      checked={settings.defaultSittingTimeMinutes > 0}
                      onCheckedChange={(v) =>
                        settings.setDefaultSittingTimeMinutes(v ? 60 : 0)
                      }
                    />
                  </View>

                  {settings.defaultSittingTimeMinutes > 0 && (
                    <View>
                      <Label className="text-gray-400 text-xs mb-1.5">
                        Duration (minutes)
                      </Label>
                      <Input
                        className="bg-[#212121] border-gray-600 text-white h-10"
                        value={settings.defaultSittingTimeMinutes.toString()}
                        onChangeText={(v) => {
                          const val = parseInt(v);
                          settings.setDefaultSittingTimeMinutes(
                            isNaN(val) ? 0 : val,
                          );
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  )}
                </View>

                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-white text-base">
                      Auto-Update Status
                    </Label>
                    <Text className="text-gray-400 text-xs">
                      Change to 'Dirty' after payment
                    </Text>
                  </View>
                  <Switch
                    checked={settings.autoUpdateTableStatus}
                    onCheckedChange={(v) =>
                      settings.updateDiningSettings({
                        autoUpdateTableStatus: v,
                      })
                    }
                  />
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Server Sections (Mock / Config) */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Users color="#8b5cf6" size={24} />
                <CardTitle className="text-white">Server Sections</CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-white text-base">
                      Auto-Rotate Sections
                    </Label>
                    <Text className="text-gray-400 text-xs">
                      Rotate servers daily
                    </Text>
                  </View>
                  <Switch
                    checked={settings.autoRotateSections}
                    onCheckedChange={(v) =>
                      settings.updateDiningSettings({ autoRotateSections: v })
                    }
                  />
                </View>

                <View className="flex-row items-center justify-between">
                  <View>
                    <Label className="text-white text-base">
                      Balance Section Load
                    </Label>
                    <Text className="text-gray-400 text-xs">
                      Distribute guests evenly
                    </Text>
                  </View>
                  <Switch
                    checked={settings.balanceSectionLoad}
                    onCheckedChange={(v) =>
                      settings.updateDiningSettings({ balanceSectionLoad: v })
                    }
                  />
                </View>
              </View>
              <View className="bg-[#212121] p-4 rounded-lg border border-gray-700 items-center">
                <Grid size={32} color="#4b5563" className="mb-2" />
                <Text className="text-gray-500 text-center">
                  Section visuals are available in the floor plan editor.
                </Text>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

export default DiningRoomScreen;
