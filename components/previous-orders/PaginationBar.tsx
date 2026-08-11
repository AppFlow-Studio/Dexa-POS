import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface PagerButtonProps {
  label: string;
  direction: "prev" | "next";
  enabled: boolean;
  onPress: () => void;
}

// Hoisted rather than nested inside PaginationBar: a component defined during
// render is a new type every pass, so React unmounts and remounts it instead of
// updating it.
const PagerButton: React.FC<PagerButtonProps> = ({
  label,
  direction,
  enabled,
  onPress,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const tint = enabled ? colors.heading : colors.muted;

  return (
    <TouchableOpacity
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(6),
        height: s(44),
        paddingHorizontal: s(16),
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: enabled ? colors.border : colors.border + "60",
        backgroundColor: enabled ? colors.card : "transparent",
        opacity: enabled ? 1 : 0.45,
      }}
    >
      {direction === "prev" && <Icon size={s(16)} color={tint} />}
      <Text style={{ fontSize: s(13), fontWeight: "700", color: tint }}>
        {label}
      </Text>
      {direction === "next" && <Icon size={s(16)} color={tint} />}
    </TouchableOpacity>
  );
};

export interface PaginationBarProps {
  /** Zero-based index of the page on screen. */
  pageIndex: number;
  pageCount: number;
  /** Exact server total for the active filters; null while it's in flight. */
  totalCount: number | null;
  /** 1-based inclusive row range on screen, for "51–100 of 312". */
  rangeStart: number;
  rangeEnd: number;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Pager for a server-paginated order list, shared by the Previous Orders screen
 * and the menu's Previous Orders section.
 *
 * Renders at the end of the scrolled rows, so it's found by scrolling to the
 * bottom. It states the exact position in the result set — the thing an
 * infinite-scroll list can't tell you, and the reason a merchant couldn't
 * previously tell whether more orders existed.
 */
const PaginationBar: React.FC<PaginationBarProps> = ({
  pageIndex,
  pageCount,
  totalCount,
  rangeStart,
  rangeEnd,
  isLoading,
  onPrev,
  onNext,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const canPrev = pageIndex > 0 && !isLoading;
  const canNext = pageIndex < pageCount - 1 && !isLoading;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        gap: s(12),
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.panel,
      }}
    >
      <PagerButton
        label="Previous"
        direction="prev"
        enabled={canPrev}
        onPress={onPrev}
      />

      <View style={{ alignItems: "center", gap: s(2) }}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "600",
                color: colors.heading,
                fontVariant: ["tabular-nums"],
              }}
            >
              {totalCount === 0
                ? "No orders"
                : `${rangeStart}–${rangeEnd} of ${totalCount ?? "…"}`}
            </Text>
            {pageCount > 0 && (
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  fontVariant: ["tabular-nums"],
                }}
              >
                Page {pageIndex + 1} of {pageCount}
              </Text>
            )}
          </>
        )}
      </View>

      <PagerButton
        label="Next"
        direction="next"
        enabled={canNext}
        onPress={onNext}
      />
    </View>
  );
};

export default React.memo(PaginationBar);
