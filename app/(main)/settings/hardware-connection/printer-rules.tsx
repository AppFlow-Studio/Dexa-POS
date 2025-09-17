// 1. Import the Select primitives directly from your UI library
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOCK_CATEGORIES,
  MOCK_PRINTERS,
  MOCK_PRINTER_RULES,
} from "@/lib/mockData";
import { PrinterRule } from "@/lib/types";
import {
  CreditCard,
  Monitor,
  Plus,
  Printer,
  Receipt,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// --- Reusable Component for a Single Rule Row ---

interface RuleRowProps {
  rule: PrinterRule;
  onUpdate: (updatedRule: PrinterRule) => void;
  onDelete: (id: string) => void;
}

const RuleRow: React.FC<RuleRowProps> = ({ rule, onUpdate, onDelete }) => {
  const printerOptions = MOCK_PRINTERS.map((p) => ({
    label: p.name,
    value: p.id,
  }));
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <View className="flex-row items-center p-6 bg-[#212121] border border-gray-600 rounded-2xl">
      <Switch
        value={rule.isEnabled}
        onValueChange={(value) => onUpdate({ ...rule, isEnabled: value })}
        trackColor={{ false: "#DCDCDC", true: "#31A961" }}
        thumbColor={"#ffffff"}
        style={{ transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }] }}
      />

      <View className="flex-1 mx-4">
        {/* 2. Use the correct Select implementation for Category */}
        <Select
          value={MOCK_CATEGORIES.find((c) => c.value === rule.category)}
          onValueChange={(option) =>
            option && onUpdate({ ...rule, category: option.value })
          }
        >
          <SelectTrigger className="w-full p-4 bg-[#303030] rounded-lg flex-row justify-between items-center border-gray-600">
            <SelectValue
              placeholder="Select Category"
              className="text-2xl text-white h-8"
            />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <SelectGroup>
              {MOCK_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} label={cat.label} value={cat.value}>
                  <Text className="text-2xl">{cat.label}</Text>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </View>

      <View className="flex-1">
        {/* 3. Use the correct Select implementation for Printer */}
        <Select
          value={printerOptions.find((p) => p.value === rule.printerId)}
          onValueChange={(option) =>
            option && onUpdate({ ...rule, printerId: option.value })
          }
        >
          <SelectTrigger className="w-full p-4 bg-[#303030] rounded-lg flex-row justify-between items-center border-gray-600">
            <SelectValue
              placeholder="Select Printer"
              className="text-2xl text-white h-8"
            />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <SelectGroup>
              {printerOptions.map((p) => (
                <SelectItem key={p.value} label={p.label} value={p.value}>
                  <Text className="text-2xl">{p.label}</Text>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </View>

      <TouchableOpacity
        onPress={() => onDelete(rule.id)}
        className="p-4 ml-4 border border-gray-600 rounded-full"
      >
        <Trash2 color="#9CA3AF" size={24} />
      </TouchableOpacity>
    </View>
  );
};

// --- The Main Screen Component ---

const PrinterRulesScreen = () => {
  const [rules, setRules] = useState<PrinterRule[]>(MOCK_PRINTER_RULES);
  const [newRuleCategory, setNewRuleCategory] = useState<
    { label: string; value: string } | undefined
  >();
  const [newRulePrinter, setNewRulePrinter] = useState<
    { label: string; value: string } | undefined
  >();

  const hardwareSubsections = [
    {
      id: "printer",
      title: "Printers",
      subtitle: "Receipt & Kitchen",
      route: "/settings/hardware-connection/printer",
      icon: <Printer color="#3b82f6" size={24} />,
    },
    {
      id: "printer-rules",
      title: "Printer Rules",
      subtitle: "Print Configuration",
      route: "/settings/hardware-connection/printer-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
    {
      id: "customer-display",
      title: "Customer Display",
      subtitle: "Order Display",
      route: "/settings/hardware-connection/customer-display",
      icon: <Monitor color="#3b82f6" size={24} />,
    },
    {
      id: "payment-terminal",
      title: "Payment Terminal",
      subtitle: "Card Processing",
      route: "/settings/hardware-connection/payment-terminal",
      icon: <CreditCard color="#3b82f6" size={24} />,
    },
  ];

  const printerOptions = MOCK_PRINTERS.map((p) => ({
    label: p.name,
    value: p.id,
  }));
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const handleUpdateRule = (updatedRule: PrinterRule) => {
    setRules((currentRules) =>
      currentRules.map((rule) =>
        rule.id === updatedRule.id ? updatedRule : rule
      )
    );
  };

  const handleDeleteRule = (id: string) => {
    setRules((currentRules) => currentRules.filter((rule) => rule.id !== id));
  };

  const handleAddRule = () => {
    if (!newRuleCategory || !newRulePrinter) {
      alert("Please select both a category and a printer.");
      return;
    }
    const newRule: PrinterRule = {
      id: `rule_${Date.now()}`,
      isEnabled: true,
      category: newRuleCategory.value,
      printerId: newRulePrinter.value,
    };
    setRules((currentRules) => [...currentRules, newRule]);
    setNewRuleCategory(undefined);
    setNewRulePrinter(undefined);
  };

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Hardware & Connection"
          subsections={hardwareSubsections}
          currentRoute="/settings/hardware-connection/printer-rules"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          <View className="flex-1">
            <FlatList
              data={rules}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <RuleRow
                  rule={item}
                  onUpdate={handleUpdateRule}
                  onDelete={handleDeleteRule}
                />
              )}
              ItemSeparatorComponent={() => <View className="h-4" />}
            />
          </View>

          <View className="mt-6 pt-6 border-t border-gray-600">
            <View className="flex-row items-center mb-2">
              <Plus color="#9CA3AF" size={24} />
              <Text className="font-bold text-2xl text-white ml-2">
                Add New
              </Text>
            </View>
            <View className="flex-row items-center p-6 border border-gray-600 rounded-2xl">
              <View className="flex-1 mx-4">
                <Select
                  value={newRuleCategory}
                  onValueChange={setNewRuleCategory}
                >
                  <SelectTrigger className="w-full p-4 bg-[#303030] rounded-lg flex-row justify-between items-center border-gray-600">
                    <SelectValue
                      placeholder="Category"
                      className="text-2xl text-white h-8"
                    />
                  </SelectTrigger>
                  <SelectContent insets={contentInsets}>
                    <SelectGroup>
                      {MOCK_CATEGORIES.map((cat) => (
                        <SelectItem
                          key={cat.value}
                          label={cat.label}
                          value={cat.value}
                        >
                          <Text className="text-2xl">{cat.label}</Text>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
              <View className="flex-1">
                <Select
                  value={newRulePrinter}
                  onValueChange={setNewRulePrinter}
                >
                  <SelectTrigger className="w-full p-4 bg-[#303030] rounded-lg flex-row justify-between items-center border-gray-600">
                    <SelectValue
                      placeholder="Printer"
                      className="text-2xl text-white h-8"
                    />
                  </SelectTrigger>
                  <SelectContent insets={contentInsets}>
                    <SelectGroup>
                      {printerOptions.map((p) => (
                        <SelectItem
                          key={p.value}
                          label={p.label}
                          value={p.value}
                        >
                          <Text className="text-2xl">{p.label}</Text>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
              <TouchableOpacity
                onPress={handleAddRule}
                className="py-2 px-6 ml-4 border border-gray-500 rounded-xl"
              >
                <Text className="text-2xl font-bold text-gray-300">Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row justify-start mt-6 pt-4 border-t border-gray-600">
            <TouchableOpacity className="px-8 py-4 bg-blue-500 rounded-lg">
              <Text className="text-2xl font-bold text-white">
                Save Changes
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default PrinterRulesScreen;
