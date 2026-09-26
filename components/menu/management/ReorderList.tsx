/**
 * Dedicated reorder mode: a single-column list with drag handles.
 *
 * Replaces the old screen's hand-rolled pan gestures, which computed the drop
 * target from a hard-coded row height (96px for menus, 60 for categories) and
 * so dropped rows in the wrong place as soon as anything above was expanded.
 * DraggableFlatList measures real rows. Every drop saves immediately, as before.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import * as Haptics from "expo-haptics";

import MenuManagementImage from "@/components/menu/MenuManagementImage";
import { Check, GripVertical, type LucideIcon } from "@/lib/icons";
import { colors } from "@/lib/theme";

import { Button, Surface, useS } from "./ui";

export interface ReorderRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Item image (any source `MenuManagementImage` accepts). */
  image?: string;
  /** Shown when there is no image. */
  placeholderIcon?: LucideIcon;
}

interface ReorderListProps {
  title: string;
  rows: ReorderRow[];
  /** Receives the full new order plus the move, after every drop. */
  onReorder: (orderedIds: string[], from: number, to: number) => void;
  onDone: () => void;
  disabled?: boolean;
}

export function ReorderList({
  title,
  rows,
  onReorder,
  onDone,
  disabled = false,
}: ReorderListProps) {
  const s = useS();
  // Local copy so the list shows the drop instantly; re-synced from props when
  // the source changes outside a drag (sync tick, another station).
  const [data, setData] = useState(rows);
  const draggingRef = useRef(false);
  useEffect(() => {
    if (!draggingRef.current) setData(rows);
  }, [rows]);

  const rowHeight = s(60);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ReorderRow>) => {
      const Placeholder = item.placeholderIcon;
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={disabled ? undefined : drag}
            delayLongPress={120}
            disabled={isActive}
            activeOpacity={0.9}
            accessibilityHint="Long-press and drag to move"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(12),
              height: rowHeight,
              paddingHorizontal: s(14),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: isActive ? colors.card : colors.panel,
            }}
          >
            <TouchableOpacity
              onPressIn={disabled ? undefined : drag}
              accessibilityRole="button"
              accessibilityLabel={`Drag ${item.title}`}
              style={{
                width: s(36),
                height: s(36),
                borderRadius: s(8),
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.card,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <GripVertical size={s(18)} color={colors.label} />
            </TouchableOpacity>
            {(item.image || Placeholder) && (
              <View
                style={{
                  width: s(40),
                  height: s(40),
                  borderRadius: s(8),
                  overflow: "hidden",
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.image ? (
                  <MenuManagementImage
                    image={item.image}
                    recyclingKey={item.id}
                    decodeSize={80}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : Placeholder ? (
                  <Placeholder size={s(18)} color={colors.muted} />
                ) : null}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: s(14), fontWeight: "600", color: colors.heading }}
              >
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text numberOfLines={1} style={{ fontSize: s(12), color: colors.label }}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [disabled, rowHeight, s],
  );

  return (
    <Surface style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(12),
          paddingHorizontal: s(16),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>
            {title}
          </Text>
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            {disabled
              ? "Reordering needs a connection."
              : "Drag the handle to move a row. Each move saves right away."}
          </Text>
        </View>
        <Button label="Done" icon={Check} variant="primary" onPress={onDone} />
      </View>
      <DraggableFlatList
        data={data}
        keyExtractor={(row) => row.id}
        renderItem={renderItem}
        activationDistance={8}
        containerStyle={{ flex: 1 }}
        getItemLayout={(_, index) => ({
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
        onDragBegin={() => {
          draggingRef.current = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onDragEnd={({ data: next, from, to }) => {
          draggingRef.current = false;
          setData(next);
          if (from !== to) {
            void Haptics.selectionAsync();
            onReorder(
              next.map((row) => row.id),
              from,
              to,
            );
          }
        }}
      />
    </Surface>
  );
}
