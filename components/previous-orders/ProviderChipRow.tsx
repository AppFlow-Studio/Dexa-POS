import {
    PROVIDER_LABELS,
    type ProviderKey,
} from "@/lib/previousOrdersFilters";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import * as PopoverPrimitive from "@rn-primitives/popover";
import { ChevronDown, LayoutGrid } from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import ProviderGlyph from "./ProviderGlyph";

export type ProviderFilter = "all" | ProviderKey;

interface ProviderChipRowProps {
  roster: ProviderKey[];
  counts: Record<string, number>;
  totalCount: number;
  selected: ProviderFilter;
  /** False while the window counts load — chips show "–" instead of a fake 0. */
  countsReady?: boolean;
  onSelect: (provider: ProviderFilter) => void;
}

interface ChipDef {
  key: ProviderFilter;
  label: string;
  count: number;
}

const GAP = 8;

const Chip: React.FC<{
  chip: ChipDef;
  isActive: boolean;
  countsReady?: boolean;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  fullWidth?: boolean;
}> = ({ chip, isActive, countsReady = true, onPress, onLayout, fullWidth }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(8),
        height: s(44),
        paddingHorizontal: s(12),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: isActive ? colors.teal : colors.border,
        backgroundColor: isActive ? colors.teal + "14" : colors.card,
        alignSelf: fullWidth ? "stretch" : "auto",
      }}
    >
      {chip.key === "all" ? (
        <LayoutGrid size={s(16)} color={colors.label} />
      ) : (
        <ProviderGlyph provider={chip.key} size={s(20)} />
      )}
      <Text
        style={{
          fontSize: s(13),
          fontWeight: isActive ? "700" : "600",
          color: isActive ? colors.teal : colors.heading,
        }}
        numberOfLines={1}
      >
        {chip.label}
      </Text>
      <Text
        style={{
          fontSize: s(13),
          color: colors.muted,
          fontVariant: ["tabular-nums"],
        }}
      >
        ({countsReady ? chip.count : "–"})
      </Text>
    </Pressable>
  );
};

/**
 * Provider sub-row for the Online tab. Single-select, and it NEVER scrolls
 * horizontally: chips are measured off-screen, only the ones that fit are laid
 * out, and the remainder collapse into a "+N ▾" popover. The selected chip is
 * always pulled into the visible set (priority+), so an active filter can't
 * hide inside the overflow.
 */
const ProviderChipRowContent: React.FC<ProviderChipRowProps> = ({
  roster,
  counts,
  totalCount,
  selected,
  countsReady = true,
  onSelect,
}) => {
  const uiScale = useUiScale();
  const s = useCallback((n: number) => Math.round(n * uiScale), [uiScale]);
  const triggerRef = useRef<PopoverPrimitive.TriggerRef>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthsRef = useRef<Record<string, number>>({});

  const chips: ChipDef[] = useMemo(
    () => [
      { key: "all" as ProviderFilter, label: "All Sources", count: totalCount },
      ...roster.map((key) => ({
        key: key as ProviderFilter,
        label: PROVIDER_LABELS[key],
        count: counts[key] ?? 0,
      })),
    ],
    [roster, counts, totalCount],
  );

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const measure = useCallback((key: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (widthsRef.current[key] === w) return;
    widthsRef.current = { ...widthsRef.current, [key]: w };
    setWidths(widthsRef.current);
  }, []);

  const gap = s(GAP);
  const overflowWidth = s(72);

  const { visible, overflow } = useMemo(() => {
    const measured = chips.every((c) => widths[c.key] != null);
    if (!measured || containerWidth <= 0) {
      return { visible: [] as ChipDef[], overflow: [] as ChipDef[] };
    }

    const total = chips.reduce(
      (sum, c, i) => sum + widths[c.key] + (i > 0 ? gap : 0),
      0,
    );
    if (total <= containerWidth) {
      return { visible: chips, overflow: [] as ChipDef[] };
    }

    // Overflow button is always present in this branch, so reserve its width.
    const budget = containerWidth - overflowWidth - gap;
    let used = 0;
    let fit = 0;
    for (let i = 0; i < chips.length; i++) {
      const next = used + widths[chips[i].key] + (i > 0 ? gap : 0);
      if (next > budget) break;
      used = next;
      fit = i + 1;
    }
    // "All Sources" always stays: it's the reset affordance.
    fit = Math.max(fit, 1);

    const visibleChips = chips.slice(0, fit);
    const overflowChips = chips.slice(fit);

    // Priority+: surface the active chip even when it sorts into the overflow.
    const activeInOverflow = overflowChips.findIndex((c) => c.key === selected);
    if (activeInOverflow >= 0 && visibleChips.length > 1) {
      const promoted = overflowChips.splice(activeInOverflow, 1)[0];
      const demoted = visibleChips.splice(visibleChips.length - 1, 1)[0];
      visibleChips.push(promoted);
      overflowChips.unshift(demoted);
    }

    return { visible: visibleChips, overflow: overflowChips };
  }, [chips, widths, containerWidth, gap, overflowWidth, selected]);

  const handleOverflowSelect = useCallback(
    (key: ProviderFilter) => {
      onSelect(key);
      triggerRef.current?.close();
    },
    [onSelect],
  );

  if (chips.length <= 1) return null;

  return (
    <View onLayout={handleContainerLayout} style={{ height: s(44) }}>
      {/* Off-screen measuring layer. Stays mounted so a label/count width
          change (e.g. 9 → 10 orders) re-measures itself. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          opacity: 0,
          flexDirection: "row",
          gap,
        }}
      >
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            chip={chip}
            isActive={false}
            onPress={() => {}}
            onLayout={measure(chip.key)}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap }}>
        {visible.map((chip) => (
          <Chip
            key={chip.key}
            chip={chip}
            isActive={chip.key === selected}
            countsReady={countsReady}
            onPress={() => onSelect(chip.key)}
          />
        ))}

        {overflow.length > 0 && (
          <Popover>
            <PopoverTrigger
              ref={triggerRef}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(4),
                height: s(44),
                paddingHorizontal: s(12),
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                +{overflow.length}
              </Text>
              <ChevronDown size={s(14)} color={colors.label} />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="p-1 border rounded-xl"
              style={{
                width: s(230),
                backgroundColor: colors.card,
                borderColor: colors.border,
                gap: s(4),
              }}
            >
              {overflow.map((chip) => (
                <Chip
                  key={chip.key}
                  chip={chip}
                  isActive={chip.key === selected}
                  countsReady={countsReady}
                  onPress={() => handleOverflowSelect(chip.key)}
                  fullWidth
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </View>
    </View>
  );
};

const ProviderChipRow = React.memo(ProviderChipRowContent);
export default ProviderChipRow;
