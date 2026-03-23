import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
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
  ChevronUp,
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

// Preset templates: each is a set of category name fragments → routing mode
interface PresetTemplate {
  id: string;
  label: string;
  description: string;
  // Maps category name keywords (lowercase) to printer role hint
  categoryKeywords: string[];
  targetRole: "kitchen" | "bar";
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: "bar_drinks",
    label: "Bar: Drinks & Cocktails",
    description: "Routes drink-related categories to this printer.",
    categoryKeywords: ["drink", "bar", "cocktail", "beer", "wine", "beverage", "juice", "coffee", "tea", "soda"],
    targetRole: "bar",
  },
  {
    id: "kitchen_food",
    label: "Kitchen: All Food Items",
    description: "Routes food categories (non-drink) to this printer.",
    categoryKeywords: ["food", "entree", "appetizer", "main", "burger", "pizza", "pasta", "salad", "soup", "sandwich", "grill", "sides", "dessert"],
    targetRole: "kitchen",
  },
  {
    id: "hot_food",
    label: "Grill Station: Hot Items",
    description: "Routes grilled and hot food categories.",
    categoryKeywords: ["grill", "hot", "burger", "steak", "bbq", "wings", "chicken", "ribs"],
    targetRole: "kitchen",
  },
  {
    id: "cold_prep",
    label: "Cold Prep: Salads & Cold Items",
    description: "Routes salads and cold prep categories.",
    categoryKeywords: ["salad", "cold", "sushi", "raw", "dessert", "ice cream"],
    targetRole: "kitchen",
  },
];

// ---------------------------------------------------------------------------
// SECTION ACCORDION
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="mb-3">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-t-xl border border-gray-600"
        style={!open ? { borderRadius: 12 } : { borderBottomWidth: 0 }}
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-white font-semibold text-sm">{title}</Text>
            {badge ? (
              <View className="bg-blue-600/30 border border-blue-500/50 rounded px-1.5 py-0.5">
                <Text className="text-blue-300 text-xs">{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text className="text-gray-500 text-xs mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
        {open ? (
          <ChevronUp size={16} color={colors.muted} />
        ) : (
          <ChevronDown size={16} color={colors.muted} />
        )}
      </TouchableOpacity>
      {open && (
        <View className="bg-surface rounded-b-xl border border-t-0 border-gray-600 p-3">
          {children}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CONFLICT WARNING
// ---------------------------------------------------------------------------

interface ConflictWarning {
  categoryName: string;
  printerNames: string[];
}

// ---------------------------------------------------------------------------
// TEST RESULT
// ---------------------------------------------------------------------------

interface TestResult {
  printerName: string;
  itemNames: string[];
  role: string;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export function PrinterRoutingModal({
  visible,
  onClose,
  printer,
}: PrinterRoutingModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [testOrderType, setTestOrderType] = useState<string>("dine_in");
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);

  // Store selectors
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

  // Menu data
  const categories = useMenuStore((s) => s.categories);
  const menuItems = useMenuStore((s) => s.menuItems);
  const categoriesById = useMenuStore((s) => s.categoriesById);

  // ---------------------------------------------------------------------------
  // DERIVED: rule lookups
  // ---------------------------------------------------------------------------

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

  // category -> items map
  const categoryItemsMap = useMemo(() => {
    const map: Record<string, typeof menuItems> = {};
    const uncategorized: typeof menuItems = [];
    for (const item of menuItems) {
      if (!item.category || item.category.length === 0) {
        uncategorized.push(item);
        continue;
      }
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

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter((cat) => {
      if (cat.name.toLowerCase().includes(q)) return true;
      return (categoryItemsMap[cat.id] ?? []).some((i) =>
        i.name.toLowerCase().includes(q),
      );
    });
  }, [categories, searchQuery, categoryItemsMap]);

  const allCategoriesEnabled = useMemo(
    () => categories.length > 0 && categories.every((c) => enabledCategoryIds.has(c.id)),
    [categories, enabledCategoryIds],
  );

  const isCategoryFullySelected = useCallback(
    (categoryId: string): boolean => {
      if (enabledCategoryIds.has(categoryId)) return true;
      const items = categoryItemsMap[categoryId] ?? [];
      if (items.length === 0) return false;
      return items.every((i) => enabledItemIds.has(i.id));
    },
    [enabledCategoryIds, enabledItemIds, categoryItemsMap],
  );

  // ---------------------------------------------------------------------------
  // CONFLICT DETECTION
  // Finds categories that are assigned to multiple "custom" printers
  // ---------------------------------------------------------------------------
  const conflictWarnings = useMemo((): ConflictWarning[] => {
    if (routingConfig.routingMode !== "custom") return [];
    const categoryPrinterMap: Record<string, string[]> = {};

    for (const [pid, cfg] of Object.entries(allRoutingConfigs)) {
      if (cfg.routingMode !== "custom") continue;
      for (const rule of cfg.rules) {
        if (rule.rule_type !== "category" || !rule.is_enabled) continue;
        if (!categoryPrinterMap[rule.rule_value]) categoryPrinterMap[rule.rule_value] = [];
        categoryPrinterMap[rule.rule_value].push(pid);
      }
    }

    const warnings: ConflictWarning[] = [];
    for (const [catId, printerIds] of Object.entries(categoryPrinterMap)) {
      if (printerIds.length < 2) continue;
      if (!printerIds.includes(printer.id)) continue;
      const cat = categoriesById[catId];
      if (!cat) continue;
      const printerNames = printerIds.map(
        (pid) => allPrinters.find((p) => p.id === pid)?.printerName ?? pid,
      );
      warnings.push({ categoryName: cat.name, printerNames });
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
        allCategoryIds.map((id) => ({ ruleValue: id, enabled: !allEnabled })),
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

  // Apply a preset template: match categories by keyword and enable them
  const handleApplyPreset = useCallback(
    async (preset: PresetTemplate) => {
      setIsSaving(true);
      try {
        // Switch to custom mode first
        await setRoutingMode(printer.id, "custom");

        const matchedIds = categories
          .filter((cat) =>
            preset.categoryKeywords.some((kw) =>
              cat.name.toLowerCase().includes(kw),
            ),
          )
          .map((cat) => cat.id);

        if (matchedIds.length === 0) return;

        await bulkSetRules(
          printer.id,
          "category",
          matchedIds.map((id) => ({ ruleValue: id, enabled: true })),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [printer.id, categories, setRoutingMode, bulkSetRules],
  );

  // Simulate routing: pick a few sample items from each enabled category
  const handleTestConfiguration = useCallback(() => {
    // Build a mini simulation: for each category this printer handles, what items would print here?
    const results: TestResult[] = [];

    if (routingConfig.routingMode === "all") {
      const allItemNames = menuItems.slice(0, 5).map((i) => i.name);
      results.push({
        printerName: printer.printerName,
        itemNames: allItemNames.length > 0 ? allItemNames : ["(all items)"],
        role: "Receives all items",
      });
    } else if (routingConfig.routingMode === "custom") {
      // Order type gate check
      const orderTypeRules = routingConfig.rules.filter(
        (r) => r.rule_type === "order_type" && r.is_enabled,
      );
      const passesOrderType =
        orderTypeRules.length === 0 ||
        orderTypeRules.some((r) => r.rule_value === testOrderType);

      if (!passesOrderType) {
        results.push({
          printerName: printer.printerName,
          itemNames: [],
          role: `Blocked — order type "${testOrderType}" not in filter`,
        });
      } else {
        const matchedItems: string[] = [];
        for (const catId of enabledCategoryIds) {
          const cat = categoriesById[catId];
          const items = categoryItemsMap[catId] ?? [];
          const names = items.slice(0, 2).map((i) => i.name);
          if (names.length > 0) matchedItems.push(...names);
          else if (cat) matchedItems.push(`${cat.name} (no items)`);
        }
        for (const itemId of enabledItemIds) {
          const item = menuItems.find((i) => i.id === itemId);
          if (item && !matchedItems.includes(item.name)) matchedItems.push(item.name);
        }
        results.push({
          printerName: printer.printerName,
          itemNames: matchedItems.slice(0, 8),
          role: `Custom rules — ${matchedItems.length} item(s) would print`,
        });
      }
    } else if (routingConfig.routingMode === "unassigned") {
      // Find all category IDs claimed by custom printers
      const claimedIds = new Set<string>();
      for (const [pid, cfg] of Object.entries(allRoutingConfigs)) {
        if (pid === printer.id || cfg.routingMode !== "custom") continue;
        for (const r of cfg.rules) {
          if (r.rule_type === "category" && r.is_enabled) claimedIds.add(r.rule_value);
        }
      }
      const unclaimed = categories.filter((c) => !claimedIds.has(c.id));
      results.push({
        printerName: printer.printerName,
        itemNames: unclaimed.slice(0, 6).map((c) => `All of "${c.name}"`),
        role: `Catch-all — ${unclaimed.length} unclaimed categor${unclaimed.length !== 1 ? "ies" : "y"}`,
      });
    }

    setTestResults(results);
    setShowTestPanel(true);
  }, [
    routingConfig,
    enabledCategoryIds,
    enabledItemIds,
    categoryItemsMap,
    categoriesById,
    menuItems,
    categories,
    allRoutingConfigs,
    printer,
    testOrderType,
  ]);

  // ---------------------------------------------------------------------------
  // SUMMARY BADGE TEXT
  // ---------------------------------------------------------------------------

  const routingModeBadge = useMemo(() => {
    if (routingConfig.routingMode === "all") return "All Items";
    if (routingConfig.routingMode === "unassigned") return "Catch-All";
    const catCount = enabledCategoryIds.size;
    const itemCount = enabledItemIds.size;
    if (catCount === 0 && itemCount === 0) return "No rules";
    return `${catCount} cat${catCount !== 1 ? "s" : ""}, ${itemCount} item${itemCount !== 1 ? "s" : ""}`;
  }, [routingConfig.routingMode, enabledCategoryIds.size, enabledItemIds.size]);

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
            <Printer
              size={20}
              color={printer.printerRole === "bar" ? "#a78bfa" : colors.warning}
            />
            <View className="flex-1">
              <Text className="text-white font-bold text-base" numberOfLines={1}>
                {printer.printerName}
              </Text>
              <Text className="text-gray-400 text-xs capitalize">
                {printer.printerRole} · {routingModeBadge}
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

        {/* ── CONFLICT WARNINGS ── */}
        {conflictWarnings.length > 0 && (
          <View className="mx-4 mt-3 p-3 bg-amber-900/30 border border-amber-600/50 rounded-xl flex-row items-start gap-2">
            <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: 1 }} />
            <View className="flex-1">
              <Text className="text-amber-300 text-xs font-semibold mb-1">
                Routing Conflicts Detected
              </Text>
              {conflictWarnings.map((w, i) => (
                <Text key={i} className="text-amber-400 text-xs">
                  "{w.categoryName}" is assigned to: {w.printerNames.join(", ")}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* ── SCROLLABLE CONTENT ── */}
        <ScrollView
          className="flex-1 px-4 pt-3"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >

          {/* ══ SECTION 1: ROUTING MODE ══ */}
          <Section
            title="Routing Mode"
            subtitle="How does this printer decide what to print?"
            defaultOpen
          >
            {ROUTING_MODES.map(({ mode, label, desc, example, Icon }) => {
              const isSelected = routingConfig.routingMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleRoutingModeChange(mode)}
                  className={`flex-row items-start p-3 rounded-xl mb-2 border ${
                    isSelected
                      ? "bg-blue-600/15 border-blue-500"
                      : "bg-card border-gray-700"
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mt-0.5 mr-3 flex-shrink-0 ${
                      isSelected ? "border-blue-400 bg-blue-500" : "border-gray-500"
                    }`}
                  >
                    {isSelected && <Check size={11} color="white" />}
                  </View>
                  <Icon
                    size={16}
                    color={isSelected ? colors.info : colors.muted}
                  />
                  <View className="flex-1 ml-2">
                    <Text
                      className={`font-semibold text-sm ${isSelected ? "text-blue-300" : "text-white"}`}
                    >
                      {label}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5 leading-4">{desc}</Text>
                    <Text className="text-blue-400/70 text-xs italic mt-1">{example}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Section>

          {/* ══ SECTION 2: ORDER TYPE FILTER (custom + unassigned) ══ */}
          {(routingConfig.routingMode === "custom" ||
            routingConfig.routingMode === "unassigned") && (
            <Section
              title="Order Type Filter"
              subtitle="Leave all off to accept every order type."
              defaultOpen={false}
              badge={
                enabledOrderTypes.size > 0 ? `${enabledOrderTypes.size} active` : undefined
              }
            >
              <View className="flex-row items-center gap-2 mb-3 p-2 bg-card rounded-lg">
                <Info size={13} color={colors.muted} />
                <Text className="text-gray-500 text-xs flex-1">
                  When no order types are selected, this printer accepts all. Toggle on specific types to restrict routing.
                </Text>
              </View>
              {ORDER_TYPES.map(({ value, label, Icon }) => (
                <View
                  key={value}
                  className={`flex-row items-center justify-between py-3 px-3 rounded-lg mb-2 border ${
                    enabledOrderTypes.has(value)
                      ? "bg-blue-600/10 border-blue-500/50"
                      : "bg-card border-gray-700"
                  }`}
                >
                  <View className="flex-row items-center gap-2">
                    <Icon size={14} color={enabledOrderTypes.has(value) ? colors.info : colors.muted} />
                    <Text className="text-white text-sm">{label}</Text>
                  </View>
                  <Switch
                    checked={enabledOrderTypes.has(value)}
                    onCheckedChange={() => handleOrderTypeToggle(value)}
                  />
                </View>
              ))}
            </Section>
          )}

          {/* ══ SECTION 3: PRESET TEMPLATES (custom mode) ══ */}
          {routingConfig.routingMode === "custom" && (
            <Section
              title="Quick Setup Templates"
              subtitle="Apply a preset to auto-select matching categories."
              defaultOpen={false}
            >
              <View className="flex-row items-center gap-2 mb-3 p-2 bg-card rounded-lg">
                <Info size={13} color={colors.muted} />
                <Text className="text-gray-500 text-xs flex-1">
                  Templates match your menu categories by keyword and enable them. You can adjust afterwards.
                </Text>
              </View>
              {PRESET_TEMPLATES.map((preset) => {
                const matchCount = categories.filter((cat) =>
                  preset.categoryKeywords.some((kw) =>
                    cat.name.toLowerCase().includes(kw),
                  ),
                ).length;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => handleApplyPreset(preset)}
                    className="flex-row items-center justify-between py-3 px-3 bg-card rounded-xl mb-2 border border-gray-700"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-white text-sm font-medium">{preset.label}</Text>
                      <Text className="text-gray-500 text-xs mt-0.5">{preset.description}</Text>
                      {matchCount > 0 ? (
                        <Text className="text-green-400 text-xs mt-1">
                          Matches {matchCount} categor{matchCount !== 1 ? "ies" : "y"} in your menu
                        </Text>
                      ) : (
                        <Text className="text-gray-600 text-xs mt-1">No matching categories found</Text>
                      )}
                    </View>
                    <View className="bg-blue-600/20 border border-blue-500/40 rounded-lg px-3 py-1.5">
                      <Text className="text-blue-300 text-xs font-medium">Apply</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Section>
          )}

          {/* ══ SECTION 4: CATEGORY & ITEM ASSIGNMENTS (custom mode) ══ */}
          {routingConfig.routingMode === "custom" && (
            <Section
              title="Category & Item Assignments"
              subtitle="Toggle categories or individual items to route to this printer."
              defaultOpen
              badge={
                enabledCategoryIds.size + enabledItemIds.size > 0
                  ? `${enabledCategoryIds.size} cat · ${enabledItemIds.size} items`
                  : "None selected"
              }
            >
              {/* Search */}
              <View className="flex-row items-center bg-card border border-gray-700 rounded-lg px-3 py-2 mb-3">
                <Search size={15} color={colors.muted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search categories or items..."
                  placeholderTextColor={colors.muted}
                  className="flex-1 text-white text-sm ml-2"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={15} color={colors.muted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Select All */}
              <TouchableOpacity
                onPress={handleAllItemsToggle}
                className={`flex-row items-center justify-between py-2.5 px-3 rounded-lg mb-3 border ${
                  allCategoriesEnabled
                    ? "bg-blue-600/15 border-blue-500/50"
                    : "bg-card border-gray-700"
                }`}
              >
                <Text className="text-white font-medium text-sm">Select All Categories</Text>
                <Switch checked={allCategoriesEnabled} onCheckedChange={handleAllItemsToggle} />
              </TouchableOpacity>

              {/* Category list */}
              {filteredCategories.map((cat) => {
                const isExpanded = expandedCategories.has(cat.id);
                const catItems = categoryItemsMap[cat.id] ?? [];
                const hasCategoryRule = enabledCategoryIds.has(cat.id);
                const isFullySelected = isCategoryFullySelected(cat.id);
                const isEnabled = hasCategoryRule || isFullySelected;

                const q = searchQuery.toLowerCase().trim();
                const visibleItems = q
                  ? catItems.filter((i) => i.name.toLowerCase().includes(q))
                  : catItems;

                return (
                  <View key={cat.id} className="mb-1.5">
                    <View
                      className={`flex-row items-center rounded-lg border overflow-hidden ${
                        isEnabled ? "bg-blue-600/10 border-blue-500/40" : "bg-card border-gray-700"
                      }`}
                    >
                      {/* Enabled dot */}
                      <View className="pl-2.5">
                        <View
                          className={`w-2 h-2 rounded-full ${
                            isEnabled ? "bg-green-400" : "border border-gray-600"
                          }`}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleCategoryExpand(cat.id)}
                        className="p-2.5"
                      >
                        {isExpanded ? (
                          <ChevronDown size={15} color={colors.label} />
                        ) : (
                          <ChevronRight size={15} color={colors.label} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleCategoryExpand(cat.id)}
                        className="flex-1 py-2.5"
                      >
                        <Text className="text-white font-medium text-sm">{cat.name}</Text>
                        <Text className="text-gray-500 text-xs">
                          {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                          {hasCategoryRule ? " · whole category" : ""}
                        </Text>
                      </TouchableOpacity>
                      <View className="pr-3">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleCategoryToggle(cat.id)}
                        />
                      </View>
                    </View>

                    {isExpanded && visibleItems.length > 0 && (
                      <View className="ml-7 mt-1 gap-1">
                        {visibleItems.map((item) => {
                          const isItemEnabled = enabledItemIds.has(item.id) || hasCategoryRule;
                          return (
                            <View
                              key={item.id}
                              className={`flex-row items-center justify-between py-2 px-3 rounded-lg border ${
                                isItemEnabled
                                  ? "bg-blue-600/10 border-blue-500/30"
                                  : "bg-panel border-gray-700"
                              }`}
                            >
                              <View className="flex-row items-center gap-2 flex-1 mr-2">
                                <View
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isItemEnabled ? "bg-green-400" : "bg-transparent border border-gray-600"
                                  }`}
                                />
                                <Text className="text-gray-300 text-sm flex-1" numberOfLines={1}>
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

              {/* Uncategorized */}
              {categoryItemsMap["__uncategorized__"] && (
                <View className="mb-1.5">
                  <View className="flex-row items-center bg-card rounded-lg border border-gray-700 overflow-hidden">
                    <View className="pl-2.5">
                      <View className="w-2 h-2 rounded-full border border-gray-600" />
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleCategoryExpand("__uncategorized__")}
                      className="p-2.5"
                    >
                      {expandedCategories.has("__uncategorized__") ? (
                        <ChevronDown size={15} color={colors.label} />
                      ) : (
                        <ChevronRight size={15} color={colors.label} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleCategoryExpand("__uncategorized__")}
                      className="flex-1 py-2.5"
                    >
                      <Text className="text-gray-400 font-medium text-sm italic">Uncategorized</Text>
                      <Text className="text-gray-500 text-xs">
                        {categoryItemsMap["__uncategorized__"].length} items
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {expandedCategories.has("__uncategorized__") && (
                    <View className="ml-7 mt-1 gap-1">
                      {categoryItemsMap["__uncategorized__"].map((item) => (
                        <View
                          key={item.id}
                          className="flex-row items-center justify-between py-2 px-3 bg-panel rounded-lg border border-gray-700"
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
            </Section>
          )}

          {/* ══ SECTION 5: TICKET OPTIONS ══ */}
          <Section
            title="Ticket Options"
            subtitle="Print formatting settings for this printer."
            defaultOpen={false}
          >
            <View className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-lg mb-2 border border-gray-700">
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
            <View className="flex-row items-center justify-between py-2.5 px-3 bg-card rounded-lg border border-gray-700">
              <View className="flex-1 pr-4">
                <Text className="text-white text-sm font-medium">Auto-Print Kitchen Tickets</Text>
                <Text className="text-gray-500 text-xs">
                  Automatically print when orders are sent to kitchen
                </Text>
              </View>
              <Switch
                checked={printer.printOrderTickets}
                onCheckedChange={() => {}}
                disabled
              />
            </View>
          </Section>

          {/* ══ SECTION 6: TEST CONFIGURATION ══ */}
          <Section
            title="Test Configuration"
            subtitle="Simulate an order to verify what this printer would receive."
            defaultOpen={false}
          >
            <Text className="text-gray-500 text-xs mb-3">
              Select an order type and run the simulation to see which items would route to this printer.
            </Text>

            {/* Order type picker */}
            <View className="flex-row gap-2 mb-3">
              {ORDER_TYPES.map(({ value, label, Icon }) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => {
                    setTestOrderType(value);
                    setTestResults(null);
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg border ${
                    testOrderType === value
                      ? "bg-blue-600/20 border-blue-500"
                      : "bg-card border-gray-700"
                  }`}
                >
                  <Icon size={13} color={testOrderType === value ? colors.info : colors.muted} />
                  <Text
                    className={`text-xs font-medium ${
                      testOrderType === value ? "text-blue-300" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleTestConfiguration}
              className="flex-row items-center justify-center gap-2 py-3 bg-blue-600 rounded-xl"
            >
              <Zap size={16} color="white" />
              <Text className="text-white font-semibold text-sm">Run Simulation</Text>
            </TouchableOpacity>

            {/* Test results */}
            {showTestPanel && testResults !== null && (
              <View className="mt-3 p-3 bg-card rounded-xl border border-gray-600">
                <Text className="text-white font-semibold text-sm mb-2">Simulation Results</Text>
                {testResults.map((r, i) => (
                  <View key={i}>
                    <View className="flex-row items-center gap-2 mb-1">
                      <Printer size={13} color={colors.warning} />
                      <Text className="text-gray-300 text-xs font-medium">{r.role}</Text>
                    </View>
                    {r.itemNames.length > 0 ? (
                      <View className="ml-5 gap-1">
                        {r.itemNames.map((name, j) => (
                          <View key={j} className="flex-row items-center gap-1.5">
                            <ArrowRight size={10} color={colors.muted} />
                            <Text className="text-gray-400 text-xs">{name}</Text>
                          </View>
                        ))}
                        {r.itemNames.length >= 8 && (
                          <Text className="text-gray-600 text-xs ml-3">...and more</Text>
                        )}
                      </View>
                    ) : (
                      <Text className="text-amber-400 text-xs ml-5">
                        No items would print for this order type.
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* ══ INFO SUMMARY ══ */}
          <View className="bg-surface rounded-xl border border-gray-700 p-3 mt-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Summary
            </Text>
            <View className="flex-row justify-between mb-1">
              <Text className="text-gray-400 text-xs">Routing Mode</Text>
              <Text className="text-white text-xs font-medium capitalize">
                {routingConfig.routingMode}
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
              <Text className="text-gray-400 text-xs">Order Type Filter</Text>
              <Text className="text-white text-xs font-medium">
                {enabledOrderTypes.size === 0 ? "All types" : `${enabledOrderTypes.size} selected`}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* ── FOOTER ── */}
        <View className="px-4 pb-4 pt-3 border-t border-gray-700">
          <TouchableOpacity
            onPress={onClose}
            className="flex-row items-center justify-center gap-2 bg-blue-600 rounded-xl py-3"
          >
            <Check size={16} color="white" />
            <Text className="text-white font-semibold text-sm">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
