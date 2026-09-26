/**
 * List + detail layout for the menu management tabs.
 *
 * Wide content area (most tablets in landscape): the list and the selected
 * entity's detail side by side. Narrow (small tablets, split screen, large UI
 * scale): the list alone, and picking a row swaps in the detail with a back
 * bar. The breakpoint is measured on the split's own width, so it reacts to
 * the UI-scale setting as well as to the device.
 */
import React, { useCallback, useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";

import { ChevronLeft, ChevronRight, type LucideIcon } from "@/lib/icons";
import { colors } from "@/lib/theme";

import { EmptyState, Surface, useS } from "./ui";

/** Below this width (at scale 1) the list and the detail stop fitting side by side. */
const SPLIT_MIN_WIDTH = 720;

export function useSplitLayout() {
  const s = useS();
  const windowSize = useWindowDimensions();
  // First-frame estimate from the window so a narrow device doesn't flash the
  // wide layout before onLayout lands.
  const [width, setWidth] = useState(() => windowSize.width - s(32));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((prev) => (prev === next ? prev : next));
  }, []);

  const isWide = width >= s(SPLIT_MIN_WIDTH);
  const listWidth = Math.min(
    s(400),
    Math.max(s(290), Math.round(width * 0.36)),
  );
  return { onLayout, isWide, listWidth };
}

interface SplitViewProps {
  split: ReturnType<typeof useSplitLayout>;
  list: React.ReactNode;
  detail: React.ReactNode | null;
  /** Narrow layout: the label on the back bar above the detail. */
  backLabel: string;
  onBack: () => void;
  /** Wide layout with nothing selected. */
  emptyDetail: { icon: LucideIcon; title: string; description?: string };
}

export function SplitView({
  split,
  list,
  detail,
  backLabel,
  onBack,
  emptyDetail,
}: SplitViewProps) {
  const s = useS();
  const { onLayout, isWide, listWidth } = split;
  const showDetailOnly = !isWide && detail !== null;

  return (
    <View
      onLayout={onLayout}
      style={{ flex: 1, flexDirection: "row", gap: s(12) }}
    >
      {/*
        The list stays mounted in the narrow layout while the detail is open
        (display:none), so backing out returns to the same scroll position.
      */}
      <View
        style={
          isWide
            ? { width: listWidth }
            : showDetailOnly
              ? { display: "none" }
              : { flex: 1 }
        }
      >
        {list}
      </View>

      {(isWide || showDetailOnly) && (
        <View style={{ flex: 1, gap: s(8) }}>
          {showDetailOnly && (
            <TouchableOpacity
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={`Back to ${backLabel}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: s(4),
                height: s(36),
                paddingLeft: s(6),
                paddingRight: s(12),
                borderRadius: s(10),
                backgroundColor: colors.teal + "15",
              }}
            >
              <ChevronLeft size={s(18)} color={colors.teal} />
              <Text
                style={{ fontSize: s(13), fontWeight: "600", color: colors.teal }}
              >
                {backLabel}
              </Text>
            </TouchableOpacity>
          )}
          {detail ?? (
            <Surface style={{ flex: 1, justifyContent: "center" }}>
              <EmptyState
                icon={emptyDetail.icon}
                title={emptyDetail.title}
                description={emptyDetail.description}
              />
            </Surface>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

interface EntityRowProps {
  id: string;
  title: string;
  subtitle?: string;
  pills?: React.ReactNode;
  leading?: React.ReactNode;
  selected: boolean;
  /** Visually recede (hidden on this device, inactive). */
  dimmed?: boolean;
  onPress: (id: string) => void;
}

/**
 * One selectable row in a list pane. Selection reads like the Settings sub-nav:
 * a tinted fill and an inset accent bar, not a full-bleed border.
 */
export const EntityRow = React.memo(function EntityRow({
  id,
  title,
  subtitle,
  pills,
  leading,
  selected,
  dimmed,
  onPress,
}: EntityRowProps) {
  const s = useS();
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        minHeight: s(64),
        paddingVertical: s(12),
        paddingLeft: s(16),
        paddingRight: s(12),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: selected ? colors.teal + "12" : colors.panel,
      }}
    >
      {selected && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: s(10),
            bottom: s(10),
            width: s(3),
            borderTopRightRadius: s(3),
            borderBottomRightRadius: s(3),
            backgroundColor: colors.teal,
          }}
        />
      )}
      {leading}
      <View style={{ flex: 1, gap: s(4), opacity: dimmed ? 0.6 : 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: s(14),
            fontWeight: "600",
            color: selected ? colors.teal : colors.heading,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: s(12), color: colors.label }}>
            {subtitle}
          </Text>
        ) : null}
        {pills ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(4) }}>
            {pills}
          </View>
        ) : null}
      </View>
      <ChevronRight size={s(16)} color={selected ? colors.teal : colors.muted} />
    </TouchableOpacity>
  );
});

// ---------------------------------------------------------------------------
// Detail header
// ---------------------------------------------------------------------------

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  pills?: React.ReactNode;
  actions?: React.ReactNode;
}

export function DetailHeader({ title, subtitle, pills, actions }: DetailHeaderProps) {
  const s = useS();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: s(12),
        paddingHorizontal: s(16),
        paddingVertical: s(14),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: s(6) }}>
        <Text
          numberOfLines={2}
          style={{ fontSize: s(19), fontWeight: "700", color: colors.heading }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: s(12), color: colors.label }}>{subtitle}</Text>
        ) : null}
        {pills ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(6) }}>
            {pills}
          </View>
        ) : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}
