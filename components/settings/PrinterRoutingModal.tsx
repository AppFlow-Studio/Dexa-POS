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

type StepId = "mode" | "assignments";

const STEP_LABELS: Record<StepId, string> = {
  mode: "Mode",
  assignments: "Items",
};

const STEP_TITLES: Record<StepId, string> = {
  mode: "What prints on this printer?",
  assignments: "Choose categories & items",
};

const STEP_SUBTITLES: Record<StepId, string> = {
  mode: "Print everything, or pick specific categories and items.",
  assignments: "Tap a category or item on the left to route it here.",
};

function getSteps(mode: PrinterRoutingMode): StepId[] {
  // Everything / Catch-All need no picker — single screen. Custom reveals the picker.
  if (mode === "custom") return ["mode", "assignments"];
  return ["mode"];
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
    label: "Everything",
    desc: "Prints every item — new menu categories are included automatically.",
    example: "Best for a single kitchen printer.",
    Icon: Layers,
  },
  {
    mode: "custom",
    label: "Specific categories & items",
    desc: "You pick exactly what prints here.",
    example: "E.g. a grill station that only handles burgers and steaks.",
    Icon: Settings2,
  },
  {
    mode: "unassigned",
    label: "Catch-All",
    desc: "Only items no other printer already claims.",
    example: "A fallback when other stations handle specific categories.",
    Icon: SlidersHorizontal,
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
  const [showOrderTypes, setShowOrderTypes] = useState(false);
  const [showTest, setShowTest] = useState(false);

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
        // Custom reveals the picker immediately (2-tap feel); the single-step
        // modes (Everything / Catch-All) have no step 2, so stay on the mode screen.
        setWizardStep(mode === "custom" ? 1 : 0);
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
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 6,
                    borderWidth: 1,
                    backgroundColor: isSelected ? colors.teal + '20' : colors.card,
                    borderColor: isSelected ? colors.teal + '50' : colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      marginRight: 12,
                      flexShrink: 0,
                      borderColor: isSelected ? colors.teal : colors.muted,
                      backgroundColor: isSelected ? colors.teal : 'transparent',
                    }}
                  >
                    {isSelected && <Check size={11} color="#0C0F1A" />}
                  </View>
                  <Icon size={14} color={isSelected ? colors.teal : colors.muted} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontWeight: '600', fontSize: 13, color: isSelected ? colors.teal : colors.heading }}>
                      {label}
                    </Text>
                    <Text style={{ color: colors.label, fontSize: 11, marginTop: 1, lineHeight: 15 }}>{desc}</Text>
                    <Text style={{ color: colors.teal + 'B3', fontSize: 11, fontStyle: 'italic', marginTop: 4 }}>{example}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginBottom: 6,
            }}>
              <Search size={14} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search categories or items…"
                placeholderTextColor={colors.muted}
                style={{ flex: 1, color: colors.heading, fontSize: 13, marginLeft: 8 }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={14} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Dual-list */}
            <View style={{ flexDirection: 'row', gap: 12, height: 360 }}>

              {/* ── LEFT: Menu (categories + expandable items) ── */}
              <View style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.panel,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Menu</Text>
                  <TouchableOpacity onPress={handleAllItemsToggle}>
                    <Text style={{ color: colors.teal, fontSize: 12 }}>
                      {enabledCategoryIds.size === categories.length ? "Remove all" : "Add all"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 6 }}>
                  {visibleCategories.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>No results</Text>
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
                      <View key={cat.id} style={{ marginBottom: 4 }}>
                        {/* Category row */}
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: colors.panel,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          overflow: 'hidden',
                        }}>
                          {/* Expand toggle */}
                          {catItems.length > 0 ? (
                            <TouchableOpacity
                              onPress={() => setExpandedInDualList((prev) => {
                                const next = new Set(prev);
                                next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                return next;
                              })}
                              style={{ paddingHorizontal: 8, paddingVertical: 10 }}
                            >
                              {isExpanded
                                ? <ChevronDown size={13} color={colors.muted} />
                                : <ChevronRight size={13} color={colors.muted} />
                              }
                            </TouchableOpacity>
                          ) : (
                            <View style={{ width: 28 }} />
                          )}

                          {/* Category name */}
                          <TouchableOpacity
                            onPress={() => handleCategoryToggle(cat.id)}
                            style={{ flex: 1, paddingVertical: 10, paddingRight: 8 }}
                          >
                            <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{cat.name}</Text>
                            <Text style={{ color: colors.muted, fontSize: 12 }}>
                              {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                            </Text>
                          </TouchableOpacity>

                          {/* Assign whole category */}
                          <TouchableOpacity
                            onPress={() => handleCategoryToggle(cat.id)}
                            style={{ paddingHorizontal: 12, paddingVertical: 10 }}
                          >
                            <ChevronRight size={15} color={colors.teal} />
                          </TouchableOpacity>
                        </View>

                        {/* Expanded individual items — only unassigned ones */}
                        {isExpanded && availableItems.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            onPress={() => handleItemToggle(item.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginLeft: 20,
                              marginTop: 2,
                              backgroundColor: colors.panel,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                              paddingHorizontal: 8,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: colors.label, fontSize: 12, flex: 1 }} numberOfLines={1}>{item.name}</Text>
                            <ChevronRight size={13} color={colors.teal} />
                          </TouchableOpacity>
                        ))}
                        {/* If all items assigned individually, show hint */}
                        {isExpanded && availableItems.length === 0 && catItems.length > 0 && (
                          <View style={{ marginLeft: 20, marginTop: 2, paddingHorizontal: 8, paddingVertical: 6 }}>
                            <Text style={{ color: colors.muted, fontSize: 12, fontStyle: 'italic' }}>All items assigned individually</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              {/* ── CENTRE: visual arrow column ── */}
              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, width: 24 }}>
                <ChevronsRight size={14} color={colors.muted} />
              </View>

              {/* ── RIGHT: Assigned to this printer ── */}
              <View style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + '4D',
                overflow: 'hidden',
              }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.teal + '15',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Prints here
                  </Text>
                  <View style={{ backgroundColor: colors.teal + '4D', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: colors.teal, fontSize: 12, fontWeight: '700' }}>{totalAssigned}</Text>
                  </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 6 }}>
                  {totalAssigned === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <ChevronsRight size={16} color={colors.border} />
                      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 16 }}>
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
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 8,
                              paddingVertical: 10,
                              borderRadius: 8,
                              marginBottom: 4,
                              backgroundColor: colors.teal + '15',
                              borderWidth: 1,
                              borderColor: colors.teal + '4D',
                            }}
                          >
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{cat.name}</Text>
                              <Text style={{ color: colors.teal + '99', fontSize: 12 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
                            </View>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginRight: 4 }} />
                          </TouchableOpacity>
                        );
                      })}

                      {/* Divider between categories and individual items */}
                      {assignedCategories.length > 0 && assignedIndividualItems.length > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 4 }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                          <Text style={{ color: colors.muted, fontSize: 12 }}>individual items</Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                        </View>
                      )}

                      {/* Individually assigned items (not covered by category) */}
                      {assignedIndividualItems.map((item) => {
                        const catName = item.category?.[0] ?? "";
                        return (
                          <TouchableOpacity
                            key={`item-${item.id}`}
                            onPress={() => handleItemToggle(item.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingHorizontal: 8,
                              paddingVertical: 10,
                              borderRadius: 8,
                              marginBottom: 4,
                              backgroundColor: colors.teal + '15',
                              borderWidth: 1,
                              borderColor: colors.teal + '4D',
                            }}
                          >
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={{ color: colors.heading, fontSize: 13 }} numberOfLines={1}>{item.name}</Text>
                              {catName ? (
                                <Text style={{ color: colors.teal + '99', fontSize: 12 }} numberOfLines={1}>{catName}</Text>
                              ) : null}
                            </View>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginRight: 4 }} />
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              </View>

            </View>

            {/* Summary footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {enabledCategoryIds.size} categor{enabledCategoryIds.size !== 1 ? "ies" : "y"} · {assignedIndividualItems.length} individual item{assignedIndividualItems.length !== 1 ? "s" : ""}
              </Text>
              {totalAssigned === 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} color={colors.warning} />
                  <Text style={{ color: colors.warning, fontSize: 12 }}>Nothing assigned yet</Text>
                </View>
              )}
            </View>

            {/* Routing conflicts — same category claimed by another custom printer */}
            {conflictWarnings.length > 0 && (
              <View style={{
                marginTop: 10,
                padding: 12,
                backgroundColor: colors.warning + '1A',
                borderWidth: 1,
                borderColor: colors.warning + '55',
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <AlertTriangle size={13} color={colors.warning} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '600', marginBottom: 3 }}>
                    Also printing elsewhere
                  </Text>
                  {conflictWarnings.map((w, i) => (
                    <Text key={i} style={{ color: colors.warning, fontSize: 11, lineHeight: 15 }}>
                      {`"${w.categoryName}" also prints on ${w.printerNames.filter((n) => n !== printer.printerName).join(", ")}`}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Print Modifiers (folded in from the old Options step) */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              marginTop: 10,
              borderWidth: 1,
              backgroundColor: routingConfig.printModifiers ? colors.teal + '1A' : colors.card,
              borderColor: routingConfig.printModifiers ? colors.teal + '66' : colors.border,
            }}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '600' }}>Print Modifiers</Text>
                <Text style={{ color: colors.label, fontSize: 11, marginTop: 1, lineHeight: 15 }}>
                  Show item modifiers and add-ons on kitchen tickets
                </Text>
              </View>
              <Switch
                checked={routingConfig.printModifiers}
                onCheckedChange={(v) => setPrintModifiers(printer.id, v)}
              />
            </View>

            {/* Order types (optional) — empty = all types (see passesOrderTypeGate) */}
            <TouchableOpacity
              onPress={() => setShowOrderTypes((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                marginTop: 6,
                borderWidth: 1,
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '600' }}>Order types (optional)</Text>
                <Text style={{ color: colors.label, fontSize: 11, marginTop: 1, lineHeight: 15 }}>
                  {enabledOrderTypes.size === 0
                    ? "Prints for all order types"
                    : `Only: ${ORDER_TYPES.filter((o) => enabledOrderTypes.has(o.value)).map((o) => o.label).join(", ")}`}
                </Text>
              </View>
              {showOrderTypes
                ? <ChevronDown size={16} color={colors.muted} />
                : <ChevronRight size={16} color={colors.muted} />}
            </TouchableOpacity>
            {showOrderTypes && (
              <View style={{ marginTop: 6, gap: 6 }}>
                {ORDER_TYPES.map(({ value, label, Icon }) => {
                  const isOn = enabledOrderTypes.has(value);
                  return (
                    <View
                      key={value}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        backgroundColor: isOn ? colors.teal + '1A' : colors.card,
                        borderColor: isOn ? colors.teal + '66' : colors.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Icon size={14} color={isOn ? colors.teal : colors.muted} />
                        <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '500' }}>{label}</Text>
                      </View>
                      <Switch checked={isOn} onCheckedChange={() => handleOrderTypeToggle(value)} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      }

      default:
        return null;
    }
  }

  // Optional "Preview what prints" section — reachable via a button in all modes,
  // not a required step. Reuses handleTestConfiguration / testOrderType / testResults.
  function renderTestSection() {
    return (
      <View style={{ marginTop: 12 }}>
        {/* Order type picker */}
        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          Simulate Order Type
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {ORDER_TYPES.map(({ value, label, Icon }) => (
            <TouchableOpacity
              key={value}
              onPress={() => { setTestOrderType(value); setTestResults(null); }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 7,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: testOrderType === value ? colors.teal + '33' : colors.card,
                borderColor: testOrderType === value ? colors.teal : colors.border,
              }}
            >
              <Icon size={13} color={testOrderType === value ? colors.teal : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: '500', color: testOrderType === value ? colors.teal : colors.label }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleTestConfiguration}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 8,
            backgroundColor: colors.teal,
            borderRadius: 8,
            marginBottom: 6,
          }}
        >
          <Zap size={14} color="#0C0F1A" />
          <Text style={{ color: '#0C0F1A', fontWeight: '600', fontSize: 13 }}>Run Simulation</Text>
        </TouchableOpacity>

        {/* Results */}
        {testResults !== null && (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
          }}>
            <Text style={{ color: colors.heading, fontWeight: '600', fontSize: 13, marginBottom: 12 }}>Simulation Results</Text>
            {testResults.map((r, i) => (
              <View key={i}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Printer size={14} color={colors.warning} />
                  <Text style={{ color: colors.label, fontSize: 12, fontWeight: '500', flex: 1 }}>{r.role}</Text>
                </View>
                {r.itemNames.length > 0 ? (
                  <View style={{ marginLeft: 22, gap: 6, marginBottom: 8 }}>
                    {r.itemNames.map((name, j) => (
                      <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted }} />
                        <Text style={{ color: colors.label, fontSize: 12 }}>{name}</Text>
                      </View>
                    ))}
                    {r.itemNames.length >= 8 && (
                      <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 12 }}>…and more</Text>
                    )}
                  </View>
                ) : (
                  <Text style={{ color: colors.warning, fontSize: 12, marginLeft: 22, marginBottom: 8 }}>
                    No items would print for this order type.
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
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
      <View style={{ flex: 1, backgroundColor: colors.panel }}>

        {/* ── HEADER ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: colors.teal + "18",
              borderWidth: 1, borderColor: colors.teal + "40",
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Printer size={16} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                {printer.printerName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View style={{
                  backgroundColor: colors.teal + "18",
                  borderWidth: 1, borderColor: colors.teal + "40",
                  borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal, textTransform: 'capitalize' }}>
                    {printer.printerRole}
                  </Text>
                </View>
                <Settings2 size={11} color={colors.muted} />
                <Text style={{ color: colors.label, fontSize: 11 }}>Configure Routing</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isSaving && <ActivityIndicator size="small" color={colors.teal} />}
            <TouchableOpacity
              onPress={onClose}
              style={{
                padding: 8,
                backgroundColor: colors.teal + "15",
                borderWidth: 1, borderColor: colors.teal + "35",
                borderRadius: 8,
              }}
            >
              <X size={14} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── STEP INDICATOR (hidden for single-step Everything / Catch-All) ── */}
        {steps.length > 1 && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          {steps.map((stepId, i) => {
            const isCompleted = i < wizardStep;
            const isActive = i === wizardStep;
            return (
              <React.Fragment key={stepId}>
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => isCompleted && setWizardStep(i)}
                    disabled={!isCompleted}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      backgroundColor: isCompleted ? colors.teal : isActive ? colors.teal + '33' : colors.card,
                      borderColor: isCompleted ? colors.teal : isActive ? colors.teal : colors.border,
                    }}
                  >
                    {isCompleted
                      ? <Check size={13} color="#0C0F1A" />
                      : <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? colors.teal : colors.muted }}>{i + 1}</Text>}
                  </TouchableOpacity>
                  <Text style={{
                    fontSize: 12,
                    marginTop: 4,
                    color: isActive ? colors.teal : isCompleted ? colors.teal : colors.muted,
                    fontWeight: isActive ? '600' : '400',
                  }}>
                    {STEP_LABELS[stepId]}
                  </Text>
                </View>
                {i < steps.length - 1 && (
                  <View style={{
                    height: 2,
                    flex: 1,
                    marginHorizontal: 4,
                    marginBottom: 6,
                    backgroundColor: i < wizardStep ? colors.teal : colors.border,
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </View>
        )}

        {/* ── STEP TITLE ── */}
        <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 13 }}>{STEP_TITLES[currentStepId]}</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{STEP_SUBTITLES[currentStepId]}</Text>
        </View>

        {/* ── SCROLLABLE CONTENT ── */}
        <ScrollView
          key={currentStepId}
          style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {renderStepContent()}

          {/* Optional preview — available in all modes, not a required step */}
          <TouchableOpacity
            onPress={() => setShowTest((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 12,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Zap size={13} color={colors.muted} />
            <Text style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}>
              {showTest ? 'Hide preview' : 'Preview what prints'}
            </Text>
            {showTest
              ? <ChevronDown size={14} color={colors.muted} />
              : <ChevronRight size={14} color={colors.muted} />}
          </TouchableOpacity>
          {showTest && renderTestSection()}
        </ScrollView>

        {/* ── FOOTER NAV ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingBottom: 16,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}>
          {/* Back only exists when there's a second step (Custom mode) */}
          {steps.length > 1 && (
            <TouchableOpacity
              onPress={() => setWizardStep((s) => s - 1)}
              disabled={wizardStep === 0}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: 'transparent',
                borderColor: colors.border,
                opacity: wizardStep === 0 ? 0.3 : 1,
              }}
            >
              <Text style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}>Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={isLastStep ? onClose : () => setWizardStep((s) => s + 1)}
            style={{
              flex: 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: colors.teal + '33',
              borderWidth: 1,
              borderColor: colors.teal + '80',
            }}
          >
            {isSaving && <ActivityIndicator size="small" color={colors.teal} />}
            {isLastStep
              ? <><Check size={14} color={colors.teal} /><Text style={{ color: colors.teal, fontWeight: '600', fontSize: 13 }}>Done</Text></>
              : <><Text style={{ color: colors.teal, fontWeight: '600', fontSize: 13 }}>Next</Text><ArrowRight size={14} color={colors.teal} /></>
            }
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}
