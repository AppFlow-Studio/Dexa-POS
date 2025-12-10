import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { calculateMenuEngineering } from "@/lib/analyticsEngine";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  AlertTriangle,
  ArrowRight,
  Beef,
  DollarSign,
  HelpCircle,
  Menu,
  Star,
  TrendingUp,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Custom Slider Component (kept from previous version)
const CustomSlider = ({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onValueChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) => {
  const [width, setWidth] = useState(0);

  const updateValue = (x: number) => {
    if (width === 0) return;
    const percentage = Math.min(Math.max(x / width, 0), 1);
    let newValue = min + percentage * (max - min);
    if (step) {
      newValue = Math.round(newValue / step) * step;
    }
    onValueChange(Math.min(Math.max(newValue, min), max));
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        updateValue(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        updateValue(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <View
      className="h-10 justify-center"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      pointerEvents="box-only"
      {...panResponder.panHandlers}
    >
      <View className="h-2 bg-gray-700 rounded-full w-full overflow-hidden">
        <View
          className="h-full bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </View>
      <View
        className="absolute w-6 h-6 bg-white rounded-full shadow-md border border-gray-300"
        style={{
          left: `${Math.min(Math.max(percentage - 2, 0), 96)}%`,
        }}
      />
    </View>
  );
};

// Quadrant Card
const QuadrantCard = ({
  title,
  subtitle,
  icon: Icon,
  color,
  textColor,
  bgColor,
  count,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  textColor: string;
  bgColor: string;
  count: number;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    className={`flex-1 p-3 rounded-xl border border-gray-700 ${bgColor} mb-2 active:opacity-80`}
  >
    <View className="flex-row items-center gap-2 mb-1 justify-between">
      <View className="flex-row items-center gap-2">
        <Icon size={16} color={color} />
        <Text className={`font-bold ${textColor}`}>{title}</Text>
      </View>
      <Text className="text-white font-bold bg-black/20 px-2 rounded text-xs">
        {count}
      </Text>
    </View>
    <Text className="text-xs text-gray-400">{subtitle}</Text>
  </TouchableOpacity>
);

const FinancialReportsScreen = () => {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Stores
  const salesData = useAnalyticsStore((state) => state.salesData);
  const shiftHistory = useTimeclockStore((state) => state.shiftHistory);
  const employees = useEmployeeStore((state) => state.employees);
  const { targetLaborPercent, setTargetLaborPercent } = useStoreSettingsStore();

  // State
  const [generateMenuEngineering, setGenerateMenuEngineering] = useState(true);
  const [trackLaborCost, setTrackLaborCost] = useState(true);
  const [reportFrequency, setReportFrequency] = useState<{
    value: string;
    label: string;
  }>({
    value: "weekly",
    label: "Weekly",
  });

  // Quadrant Interaction
  const [selectedQuadrant, setSelectedQuadrant] = useState<{
    title: string;
    items: { itemName: string; totalSold: number; profit: number }[];
    description: string;
  } | null>(null);

  // Initialize shift history if empty
  React.useEffect(() => {
    if (shiftHistory.length === 0) {
      useTimeclockStore.getState().initializeHistory();
    }
  }, [shiftHistory.length]);

  // --- Real Logic for Labor Cost ---
  const laborStats = useMemo(() => {
    // 1. Calculate time range
    const now = new Date();
    const startDate = new Date(now);

    if (reportFrequency.value === "daily") {
      startDate.setDate(now.getDate() - 1);
    } else if (reportFrequency.value === "weekly") {
      startDate.setDate(now.getDate() - 7);
    } else if (reportFrequency.value === "monthly") {
      startDate.setDate(now.getDate() - 30);
    }

    // 2. Filter Revenue (Sales)
    const recentSales = salesData.filter((s) => new Date(s.date) >= startDate);
    const totalRevenue = recentSales.reduce(
      (sum, s) => sum + s.salePrice * s.quantitySold,
      0
    );

    // 3. Filter Labor Cost
    // Note: ShiftHistoryEntry duration is string "x.xxh". We need to parse it or use clockIn/Out.
    const recentShifts = shiftHistory.filter(
      (shift) => new Date(shift.clockIn) >= startDate
    );

    let totalLaborCost = 0;

    recentShifts.forEach((shift) => {
      const employee = employees.find((e) => e.id === shift.employeeId);
      if (employee) {
        const hours = parseFloat(shift.duration.replace("h", ""));
        if (!isNaN(hours)) {
          // Base wage cost
          totalLaborCost += hours * employee.baseWage;
        }
      }
    });

    const laborPercent =
      totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0;

    return {
      currentPercent: Math.round(laborPercent), // Round for display
      totalRevenue,
      totalLaborCost,
    };
  }, [salesData, shiftHistory, employees, reportFrequency]);

  // --- Real Logic for Menu Engineering ---
  const menuQuadrants = useMemo(() => {
    // Also filter menu engineering by frequency for consistency
    const now = new Date();
    const startDate = new Date(now);

    if (reportFrequency.value === "daily") {
      startDate.setDate(now.getDate() - 1);
    } else if (reportFrequency.value === "weekly") {
      startDate.setDate(now.getDate() - 7);
    } else if (reportFrequency.value === "monthly") {
      startDate.setDate(now.getDate() - 30);
    }

    const recentSales = salesData.filter((s) => new Date(s.date) >= startDate);

    return calculateMenuEngineering(recentSales);
  }, [salesData, reportFrequency]);

  // Bottom Sheet Handlers
  const handleOpenQuadrant = (
    key: "stars" | "plowhorses" | "puzzles" | "dogs",
    title: string,
    description: string
  ) => {
    setSelectedQuadrant({
      title,
      items: menuQuadrants[key],
      description,
    });
    bottomSheetRef.current?.expand();
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Financial Reports</Text>
        <Text className="text-gray-400 mt-2">
          Real-time analytics based on live sales and labor data.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <View className="gap-6">
          {/* Menu Engineering Report */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Menu color="#3b82f6" size={24} />
                <CardTitle className="text-white">
                  Menu Engineering ({reportFrequency.label})
                </CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Generate Toggle */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">Enable Analysis</Label>
                <Switch
                  checked={generateMenuEngineering}
                  onCheckedChange={setGenerateMenuEngineering}
                />
              </View>

              {/* Frequency Dropdown */}
              <View className="gap-2">
                <Label className="text-gray-300">Report Frequency</Label>
                <Select
                  value={reportFrequency}
                  onValueChange={(val) => {
                    if (val) setReportFrequency(val);
                  }}
                >
                  <SelectTrigger className="w-[180px] bg-[#212121] border-gray-600">
                    <SelectValue
                      placeholder="Select Frequency"
                      className="text-white"
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-[#212121] border-gray-600">
                    <SelectGroup>
                      <SelectItem label="Daily" value="daily" />
                      <SelectItem label="Weekly" value="weekly" />
                      <SelectItem label="Monthly" value="monthly" />
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>

              {generateMenuEngineering && (
                <>
                  {/* Quadrant Analysis Visualization */}
                  <View className="mt-2">
                    <Label className="text-white mb-3">Quadrant Analysis</Label>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <QuadrantCard
                          title="Stars"
                          subtitle="High Profit / High Pop."
                          icon={Star}
                          color="#EAB308" // Yellow-500
                          textColor="text-yellow-500"
                          bgColor="bg-yellow-500/10"
                          count={menuQuadrants.stars.length}
                          onPress={() =>
                            handleOpenQuadrant(
                              "stars",
                              "Stars",
                              "These items are winners. Promote them heavily."
                            )
                          }
                        />
                        <QuadrantCard
                          title="Puzzles"
                          subtitle="High Profit / Low Pop."
                          icon={HelpCircle}
                          color="#3B82F6" // Blue-500
                          textColor="text-blue-500"
                          bgColor="bg-blue-500/10"
                          count={menuQuadrants.puzzles.length}
                          onPress={() =>
                            handleOpenQuadrant(
                              "puzzles",
                              "Puzzles",
                              "High margin but low sales. Try to lower price or market better."
                            )
                          }
                        />
                      </View>
                      <View className="flex-1">
                        <QuadrantCard
                          title="Plowhorses"
                          subtitle="Low Profit / High Pop."
                          icon={Beef}
                          color="#F97316" // Orange-500
                          textColor="text-orange-500"
                          bgColor="bg-orange-500/10"
                          count={menuQuadrants.plowhorses.length}
                          onPress={() =>
                            handleOpenQuadrant(
                              "plowhorses",
                              "Plowhorses",
                              "Popular but low margin. Try to increase price or reduce cost."
                            )
                          }
                        />
                        <QuadrantCard
                          title="Dogs"
                          subtitle="Low Profit / Low Pop."
                          icon={AlertTriangle}
                          color="#EF4444" // Red-500
                          textColor="text-red-500"
                          bgColor="bg-red-500/10"
                          count={menuQuadrants.dogs.length}
                          onPress={() =>
                            handleOpenQuadrant(
                              "dogs",
                              "Dogs",
                              "Low sales and low margin. Consider removing from menu."
                            )
                          }
                        />
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity className="flex-row items-center justify-center bg-blue-600 p-4 rounded-lg mt-2">
                    <Text className="text-white font-bold text-base mr-2">
                      View Detailed Report
                    </Text>
                    <ArrowRight color="white" size={18} />
                  </TouchableOpacity>
                </>
              )}
            </CardContent>
          </Card>

          {/* Labor Cost Optimization */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <DollarSign color="#22c55e" size={24} />
                <CardTitle className="text-white">
                  Labor Cost Optimization ({reportFrequency.label})
                </CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Track Toggle */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Track Labor Cost %
                </Label>
                <Switch
                  checked={trackLaborCost}
                  onCheckedChange={setTrackLaborCost}
                />
              </View>

              {trackLaborCost && (
                <>
                  {/* Target Percentage Slider */}
                  <View className="gap-3">
                    <View className="flex-row justify-between">
                      <Label className="text-gray-300">Target Percentage</Label>
                      <Text className="text-white font-bold">
                        {targetLaborPercent}%
                      </Text>
                    </View>
                    <CustomSlider
                      value={targetLaborPercent}
                      onValueChange={setTargetLaborPercent} // Update Global Store
                      min={10}
                      max={50}
                      step={1}
                    />
                  </View>

                  {/* Current vs Target Display */}
                  <View className="gap-2">
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-gray-400">Current vs Target</Text>
                      <Text
                        className={
                          laborStats.currentPercent > targetLaborPercent
                            ? "text-red-500 font-bold"
                            : "text-green-500 font-bold"
                        }
                      >
                        {laborStats.currentPercent}% / {targetLaborPercent}%
                      </Text>
                    </View>
                    <Progress
                      value={(laborStats.currentPercent / 50) * 100}
                      className="h-3 bg-gray-700"
                      indicatorClassName={
                        laborStats.currentPercent > targetLaborPercent
                          ? "bg-red-500"
                          : "bg-green-500"
                      }
                    />
                    {laborStats.currentPercent > targetLaborPercent && (
                      <View className="flex-row items-center mt-1">
                        <TrendingUp size={14} color="#EF4444" />
                        <Text className="text-red-500 text-xs ml-1">
                          Exceeding target by{" "}
                          {laborStats.currentPercent - targetLaborPercent}%
                        </Text>
                      </View>
                    )}

                    <Text className="text-gray-500 text-xs mt-1">
                      Based on ${laborStats.totalRevenue.toFixed(0)} Revenue and
                      ${laborStats.totalLaborCost.toFixed(0)} Wages
                    </Text>
                  </View>
                </>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      {/* Bottom Sheet for Menu Details */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["50%", "80%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#4B5563" }}
      >
        <BottomSheetView className="flex-1 bg-[#212121] px-6 pt-2 pb-6">
          {selectedQuadrant && (
            <>
              <View className="mb-4 border-b border-gray-700 pb-4">
                <Text className="text-2xl font-bold text-white mb-1">
                  {selectedQuadrant.title} ({selectedQuadrant.items.length})
                </Text>
                <Text className="text-gray-400">
                  {selectedQuadrant.description}
                </Text>
              </View>

              <BottomSheetScrollView showsVerticalScrollIndicator={false}>
                {selectedQuadrant.items.map((item, idx) => (
                  <View
                    key={idx}
                    className="flex-row justify-between items-center py-3 border-b border-gray-800 last:border-0"
                  >
                    <View className="flex-1">
                      <Text className="text-white font-semibold text-base">
                        {item.itemName}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {item.totalSold} sold • $
                        {(item.profit / item.totalSold).toFixed(2)} margin/item
                      </Text>
                    </View>
                    <Text className="text-green-500 font-bold ml-4">
                      +${item.profit.toFixed(0)}
                    </Text>
                  </View>
                ))}

                {selectedQuadrant.items.length === 0 && (
                  <Text className="text-gray-500 text-center mt-8">
                    No items found in this category.
                  </Text>
                )}
                <View className="h-10" />
              </BottomSheetScrollView>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
};

export default FinancialReportsScreen;
