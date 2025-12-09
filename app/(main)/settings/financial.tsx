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
import React, { useState } from "react";
import {
  PanResponder,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Custom Slider Component
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
          left: `${Math.min(Math.max(percentage - 2, 0), 96)}%`, // Adjust to keep thumb within bounds roughly
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
}: {
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  textColor: string;
  bgColor: string;
}) => (
  <View
    className={`flex-1 p-3 rounded-xl border border-gray-700 ${bgColor} mb-2`}
  >
    <View className="flex-row items-center gap-2 mb-1">
      <Icon size={16} color={color} />
      <Text className={`font-bold ${textColor}`}>{title}</Text>
    </View>
    <Text className="text-xs text-gray-400">{subtitle}</Text>
  </View>
);

const FinancialReportsScreen = () => {
  const insets = useSafeAreaInsets();

  // State for Menu Engineering
  const [generateMenuEngineering, setGenerateMenuEngineering] = useState(false);
  const [reportFrequency, setReportFrequency] = useState({
    value: "weekly",
    label: "Weekly",
  });

  // State for Labor Cost
  const [trackLaborCost, setTrackLaborCost] = useState(false);
  const [targetLaborPercent, setTargetLaborPercent] = useState(25);
  const [laborAlerts, setLaborAlerts] = useState(false);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState(false);

  // Mock Data for "Current vs Target"
  const currentLaborPercent = 28; // Example value exceeding target

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Financial Reports</Text>
        <Text className="text-gray-400 mt-2">
          Manage report generation and labor cost optimization.
        </Text>
      </View>

      <View className="h-[1px] w-full bg-gray-700 mb-6" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="gap-6">
          {/* Menu Engineering Report */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <Menu color="#3b82f6" size={24} />
                <CardTitle className="text-white">
                  Menu Engineering Report
                </CardTitle>
              </View>
            </CardHeader>
            <CardContent className="gap-6">
              {/* Generate Toggle */}
              <View className="flex-row items-center justify-between">
                <Label className="text-white text-base">
                  Generate Menu Engineering
                </Label>
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
                    />
                    <QuadrantCard
                      title="Puzzles"
                      subtitle="High Profit / Low Pop."
                      icon={HelpCircle}
                      color="#3B82F6" // Blue-500
                      textColor="text-blue-500"
                      bgColor="bg-blue-500/10"
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
                    />
                    <QuadrantCard
                      title="Dogs"
                      subtitle="Low Profit / Low Pop."
                      icon={AlertTriangle}
                      color="#EF4444" // Red-500
                      textColor="text-red-500"
                      bgColor="bg-red-500/10"
                    />
                  </View>
                </View>
              </View>

              {/* View Latest Report Button */}
              <TouchableOpacity className="flex-row items-center justify-center bg-blue-600 p-4 rounded-lg mt-2">
                <Text className="text-white font-bold text-base mr-2">
                  View Latest Report
                </Text>
                <ArrowRight color="white" size={18} />
              </TouchableOpacity>
            </CardContent>
          </Card>

          {/* Labor Cost Optimization */}
          <Card className="bg-[#303030] border-gray-600">
            <CardHeader>
              <View className="flex-row items-center gap-3">
                <DollarSign color="#22c55e" size={24} />
                <CardTitle className="text-white">
                  Labor Cost Optimization
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
                  onValueChange={setTargetLaborPercent}
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
                      currentLaborPercent > targetLaborPercent
                        ? "text-red-500 font-bold"
                        : "text-green-500 font-bold"
                    }
                  >
                    {currentLaborPercent}% / {targetLaborPercent}%
                  </Text>
                </View>
                <Progress
                  value={(currentLaborPercent / 50) * 100}
                  className="h-3 bg-gray-700"
                  indicatorClassName={
                    currentLaborPercent > targetLaborPercent
                      ? "bg-red-500"
                      : "bg-green-500"
                  }
                />
                {currentLaborPercent > targetLaborPercent && (
                  <View className="flex-row items-center mt-1">
                    <TrendingUp size={14} color="#EF4444" />
                    <Text className="text-red-500 text-xs ml-1">
                      Exceeding target by{" "}
                      {currentLaborPercent - targetLaborPercent}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Alerts Toggle */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <Label className="text-white text-base">Alerts</Label>
                  <Text className="text-gray-400 text-sm">
                    Notify when labor cost exceeds target
                  </Text>
                </View>
                <Switch
                  checked={laborAlerts}
                  onCheckedChange={setLaborAlerts}
                />
              </View>

              {/* Optimization Suggestions Toggle */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <Label className="text-white text-base">
                    Optimization Suggestions
                  </Label>
                  <Text className="text-gray-400 text-sm">
                    Show smart scheduling tips
                  </Text>
                </View>
                <Switch
                  checked={optimizationSuggestions}
                  onCheckedChange={setOptimizationSuggestions}
                />
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
};

export default FinancialReportsScreen;
