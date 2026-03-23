import CustomSlider from "@/components/ui/custom-slider";
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
import { bottomSheetTheme, colors } from "@/lib/theme";
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
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Quadrant Card
const QuadrantCard = ({
  title,
  subtitle,
  icon: Icon,
  color,
  count,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  count: number;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flex: 1,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: color + "40",
      backgroundColor: color + "12",
      marginBottom: 8,
    }}
    activeOpacity={0.75}
  >
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: color + "20", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={color} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>{title}</Text>
      </View>
      <View style={{ backgroundColor: color + "25", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: color }}>{count}</Text>
      </View>
    </View>
    <Text style={{ fontSize: 11, color: colors.muted }}>{subtitle}</Text>
  </TouchableOpacity>
);

const FinancialReportsScreen = () => {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Stores
  const salesData = useAnalyticsStore((state) => state.salesData);
  const shiftHistory = useTimeclockStore((state) => state.shiftHistory);
  const employees = useEmployeeStore((state) => state.employees);
  const targetLaborPercent = useStoreSettingsStore((s) => s.targetLaborPercent);
  const setTargetLaborPercent = useStoreSettingsStore((s) => s.setTargetLaborPercent);

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

  // NOTE: Shift history is now hydrated from the backend via PosSyncProvider.
  // If empty, it means the fetch hasn't completed yet or no shifts exist.

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

  const laborOver = laborStats.currentPercent > targetLaborPercent;

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Header */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Financial Reports</Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
          Real-time analytics based on live sales and labor data.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80, gap: 12 }}
      >
        {/* Menu Engineering Report */}
        <View style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 14,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.teal + "15", alignItems: "center", justifyContent: "center" }}>
              <Menu size={16} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
              Menu Engineering ({reportFrequency.label})
            </Text>
          </View>

          {/* Generate Toggle */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: colors.heading }}>Enable Analysis</Text>
            <Switch
              checked={generateMenuEngineering}
              onCheckedChange={setGenerateMenuEngineering}
            />
          </View>

          {/* Frequency Dropdown */}
          <View style={{ marginBottom: generateMenuEngineering ? 14 : 0 }}>
            <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>Report Frequency</Text>
            <Select
              value={reportFrequency}
              onValueChange={(val) => {
                if (val) setReportFrequency(val);
              }}
            >
              <SelectTrigger className="w-[180px] bg-screen border-gray-600">
                <SelectValue
                  placeholder="Select Frequency"
                  className="text-white"
                />
              </SelectTrigger>
              <SelectContent className="bg-screen border-gray-600">
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
              {/* Quadrant Analysis */}
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Quadrant Analysis</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <QuadrantCard
                    title="Stars"
                    subtitle="High Profit / High Pop."
                    icon={Star}
                    color="#EAB308"
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
                    color={colors.info}
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
                <View style={{ flex: 1 }}>
                  <QuadrantCard
                    title="Plowhorses"
                    subtitle="Low Profit / High Pop."
                    icon={Beef}
                    color="#F97316"
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
                    color={colors.danger}
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

              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  padding: 12,
                  borderRadius: 10,
                  marginTop: 8,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal }}>
                  View Detailed Report
                </Text>
                <ArrowRight color={colors.teal} size={15} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Labor Cost Optimization */}
        <View style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 14,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.success + "15", alignItems: "center", justifyContent: "center" }}>
              <DollarSign size={16} color={colors.success} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
              Labor Cost Optimization ({reportFrequency.label})
            </Text>
          </View>

          {/* Track Toggle */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: colors.heading }}>Track Labor Cost %</Text>
            <Switch
              checked={trackLaborCost}
              onCheckedChange={setTrackLaborCost}
            />
          </View>

          {trackLaborCost && (
            <>
              {/* Target Percentage Slider */}
              <View style={{ gap: 8, marginBottom: 14 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: colors.label }}>Target Percentage</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>
                    {targetLaborPercent}%
                  </Text>
                </View>
                <CustomSlider
                  value={targetLaborPercent}
                  onValueChange={setTargetLaborPercent}
                  min={10}
                  max={50}
                  step={1}
                />
              </View>

              {/* Current vs Target Display */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.label }}>Current vs Target</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: laborOver ? colors.danger : colors.success }}>
                    {laborStats.currentPercent}% / {targetLaborPercent}%
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: `${Math.min(100, (laborStats.currentPercent / 50) * 100)}%`,
                      backgroundColor: laborOver ? colors.danger : colors.teal,
                    }}
                  />
                </View>

                {laborOver && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <TrendingUp size={13} color={colors.danger} />
                    <Text style={{ fontSize: 11, color: colors.danger }}>
                      Exceeding target by {laborStats.currentPercent - targetLaborPercent}%
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  Based on ${laborStats.totalRevenue.toFixed(0)} Revenue and ${laborStats.totalLaborCost.toFixed(0)} Wages
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Bottom Sheet for Menu Details */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["50%", "80%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        {...bottomSheetTheme}
      >
        <BottomSheetView style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
          {selectedQuadrant && (
            <>
              <View style={{ marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 4 }}>
                  {selectedQuadrant.title} ({selectedQuadrant.items.length})
                </Text>
                <Text style={{ fontSize: 12, color: colors.label }}>
                  {selectedQuadrant.description}
                </Text>
              </View>

              <BottomSheetScrollView showsVerticalScrollIndicator={false}>
                {selectedQuadrant.items.map((item, idx) => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                        {item.itemName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {item.totalSold} sold • ${(item.profit / item.totalSold).toFixed(2)} margin/item
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success, marginLeft: 12 }}>
                      +${item.profit.toFixed(0)}
                    </Text>
                  </View>
                ))}

                {selectedQuadrant.items.length === 0 && (
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 32 }}>
                    No items found in this category.
                  </Text>
                )}
                <View style={{ height: 40 }} />
              </BottomSheetScrollView>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
};

export default FinancialReportsScreen;
