import {
  Check,
  ChevronDown,
  ChevronRight,
  Printer,
  Search,
  X,
} from "lucide-react-native";
import { colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import type {
  PrinterConfig,
  PrinterRoutingConfig,
  PrinterRoutingMode,
} from "@/types/printer";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// PROPS
// ---------------------------------------------------------------------------

interface PrinterRoutingModalProps {
  visible: boolean;
  onClose: () => void;
  printer: PrinterConfig;
}

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------

type RoutingTab = "assignments" | "items" | "settings";

const TABS: { key: RoutingTab; label: string }[] = [
  { key: "assignments", label: "Assignments" },
  { key: "items", label: "Items" },
  { key: "settings", label: "Settings" },
];

// ---------------------------------------------------------------------------
// ORDER TYPE OPTIONS
// ---------------------------------------------------------------------------

const ORDER_TYPES = [
  { value: "dine_in", label: "Dine In" },
  { value: "takeout", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function PrinterRoutingModal({
  visible,
  onClose,
  printer,
}: PrinterRoutingModalProps) {
  const [activeTab, setActiveTab] = useState<RoutingTab>("assignments");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Store selectors
  const routingConfig = usePrinterStore((s) => s.routingConfigs[printer.id]) ?? {
    printerId: printer.id,
    routingMode: printer.routingMode,
    printModifiers: printer.printModifiers,
    rules: [],
  };

  const setRoutingMode = usePrinterStore((s) => s.setRoutingMode);
  const setPrintModifiers = usePrinterStore((s) => s.setPrintModifiers);
  const upsertRoutingRule = usePrinterStore((s) => s.upsertRoutingRule);
  const removeRoutingRule = usePrinterStore((s) => s.removeRoutingRule);
  const bulkSetRules = usePrinterStore((s) => s.bulkSetRules);

  // Menu data
  const categories = useMenuStore((s) => s.categories);
  const menuItems = useMenuStore((s) => s.menuItems);
  const categoriesById = useMenuStore((s) => s.categoriesById);

  // Derived rule lookups
  const enabledCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules) {
      if (r.rule_type === "category" && r.is_enabled) set.add(r.rule_value);
    }
    return set;
  }, [routingConfig.rules]);

  const enabledItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules) {
      if (r.rule_type === "menu_item" && r.is_enabled) set.add(r.rule_value);
    }
    return set;
  }, [routingConfig.rules]);

  const enabledOrderTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules) {
      if (r.rule_type === "order_type" && r.is_enabled) set.add(r.rule_value);
    }
    return set;
  }, [routingConfig.rules]);

  // Build category -> items mapping
  const categoryItemsMap = useMemo(() => {
    const map: Record<string, typeof menuItems> = {};
    const uncategorized: typeof menuItems = [];

    for (const item of menuItems) {
      if (!item.category || item.category.length === 0) {
        uncategorized.push(item);
        continue;
      }
      for (const catName of item.category) {
        // Find category by name to get its ID
        const cat = categories.find((c) => c.name === catName);
        const key = cat?.id ?? catName;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
    }

    if (uncategorized.length > 0) {
      map["__uncategorized__"] = uncategorized;
    }
    return map;
  }, [menuItems, categories]);

  // Filter by search
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter((cat) => {
      if (cat.name.toLowerCase().includes(q)) return true;
      const items = categoryItemsMap[cat.id] ?? [];
      return items.some((i) => i.name.toLowerCase().includes(q));
    });
  }, [categories, searchQuery, categoryItemsMap]);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleRoutingModeChange = useCallback(
    async (mode: PrinterRoutingMode) => {
      setIsSaving(true);
      try {
        await setRoutingMode(printer.id, mode);
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, setRoutingMode],
  );

  const handleOrderTypeToggle = useCallback(
    async (orderType: string) => {
      setIsSaving(true);
      try {
        if (enabledOrderTypes.has(orderType)) {
          const rule = routingConfig.rules.find(
            (r) => r.rule_type === "order_type" && r.rule_value === orderType,
          );
          if (rule) await removeRoutingRule(printer.id, rule.id);
        } else {
          await upsertRoutingRule(printer.id, "order_type", orderType);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, enabledOrderTypes, routingConfig.rules, removeRoutingRule, upsertRoutingRule],
  );

  const handleCategoryToggle = useCallback(
    async (categoryId: string) => {
      setIsSaving(true);
      try {
        if (enabledCategoryIds.has(categoryId)) {
          const rule = routingConfig.rules.find(
            (r) => r.rule_type === "category" && r.rule_value === categoryId,
          );
          if (rule) await removeRoutingRule(printer.id, rule.id);
        } else {
          await upsertRoutingRule(printer.id, "category", categoryId);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, enabledCategoryIds, routingConfig.rules, removeRoutingRule, upsertRoutingRule],
  );

  const handleItemToggle = useCallback(
    async (itemId: string) => {
      setIsSaving(true);
      try {
        if (enabledItemIds.has(itemId)) {
          const rule = routingConfig.rules.find(
            (r) => r.rule_type === "menu_item" && r.rule_value === itemId,
          );
          if (rule) await removeRoutingRule(printer.id, rule.id);
        } else {
          await upsertRoutingRule(printer.id, "menu_item", itemId);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, enabledItemIds, routingConfig.rules, removeRoutingRule, upsertRoutingRule],
  );

  const handleAllItemsToggle = useCallback(async () => {
    setIsSaving(true);
    try {
      const allCategoryIds = categories.map((c) => c.id);
      const allEnabled = allCategoryIds.every((id) => enabledCategoryIds.has(id));
      await bulkSetRules(
        printer.id,
        "category",
        allCategoryIds.map((id) => ({
          ruleValue: id,
          enabled: !allEnabled,
        })),
      );
    } finally {
      setIsSaving(false);
    }
  }, [printer.id, categories, enabledCategoryIds, bulkSetRules]);

  const toggleCategoryExpand = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  // Check if all items in a category are individually toggled on
  const isCategoryFullySelected = useCallback(
    (categoryId: string): boolean => {
      if (enabledCategoryIds.has(categoryId)) return true;
      const items = categoryItemsMap[categoryId] ?? [];
      if (items.length === 0) return false;
      return items.every((i) => enabledItemIds.has(i.id));
    },
    [enabledCategoryIds, enabledItemIds, categoryItemsMap],
  );

  const allCategoriesEnabled = useMemo(
    () => categories.length > 0 && categories.every((c) => enabledCategoryIds.has(c.id)),
    [categories, enabledCategoryIds],
  );

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-panel">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-700">
          <View className="flex-row items-center">
            <Printer size={20} color={colors.warning} />
            <Text className="text-white font-bold text-lg ml-2" numberOfLines={1}>
              {printer.printerName}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} className="p-2 bg-card rounded-lg">
            <X size={20} color={colors.label} />
          </TouchableOpacity>
        </View>

        {/* Tab Bar */}
        <View className="flex-row px-4 pt-3 pb-2">
          {TABS.map((tab) => {
            // Hide Items tab when not in custom mode
            if (tab.key === "items" && routingConfig.routingMode !== "custom") return null;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 rounded-lg mr-2 ${
                  activeTab === tab.key ? "bg-blue-600" : "bg-surface"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    activeTab === tab.key ? "text-white" : "text-gray-400"
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          {isSaving && (
            <View className="ml-auto items-center justify-center">
              <ActivityIndicator size="small" color={colors.info} />
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView
          className="flex-1 px-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* ============================================================ */}
          {/* ASSIGNMENTS TAB                                              */}
          {/* ============================================================ */}
          {activeTab === "assignments" && (
            <View>
              {/* Routing Mode */}
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-1">
                Routing Mode
              </Text>
              {(
                [
                  { mode: "all" as const, label: "All Items", desc: "Receives every kitchen item" },
                  { mode: "unassigned" as const, label: "Unassigned Only", desc: "Catch-all for items not matched by other printers" },
                  { mode: "custom" as const, label: "Custom Rules", desc: "Configure specific categories and items" },
                ] as const
              ).map(({ mode, label, desc }) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleRoutingModeChange(mode)}
                  className={`flex-row items-center p-3 rounded-lg mb-2 border ${
                    routingConfig.routingMode === mode
                      ? "bg-blue-600/15 border-blue-500"
                      : "bg-surface border-gray-600"
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                      routingConfig.routingMode === mode
                        ? "border-blue-400 bg-blue-500"
                        : "border-gray-500"
                    }`}
                  >
                    {routingConfig.routingMode === mode && (
                      <Check size={12} color="white" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-medium text-sm">{label}</Text>
                    <Text className="text-gray-500 text-xs">{desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Order Types (visible when custom or unassigned) */}
              {(routingConfig.routingMode === "custom" || routingConfig.routingMode === "unassigned") && (
                <>
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2 px-1">
                    Order Types
                  </Text>
                  <Text className="text-gray-500 text-xs mb-3 px-1">
                    {enabledOrderTypes.size === 0
                      ? "All order types accepted (no filter)"
                      : "Only selected order types will route to this printer"}
                  </Text>
                  {ORDER_TYPES.map(({ value, label }) => (
                    <View
                      key={value}
                      className="flex-row items-center justify-between py-3 px-3 bg-surface rounded-lg mb-2"
                    >
                      <Text className="text-white text-sm">{label}</Text>
                      <Switch
                        checked={enabledOrderTypes.has(value)}
                        onCheckedChange={() => handleOrderTypeToggle(value)}
                      />
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* ITEMS TAB                                                    */}
          {/* ============================================================ */}
          {activeTab === "items" && routingConfig.routingMode === "custom" && (
            <View>
              {/* Search */}
              <View className="flex-row items-center bg-surface border border-gray-600 rounded-lg px-3 py-2 mt-3 mb-3">
                <Search size={16} color={colors.muted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search categories or items..."
                  placeholderTextColor={colors.muted}
                  className="flex-1 text-white text-sm ml-2"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* All Items toggle */}
              <View className="flex-row items-center justify-between py-3 px-3 bg-surface rounded-lg mb-3 border border-gray-600">
                <Text className="text-white font-medium text-sm">All Items</Text>
                <Switch
                  checked={allCategoriesEnabled}
                  onCheckedChange={handleAllItemsToggle}
                />
              </View>

              {/* Category list */}
              {filteredCategories.map((cat) => {
                const isExpanded = expandedCategories.has(cat.id);
                const catItems = categoryItemsMap[cat.id] ?? [];
                const isFullySelected = isCategoryFullySelected(cat.id);
                const hasCategoryRule = enabledCategoryIds.has(cat.id);

                // Filter items by search
                const q = searchQuery.toLowerCase().trim();
                const visibleItems = q
                  ? catItems.filter((i) => i.name.toLowerCase().includes(q))
                  : catItems;

                return (
                  <View key={cat.id} className="mb-2">
                    {/* Category row */}
                    <View className="flex-row items-center bg-surface rounded-lg border border-gray-600 overflow-hidden">
                      <TouchableOpacity
                        onPress={() => toggleCategoryExpand(cat.id)}
                        className="p-3"
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} color={colors.label} />
                        ) : (
                          <ChevronRight size={16} color={colors.label} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleCategoryExpand(cat.id)}
                        className="flex-1 py-3"
                      >
                        <Text className="text-white font-medium text-sm">{cat.name}</Text>
                        <Text className="text-gray-500 text-xs">
                          {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                        </Text>
                      </TouchableOpacity>
                      <View className="pr-3">
                        <Switch
                          checked={isFullySelected || hasCategoryRule}
                          onCheckedChange={() => handleCategoryToggle(cat.id)}
                        />
                      </View>
                    </View>

                    {/* Expanded items */}
                    {isExpanded && visibleItems.length > 0 && (
                      <View className="ml-6 mt-1">
                        {visibleItems.map((item) => {
                          const isItemEnabled =
                            enabledItemIds.has(item.id) || hasCategoryRule;
                          return (
                            <View
                              key={item.id}
                              className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-lg mb-1 border border-gray-700"
                            >
                              <View className="flex-1 mr-2">
                                <Text className="text-gray-300 text-sm" numberOfLines={1}>
                                  {item.name}
                                </Text>
                              </View>
                              <Switch
                                checked={isItemEnabled}
                                onCheckedChange={() => handleItemToggle(item.id)}
                                disabled={hasCategoryRule}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Uncategorized items */}
              {categoryItemsMap["__uncategorized__"] && (
                <View className="mb-2">
                  <View className="flex-row items-center bg-surface rounded-lg border border-gray-600 overflow-hidden">
                    <TouchableOpacity
                      onPress={() => toggleCategoryExpand("__uncategorized__")}
                      className="p-3"
                    >
                      {expandedCategories.has("__uncategorized__") ? (
                        <ChevronDown size={16} color={colors.label} />
                      ) : (
                        <ChevronRight size={16} color={colors.label} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleCategoryExpand("__uncategorized__")}
                      className="flex-1 py-3"
                    >
                      <Text className="text-gray-400 font-medium text-sm italic">
                        Uncategorized
                      </Text>
                      <Text className="text-gray-500 text-xs">
                        {categoryItemsMap["__uncategorized__"].length} item
                        {categoryItemsMap["__uncategorized__"].length !== 1 ? "s" : ""}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {expandedCategories.has("__uncategorized__") && (
                    <View className="ml-6 mt-1">
                      {categoryItemsMap["__uncategorized__"].map((item) => (
                        <View
                          key={item.id}
                          className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-lg mb-1 border border-gray-700"
                        >
                          <Text className="text-gray-300 text-sm flex-1 mr-2" numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Switch
                            checked={enabledItemIds.has(item.id)}
                            onCheckedChange={() => handleItemToggle(item.id)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* SETTINGS TAB                                                 */}
          {/* ============================================================ */}
          {activeTab === "settings" && (
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-1">
                Ticket Options
              </Text>

              {/* Print Modifiers */}
              <View className="flex-row items-center justify-between py-3 px-3 bg-surface rounded-lg mb-2">
                <View className="flex-1 pr-4">
                  <Text className="text-white text-sm font-medium">Print Modifiers</Text>
                  <Text className="text-gray-500 text-xs">
                    Show item modifiers and add-ons on kitchen tickets
                  </Text>
                </View>
                <Switch
                  checked={routingConfig.printModifiers}
                  onCheckedChange={(v) => setPrintModifiers(printer.id, v)}
                />
              </View>

              {/* Print Order Tickets */}
              <View className="flex-row items-center justify-between py-3 px-3 bg-surface rounded-lg mb-2">
                <View className="flex-1 pr-4">
                  <Text className="text-white text-sm font-medium">Auto-Print Kitchen Tickets</Text>
                  <Text className="text-gray-500 text-xs">
                    Automatically print when orders are sent to kitchen
                  </Text>
                </View>
                <Switch
                  checked={printer.printOrderTickets}
                  onCheckedChange={() => {
                    // This uses existing updatePrinterConfig - not part of routing
                  }}
                  disabled
                />
              </View>

              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2 px-1">
                Info
              </Text>
              <View className="bg-surface rounded-lg p-3 border border-gray-600">
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-400 text-xs">Routing Mode</Text>
                  <Text className="text-white text-xs font-medium capitalize">
                    {routingConfig.routingMode}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-400 text-xs">Active Rules</Text>
                  <Text className="text-white text-xs font-medium">
                    {routingConfig.rules.filter((r) => r.is_enabled).length}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-400 text-xs">Category Rules</Text>
                  <Text className="text-white text-xs font-medium">
                    {routingConfig.rules.filter((r) => r.rule_type === "category" && r.is_enabled).length}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-400 text-xs">Item Rules</Text>
                  <Text className="text-white text-xs font-medium">
                    {routingConfig.rules.filter((r) => r.rule_type === "menu_item" && r.is_enabled).length}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-400 text-xs">Order Type Filters</Text>
                  <Text className="text-white text-xs font-medium">
                    {enabledOrderTypes.size === 0 ? "All" : enabledOrderTypes.size}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
