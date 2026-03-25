import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Layers,
  Printer,
  Search,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  UtensilsCrossed,
  X,
  AlertTriangle,
  Info,
  Zap,
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
// WIZARD STEPS
// ---------------------------------------------------------------------------

type StepId = "mode" | "orderTypes" | "templates" | "assignments" | "ticketOptions" | "test";

const STEP_LABELS: Record<StepId, string> = {
  mode: "Mode",
  orderTypes: "Order Types",
  templates: "Templates",
  assignments: "Assignments",
  ticketOptions: "Options",
  test: "Test",
};

const STEP_TITLES: Record<StepId, string> = {
  mode: "Choose Routing Mode",
  orderTypes: "Filter by Order Type",
  templates: "Quick Setup Templates",
  assignments: "Category & Item Assignments",
  ticketOptions: "Ticket Options",
  test: "Test Configuration",
};

const STEP_SUBTITLES: Record<StepId, string> = {
  mode: "How should this printer decide what to print?",
  orderTypes: "Optionally restrict which order types route to this printer.",
  templates: "Apply a preset to auto-select matching categories from your menu.",
  assignments: "Choose exactly which categories and items print here.",
  ticketOptions: "Configure print formatting for this printer.",
  test: "Simulate an order to verify your routing setup.",
};

function getSteps(mode: PrinterRoutingMode): StepId[] {
  if (mode === "all") return ["mode", "ticketOptions", "test"];
  if (mode === "unassigned") return ["mode", "orderTypes", "ticketOptions", "test"];
  return ["mode", "orderTypes", "templates", "assignments", "ticketOptions", "test"];
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const ORDER_TYPES = [
  { value: "dine_in", label: "Dine In", Icon: UtensilsCrossed },
  { value: "takeout", label: "Takeaway", Icon: ShoppingBag },
  { value: "delivery", label: "Delivery", Icon: Truck },
];

const ROUTING_MODES: {
  mode: PrinterRoutingMode;
  label: string;
  desc: string;
  example: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
}[] = [
  {
    mode: "all",
    label: "Print Everything",
    desc: "Receives every kitchen ticket regardless of category or item.",
    example: "Best for a single kitchen printer or general-purpose station.",
    Icon: Layers,
  },
  {
    mode: "unassigned",
    label: "Catch-All",
    desc: "Only prints items not claimed by any Custom Rules printer.",
    example: "Use as a fallback when other stations handle specific categories.",
    Icon: SlidersHorizontal,
  },
  {
    mode: "custom",
    label: "Custom Rules",
    desc: "You choose exactly which categories and items route here.",
    example: "Perfect for a grill station that only handles burgers and steaks.",
    Icon: Settings2,
  },
];

interface PresetTemplate {
  id: string;
  label: string;
  description: string;
  categoryKeywords: string[];
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: "bar_drinks",
    label: "Bar: Drinks & Cocktails",
    description: "Routes drink-related categories to this printer.",
    categoryKeywords: ["drink", "bar", "cocktail", "beer", "wine", "beverage", "juice", "coffee", "tea", "soda"],
  },
  {
    id: "kitchen_food",
    label: "Kitchen: All Food Items",
    description: "Routes food categories (non-drink) to this printer.",
    categoryKeywords: ["food", "entree", "appetizer", "main", "burger", "pizza", "pasta", "salad", "soup", "sandwich", "grill", "sides", "dessert"],
  },
  {
    id: "hot_food",
    label: "Grill Station: Hot Items",
    description: "Routes grilled and hot food categories.",
    categoryKeywords: ["grill", "hot", "burger", "steak", "bbq", "wings", "chicken", "ribs"],
  },
  {
    id: "cold_prep",
    label: "Cold Prep: Salads & Cold Items",
    description: "Routes salads and cold prep categories.",
    categoryKeywords: ["salad", "cold", "sushi", "raw", "dessert", "ice cream"],
  },
];

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function PrinterRoutingModal({
  visible,
  onClose,
  printer,
}: PrinterRoutingModalProps) {
  const [wizardStep, setWizardStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [testOrderType, setTestOrderType] = useState("dine_in");
  const [testResults, setTestResults] = useState<{ role: string; itemNames: string[] }[] | null>(null);
  const [expandedInDualList, setExpandedInDualList] = useState<Set<string>>(new Set());

  // Store
  const routingConfig: PrinterRoutingConfig =
    usePrinterStore((s) => s.routingConfigs[printer.id]) ?? {
      printerId: printer.id,
      routingMode: printer.routingMode,
      printModifiers: printer.printModifiers,
      rules: [],
    };
  const allRoutingConfigs = usePrinterStore((s) => s.routingConfigs);
  const allPrinters = usePrinterStore((s) => s.printers);
  const setRoutingMode = usePrinterStore((s) => s.setRoutingMode);
  const setPrintModifiers = usePrinterStore((s) => s.setPrintModifiers);
  const upsertRoutingRule = usePrinterStore((s) => s.upsertRoutingRule);
  const removeRoutingRule = usePrinterStore((s) => s.removeRoutingRule);
  const bulkSetRules = usePrinterStore((s) => s.bulkSetRules);

  // Menu
  const categories = useMenuStore((s) => s.categories);
  const menuItems = useMenuStore((s) => s.menuItems);
  const categoriesById = useMenuStore((s) => s.categoriesById);

  // ---------------------------------------------------------------------------
  // DERIVED
  // ---------------------------------------------------------------------------

  const steps = useMemo(() => getSteps(routingConfig.routingMode), [routingConfig.routingMode]);
  const currentStepId = steps[wizardStep] ?? "mode";
  const isLastStep = wizardStep === steps.length - 1;

  const enabledCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules)
      if (r.rule_type === "category" && r.is_enabled) set.add(r.rule_value);
    return set;
  }, [routingConfig.rules]);

  const enabledItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules)
      if (r.rule_type === "menu_item" && r.is_enabled) set.add(r.rule_value);
    return set;
  }, [routingConfig.rules]);

  const enabledOrderTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of routingConfig.rules)
      if (r.rule_type === "order_type" && r.is_enabled) set.add(r.rule_value);
    return set;
  }, [routingConfig.rules]);

  const categoryItemsMap = useMemo(() => {
    const map: Record<string, typeof menuItems> = {};
    const uncategorized: typeof menuItems = [];
    for (const item of menuItems) {
      if (!item.category || item.category.length === 0) { uncategorized.push(item); continue; }
      for (const catName of item.category) {
        const cat = categories.find((c) => c.name === catName);
        const key = cat?.id ?? catName;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
    }
    if (uncategorized.length > 0) map["__uncategorized__"] = uncategorized;
    return map;
  }, [menuItems, categories]);


  const conflictWarnings = useMemo(() => {
    if (routingConfig.routingMode !== "custom") return [];
    const catPrinterMap: Record<string, string[]> = {};
    for (const [pid, cfg] of Object.entries(allRoutingConfigs)) {
      if (cfg.routingMode !== "custom") continue;
      for (const r of cfg.rules) {
        if (r.rule_type !== "category" || !r.is_enabled) continue;
        if (!catPrinterMap[r.rule_value]) catPrinterMap[r.rule_value] = [];
        catPrinterMap[r.rule_value].push(pid);
      }
    }
    const warnings: { categoryName: string; printerNames: string[] }[] = [];
    for (const [catId, pids] of Object.entries(catPrinterMap)) {
      if (pids.length < 2 || !pids.includes(printer.id)) continue;
      const cat = categoriesById[catId];
      if (!cat) continue;
      warnings.push({
        categoryName: cat.name,
        printerNames: pids.map((pid) => allPrinters.find((p) => p.id === pid)?.printerName ?? pid),
      });
    }
    return warnings;
  }, [allRoutingConfigs, categoriesById, allPrinters, printer.id, routingConfig.routingMode]);

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleRoutingModeChange = useCallback(
    async (mode: PrinterRoutingMode) => {
      setIsSaving(true);
      try {
        await setRoutingMode(printer.id, mode);
        setWizardStep(0);
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
          const rule = routingConfig.rules.find((r) => r.rule_type === "order_type" && r.rule_value === orderType);
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
          const rule = routingConfig.rules.find((r) => r.rule_type === "category" && r.rule_value === categoryId);
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
          const rule = routingConfig.rules.find((r) => r.rule_type === "menu_item" && r.rule_value === itemId);
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
        allCategoryIds.map((id) => ({ ruleValue: id, enabled: !allEnabled })),
      );
    } finally {
      setIsSaving(false);
    }
  }, [printer.id, categories, enabledCategoryIds, bulkSetRules]);

  const handleApplyPreset = useCallback(
    async (preset: PresetTemplate) => {
      setIsSaving(true);
      try {
        await setRoutingMode(printer.id, "custom");
        const matchedIds = categories
          .filter((cat) => preset.categoryKeywords.some((kw) => cat.name.toLowerCase().includes(kw)))
          .map((cat) => cat.id);
        if (matchedIds.length === 0) return;
        await bulkSetRules(printer.id, "category", matchedIds.map((id) => ({ ruleValue: id, enabled: true })));
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, categories, setRoutingMode, bulkSetRules],
  );

  const handleTestConfiguration = useCallback(() => {
    const results: { role: string; itemNames: string[] }[] = [];
    if (routingConfig.routingMode === "all") {
      results.push({ role: "Receives all items", itemNames: menuItems.slice(0, 5).map((i) => i.name) });
    } else if (routingConfig.routingMode === "custom") {
      const orderTypeRules = routingConfig.rules.filter((r) => r.rule_type === "order_type" && r.is_enabled);
      const passes = orderTypeRules.length === 0 || orderTypeRules.some((r) => r.rule_value === testOrderType);
      if (!passes) {
        results.push({ role: `Blocked — order type "${testOrderType}" not in filter`, itemNames: [] });
      } else {
        const matched: string[] = [];
        for (const catId of enabledCategoryIds) {
          const items = categoryItemsMap[catId] ?? [];
          matched.push(...items.slice(0, 2).map((i) => i.name));
        }
        for (const itemId of enabledItemIds) {
          const item = menuItems.find((i) => i.id === itemId);
          if (item && !matched.includes(item.name)) matched.push(item.name);
        }
        results.push({ role: `Custom rules — ${matched.length} item(s) would print`, itemNames: matched.slice(0, 8) });
      }
    } else {
      const claimedIds = new Set<string>();
      for (const [pid, cfg] of Object.entries(allRoutingConfigs)) {
        if (pid === printer.id || cfg.routingMode !== "custom") continue;
        for (const r of cfg.rules) if (r.rule_type === "category" && r.is_enabled) claimedIds.add(r.rule_value);
      }
      const unclaimed = categories.filter((c) => !claimedIds.has(c.id));
      results.push({ role: `Catch-all — ${unclaimed.length} unclaimed categor${unclaimed.length !== 1 ? "ies" : "y"}`, itemNames: unclaimed.slice(0, 6).map((c) => `All of "${c.name}"`) });
    }
    setTestResults(results);
  }, [routingConfig, enabledCategoryIds, enabledItemIds, categoryItemsMap, menuItems, categories, allRoutingConfigs, printer.id, testOrderType]);

  // ---------------------------------------------------------------------------
  // STEP CONTENT
  // ---------------------------------------------------------------------------

  function renderStepContent() {
    switch (currentStepId) {

      case "mode":
        return (
          <View>
            {ROUTING_MODES.map(({ mode, label, desc, example, Icon }) => {
              const isSelected = routingConfig.routingMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleRoutingModeChange(mode)}
                  className={`flex-row items-start p-4 rounded-xl mb-3 border ${
                    isSelected ? "bg-blue-600/15 border-blue-500" : "bg-card border-gray-700"
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mt-0.5 mr-3 flex-shrink-0 ${
                      isSelected ? "border-blue-400 bg-blue-500" : "border-gray-500"
                    }`}
                  >
                    {isSelected && <Check size={11} color="white" />}
                  </View>
                  <Icon size={16} color={isSelected ? colors.info : colors.muted} />
                  <View className="flex-1 ml-2">
                    <Text className={`font-semibold text-sm ${isSelected ? "text-blue-300" : "text-white"}`}>
                      {label}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5 leading-4">{desc}</Text>
                    <Text className="text-blue-400/70 text-xs italic mt-1.5">{example}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );

      case "orderTypes":
        return (
          <View>
            <View className="flex-row items-start gap-2 mb-4 p-3 bg-card rounded-xl border border-gray-700">
              <Info size={14} color={colors.muted} style={{ marginTop: 1 }} />
              <Text className="text-gray-400 text-xs flex-1 leading-4">
                Leave all off to accept every order type. Toggle specific types to restrict which orders route here.
              </Text>
            </View>
            {ORDER_TYPES.map(({ value, label, Icon }) => {
              const isOn = enabledOrderTypes.has(value);
              return (
                <View
                  key={value}
                  className={`flex-row items-center justify-between py-3.5 px-4 rounded-xl mb-2.5 border ${
                    isOn ? "bg-blue-600/10 border-blue-500/40" : "bg-card border-gray-700"
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Icon size={16} color={isOn ? colors.info : colors.muted} />
                    <Text className="text-white text-sm font-medium">{label}</Text>
                  </View>
                  <Switch checked={isOn} onCheckedChange={() => handleOrderTypeToggle(value)} />
                </View>
              );
            })}
            {enabledOrderTypes.size === 0 && (
              <View className="flex-row items-center gap-2 mt-2 px-1">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-green-400 text-xs">All order types accepted (no filter)</Text>
              </View>
            )}
          </View>
        );

      case "templates":
        return (
          <View>
            <View className="flex-row items-start gap-2 mb-4 p-3 bg-card rounded-xl border border-gray-700">
              <Info size={14} color={colors.muted} style={{ marginTop: 1 }} />
              <Text className="text-gray-400 text-xs flex-1 leading-4">
                Templates match your menu categories by keyword. Applying one enables matching categories — you can adjust them in the next step.
              </Text>
            </View>
            {PRESET_TEMPLATES.map((preset) => {
              const matchCount = categories.filter((cat) =>
                preset.categoryKeywords.some((kw) => cat.name.toLowerCase().includes(kw)),
              ).length;
              return (
                <View key={preset.id} className="bg-card rounded-xl mb-2.5 border border-gray-700 overflow-hidden">
                  <View className="p-4">
                    <Text className="text-white text-sm font-semibold mb-0.5">{preset.label}</Text>
                    <Text className="text-gray-500 text-xs leading-4">{preset.description}</Text>
                    {matchCount > 0 ? (
                      <Text className="text-green-400 text-xs mt-2">
                        Matches {matchCount} categor{matchCount !== 1 ? "ies" : "y"} in your menu
                      </Text>
                    ) : (
                      <Text className="text-gray-600 text-xs mt-2">No matching categories found</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleApplyPreset(preset)}
                    disabled={matchCount === 0}
                    className={`py-2.5 items-center border-t border-gray-700 ${
                      matchCount > 0 ? "bg-blue-600/20" : "bg-card opacity-40"
                    }`}
                  >
                    <Text className={`text-sm font-semibold ${matchCount > 0 ? "text-blue-300" : "text-gray-500"}`}>
                      Apply Template
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity
              onPress={() => setWizardStep((s) => s + 1)}
              className="flex-row items-center justify-center gap-2 mt-2 py-3"
            >
              <Text className="text-gray-500 text-sm">Skip — configure manually</Text>
              <ArrowRight size={14} color={colors.muted} />
            </TouchableOpacity>
          </View>
        );

      case "assignments": {
        const q = searchQuery.toLowerCase().trim();

        // Left panel: all categories, filterable. Each expandable to show individual items.
        const visibleCategories = q
          ? categories.filter((cat) => {
              if (cat.name.toLowerCase().includes(q)) return true;
              return (categoryItemsMap[cat.id] ?? []).some((i) => i.name.toLowerCase().includes(q));
            })
          : categories;

        // Right panel: assigned categories (whole), then individually-assigned items
        // (items whose category is fully assigned are implied — only show explicit item rules)
        const assignedCategories = categories.filter((c) => enabledCategoryIds.has(c.id));
        const assignedIndividualItems = menuItems.filter((item) => {
          if (!enabledItemIds.has(item.id)) return false;
          // Hide if already covered by a category rule
          const coveredByCategory = (item.category ?? []).some((catName) => {
            const cat = categories.find((c) => c.name === catName);
            return cat ? enabledCategoryIds.has(cat.id) : false;
          });
          return !coveredByCategory;
        });

        const totalAssigned = enabledCategoryIds.size + assignedIndividualItems.length;

        return (
          <View style={{ flex: 1 }}>
            {/* Search */}
            <View className="flex-row items-center bg-card border border-gray-700 rounded-xl px-3 py-2 mb-3">
              <Search size={14} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search categories or items…"
                placeholderTextColor={colors.muted}
                className="flex-1 text-white text-sm ml-2"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={14} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Dual-list */}
            <View className="flex-row gap-3" style={{ height: 360 }}>

              {/* ── LEFT: Menu (categories + expandable items) ── */}
              <View className="flex-1 bg-card rounded-xl border border-gray-700 overflow-hidden">
                <View className="flex-row items-center justify-between px-3 py-2 border-b border-gray-700 bg-surface">
                  <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Menu</Text>
                  <TouchableOpacity onPress={handleAllItemsToggle}>
                    <Text className="text-blue-400 text-xs">
                      {enabledCategoryIds.size === categories.length ? "Remove all" : "Add all"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 6 }}>
                  {visibleCategories.length === 0 ? (
                    <View className="items-center py-8">
                      <Text className="text-gray-600 text-xs">No results</Text>
                    </View>
                  ) : visibleCategories.map((cat) => {
                    const catAssigned = enabledCategoryIds.has(cat.id);
                    // Fully assigned category moves to right panel — hide from left
                    if (catAssigned) return null;

                    const catItems = categoryItemsMap[cat.id] ?? [];
                    const isExpanded = expandedInDualList.has(cat.id);
                    const visibleItems = q
                      ? catItems.filter((i) => i.name.toLowerCase().includes(q))
                      : catItems;
                    // Hide items from left panel that have been individually assigned
                    const availableItems = visibleItems.filter((i) => !enabledItemIds.has(i.id));

                    return (
                      <View key={cat.id} className="mb-1">
                        {/* Category row */}
                        <View className="flex-row items-center bg-panel rounded-lg border border-gray-700 overflow-hidden">
                          {/* Expand toggle */}
                          {catItems.length > 0 ? (
                            <TouchableOpacity
                              onPress={() => setExpandedInDualList((prev) => {
                                const next = new Set(prev);
                                next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                return next;
                              })}
                              className="px-2 py-2.5"
                            >
                              {isExpanded
                                ? <ChevronDown size={13} color={colors.muted} />
                                : <ChevronRight size={13} color={colors.muted} />
                              }
                            </TouchableOpacity>
                          ) : (
                            <View className="w-7" />
                          )}

                          {/* Category name */}
                          <TouchableOpacity
                            onPress={() => handleCategoryToggle(cat.id)}
                            className="flex-1 py-2.5 pr-2"
                          >
                            <Text className="text-white text-sm font-medium" numberOfLines={1}>{cat.name}</Text>
                            <Text className="text-gray-600 text-xs">
                              {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                            </Text>
                          </TouchableOpacity>

                          {/* Assign whole category */}
                          <TouchableOpacity
                            onPress={() => handleCategoryToggle(cat.id)}
                            className="px-3 py-2.5"
                          >
                            <ChevronRight size={15} color={colors.info} />
                          </TouchableOpacity>
                        </View>

                        {/* Expanded individual items — only unassigned ones */}
                        {isExpanded && availableItems.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            onPress={() => handleItemToggle(item.id)}
                            className="flex-row items-center ml-5 mt-0.5 bg-panel rounded-lg border border-gray-700 px-2 py-2"
                          >
                            <Text className="text-gray-300 text-xs flex-1" numberOfLines={1}>{item.name}</Text>
                            <ChevronRight size={13} color={colors.info} />
                          </TouchableOpacity>
                        ))}
                        {/* If all items assigned individually, show hint */}
                        {isExpanded && availableItems.length === 0 && catItems.length > 0 && (
                          <View className="ml-5 mt-0.5 px-2 py-1.5">
                            <Text className="text-gray-600 text-xs italic">All items assigned individually</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* ── CENTRE: visual arrow column ── */}
              <View className="items-center justify-center gap-2 w-6">
                <ChevronsRight size={16} color={colors.muted} />
              </View>

              {/* ── RIGHT: Assigned to this printer ── */}
              <View className="flex-1 bg-card rounded-xl border border-blue-500/30 overflow-hidden">
                <View className="flex-row items-center justify-between px-3 py-2 border-b border-gray-700 bg-blue-600/10">
                  <Text className="text-blue-300 text-xs font-semibold uppercase tracking-wider">
                    Prints here
                  </Text>
                  <View className="bg-blue-600/30 rounded px-1.5 py-0.5">
                    <Text className="text-blue-200 text-xs font-bold">{totalAssigned}</Text>
                  </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 6 }}>
                  {totalAssigned === 0 ? (
                    <View className="items-center py-10">
                      <ChevronsRight size={22} color="#334155" />
                      <Text className="text-gray-700 text-xs mt-2 text-center leading-4">
                        Tap a category or item{"\n"}on the left to assign it
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Assigned whole categories */}
                      {assignedCategories.map((cat) => {
                        const itemCount = (categoryItemsMap[cat.id] ?? []).length;
                        return (
                          <TouchableOpacity
                            key={`cat-${cat.id}`}
                            onPress={() => handleCategoryToggle(cat.id)}
                            className="flex-row items-center px-2 py-2.5 rounded-lg mb-1 bg-blue-600/10 border border-blue-500/30"
                          >
                            <View className="flex-1 mr-2">
                              <Text className="text-white text-sm font-medium" numberOfLines={1}>{cat.name}</Text>
                              <Text className="text-blue-400/60 text-xs">{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                            </View>
                            <View className="w-2 h-2 rounded-full bg-green-400 mr-1" />
                          </TouchableOpacity>
                        );
                      })}

                      {/* Divider between categories and individual items */}
                      {assignedCategories.length > 0 && assignedIndividualItems.length > 0 && (
                        <View className="flex-row items-center gap-2 my-1.5 px-1">
                          <View className="flex-1 h-px bg-gray-700" />
                          <Text className="text-gray-600 text-xs">individual items</Text>
                          <View className="flex-1 h-px bg-gray-700" />
                        </View>
                      )}

                      {/* Individually assigned items (not covered by category) */}
                      {assignedIndividualItems.map((item) => {
                        const catName = item.category?.[0] ?? "";
                        return (
                          <TouchableOpacity
                            key={`item-${item.id}`}
                            onPress={() => handleItemToggle(item.id)}
                            className="flex-row items-center px-2 py-2.5 rounded-lg mb-1 bg-blue-600/10 border border-blue-500/30"
                          >
                            <View className="flex-1 mr-2">
                              <Text className="text-white text-sm" numberOfLines={1}>{item.name}</Text>
                              {catName ? (
                                <Text className="text-blue-400/60 text-xs" numberOfLines={1}>{catName}</Text>
                              ) : null}
                            </View>
                            <View className="w-2 h-2 rounded-full bg-green-400 mr-1" />
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              </View>

            </View>

            {/* Summary footer */}
            <View className="flex-row items-center justify-between mt-2 px-1">
              <Text className="text-gray-500 text-xs">
                {enabledCategoryIds.size} categor{enabledCategoryIds.size !== 1 ? "ies" : "y"} · {assignedIndividualItems.length} individual item{assignedIndividualItems.length !== 1 ? "s" : ""}
              </Text>
              {totalAssigned === 0 && (
                <View className="flex-row items-center gap-1">
                  <AlertTriangle size={12} color="#f59e0b" />
                  <Text className="text-amber-400 text-xs">Nothing assigned yet</Text>
                </View>
              )}
            </View>
          </View>
        );
      }

      case "ticketOptions":
        return (
          <View>
            <View className={`flex-row items-center justify-between py-4 px-4 rounded-xl mb-3 border ${
              routingConfig.printModifiers ? "bg-blue-600/10 border-blue-500/40" : "bg-card border-gray-700"
            }`}>
              <View className="flex-1 pr-4">
                <Text className="text-white text-sm font-semibold">Print Modifiers</Text>
                <Text className="text-gray-400 text-xs mt-0.5 leading-4">
                  Show item modifiers and add-ons on kitchen tickets
                </Text>
              </View>
              <Switch
                checked={routingConfig.printModifiers}
                onCheckedChange={(v) => setPrintModifiers(printer.id, v)}
              />
            </View>
            <View className="flex-row items-center justify-between py-4 px-4 rounded-xl mb-3 border bg-card border-gray-700 opacity-60">
              <View className="flex-1 pr-4">
                <Text className="text-white text-sm font-semibold">Auto-Print Kitchen Tickets</Text>
                <Text className="text-gray-400 text-xs mt-0.5 leading-4">
                  Automatically print when orders are sent to kitchen
                </Text>
              </View>
              <Switch checked={printer.printOrderTickets} onCheckedChange={() => {}} disabled />
            </View>

            {/* Summary info */}
            <View className="bg-card rounded-xl border border-gray-700 p-4 mt-2">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Configuration Summary
              </Text>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Routing Mode</Text>
                <Text className="text-white text-sm font-medium capitalize">{routingConfig.routingMode}</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Category Rules</Text>
                <Text className="text-white text-sm font-medium">
                  {routingConfig.rules.filter((r) => r.rule_type === "category" && r.is_enabled).length}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Item Rules</Text>
                <Text className="text-white text-sm font-medium">
                  {routingConfig.rules.filter((r) => r.rule_type === "menu_item" && r.is_enabled).length}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-400 text-sm">Order Type Filter</Text>
                <Text className="text-white text-sm font-medium">
                  {enabledOrderTypes.size === 0 ? "All types" : `${enabledOrderTypes.size} selected`}
                </Text>
              </View>
            </View>
          </View>
        );

      case "test":
        return (
          <View>
            {/* Conflict warnings */}
            {conflictWarnings.length > 0 && (
              <View className="mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-xl flex-row items-start gap-2">
                <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: 1 }} />
                <View className="flex-1">
                  <Text className="text-amber-300 text-xs font-semibold mb-1">Routing Conflicts Detected</Text>
                  {conflictWarnings.map((w, i) => (
                    <Text key={i} className="text-amber-400 text-xs leading-4">
                      "{w.categoryName}" is also assigned to: {w.printerNames.filter((n) => n !== printer.printerName).join(", ")}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Order type picker */}
            <Text className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Simulate Order Type
            </Text>
            <View className="flex-row gap-2 mb-4">
              {ORDER_TYPES.map(({ value, label, Icon }) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => { setTestOrderType(value); setTestResults(null); }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-xl border ${
                    testOrderType === value ? "bg-blue-600/20 border-blue-500" : "bg-card border-gray-700"
                  }`}
                >
                  <Icon size={13} color={testOrderType === value ? colors.info : colors.muted} />
                  <Text className={`text-xs font-medium ${testOrderType === value ? "text-blue-300" : "text-gray-400"}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleTestConfiguration}
              className="flex-row items-center justify-center gap-2 py-3.5 bg-blue-600 rounded-xl mb-4"
            >
              <Zap size={16} color="white" />
              <Text className="text-white font-semibold text-sm">Run Simulation</Text>
            </TouchableOpacity>

            {/* Results */}
            {testResults !== null && (
              <View className="bg-card rounded-xl border border-gray-700 p-4">
                <Text className="text-white font-semibold text-sm mb-3">Simulation Results</Text>
                {testResults.map((r, i) => (
                  <View key={i}>
                    <View className="flex-row items-center gap-2 mb-2">
                      <Printer size={14} color={colors.warning} />
                      <Text className="text-gray-300 text-xs font-medium flex-1">{r.role}</Text>
                    </View>
                    {r.itemNames.length > 0 ? (
                      <View className="ml-6 gap-1.5 mb-2">
                        {r.itemNames.map((name, j) => (
                          <View key={j} className="flex-row items-center gap-2">
                            <View className="w-1 h-1 rounded-full bg-gray-500" />
                            <Text className="text-gray-400 text-xs">{name}</Text>
                          </View>
                        ))}
                        {r.itemNames.length >= 8 && (
                          <Text className="text-gray-600 text-xs ml-3">…and more</Text>
                        )}
                      </View>
                    ) : (
                      <Text className="text-amber-400 text-xs ml-6 mb-2">
                        No items would print for this order type.
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  }

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

        {/* ── HEADER ── */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-700">
          <View className="flex-row items-center flex-1 gap-3">
            <Printer size={20} color={printer.printerRole === "bar" ? "#a78bfa" : colors.warning} />
            <View className="flex-1">
              <Text className="text-white font-bold text-base" numberOfLines={1}>
                {printer.printerName}
              </Text>
              <Text className="text-gray-400 text-xs capitalize">
                {printer.printerRole} · Configure Routing
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {isSaving && <ActivityIndicator size="small" color={colors.info} />}
            <TouchableOpacity onPress={onClose} className="p-2 bg-card rounded-lg">
              <X size={20} color={colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── STEP INDICATOR ── */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-700">
          {steps.map((stepId, i) => {
            const isCompleted = i < wizardStep;
            const isActive = i === wizardStep;
            return (
              <React.Fragment key={stepId}>
                <View className="items-center">
                  <TouchableOpacity
                    onPress={() => isCompleted && setWizardStep(i)}
                    disabled={!isCompleted}
                    className={`w-7 h-7 rounded-full items-center justify-center border-2 ${
                      isCompleted
                        ? "bg-green-600 border-green-600"
                        : isActive
                        ? "bg-blue-600 border-blue-500"
                        : "bg-card border-gray-600"
                    }`}
                  >
                    {isCompleted
                      ? <Check size={13} color="white" />
                      : <Text className={`text-xs font-bold ${isActive ? "text-white" : "text-gray-500"}`}>{i + 1}</Text>}
                  </TouchableOpacity>
                  <Text className={`text-xs mt-1 ${
                    isActive ? "text-blue-300 font-semibold"
                    : isCompleted ? "text-green-400"
                    : "text-gray-600"
                  }`}>
                    {STEP_LABELS[stepId]}
                  </Text>
                </View>
                {i < steps.length - 1 && (
                  <View className={`h-0.5 flex-1 mx-1 mb-4 ${i < wizardStep ? "bg-green-600" : "bg-gray-700"}`} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* ── STEP TITLE ── */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-white font-bold text-base">{STEP_TITLES[currentStepId]}</Text>
          <Text className="text-gray-500 text-xs mt-0.5">{STEP_SUBTITLES[currentStepId]}</Text>
        </View>

        {/* ── SCROLLABLE CONTENT ── */}
        <ScrollView
          key={currentStepId}
          className="flex-1 px-4 pt-2"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {renderStepContent()}
        </ScrollView>

        {/* ── FOOTER NAV ── */}
        <View className="flex-row items-center gap-3 px-4 pb-6 pt-3 border-t border-gray-700">
          <TouchableOpacity
            onPress={() => setWizardStep((s) => s - 1)}
            disabled={wizardStep === 0}
            className={`flex-1 items-center justify-center py-3.5 rounded-xl border ${
              wizardStep === 0 ? "bg-card border-gray-700 opacity-30" : "bg-card border-gray-600"
            }`}
          >
            <Text className="text-gray-300 font-semibold text-sm">Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isLastStep ? onClose : () => setWizardStep((s) => s + 1)}
            className={`flex-[2] flex-row items-center justify-center gap-2 py-3.5 rounded-xl ${
              isLastStep ? "bg-green-700" : "bg-blue-600"
            }`}
          >
            {isSaving && <ActivityIndicator size="small" color="white" />}
            {isLastStep
              ? <><Check size={16} color="white" /><Text className="text-white font-semibold text-sm">Done</Text></>
              : <><Text className="text-white font-semibold text-sm">Next</Text><ArrowRight size={16} color="white" /></>
            }
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}
