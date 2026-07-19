import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { bottomSheetTheme, colors } from "@/lib/theme";
import {
  formatSnoozeCountdown,
  isActivelySnoozed,
} from "@/lib/snoozeDurations";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Ban, Check, Layers, X } from "lucide-react-native";
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";

export interface OutOfStockSheetRef {
  open: () => void;
  close: () => void;
}

const OutOfStockBackdrop = (props: any) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    opacity={0.7}
  />
);

const OutOfStockSheetComponent: React.ForwardRefRenderFunction<
  OutOfStockSheetRef,
  object
> = (_props, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["80%"], []);

  const supabase = useSupabaseClient();
  const triggerPosSync = useTriggerPosSync();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const menuItems = useMenuStore((s) => s.menuItems);
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const unsnoozeItem = useMenuStore((s) => s.unsnoozeItem);
  const unsnoozeModifierOption = useMenuStore((s) => s.unsnoozeModifierOption);
  const unsnoozeModifierGroup = useMenuStore((s) => s.unsnoozeModifierGroup);
  const [busy, setBusy] = useState(false);

  const locationId = selectedStore?.id;

  useImperativeHandle(ref, () => ({
    open: () => bottomSheetRef.current?.expand(),
    close: () => bottomSheetRef.current?.close(),
  }));

  const snoozedItems = useMemo(
    () => menuItems.filter((i) => isActivelySnoozed(i.snoozedUntil)),
    [menuItems],
  );

  // Modifier groups that have at least one snoozed option.
  const snoozedGroups = useMemo(() => {
    return modifierGroups
      .map((g) => ({
        group: g,
        options: g.options.filter((o) => isActivelySnoozed(o.snoozedUntil)),
      }))
      .filter((g) => g.options.length > 0);
  }, [modifierGroups]);

  const sync = () =>
    locationId && triggerPosSync(locationId, selectedStore?.merchant_id);

  const restoreItem = async (itemId: string) => {
    if (!locationId || busy) return;
    setBusy(true);
    unsnoozeItem(itemId);
    try {
      await MenuService.setItemSnooze(supabase, {
        locationId,
        menuItemId: itemId,
        snoozedUntil: null,
      });
      sync();
    } finally {
      setBusy(false);
    }
  };

  const restoreOption = async (optionId: string) => {
    if (!locationId || busy) return;
    setBusy(true);
    unsnoozeModifierOption(optionId);
    try {
      await MenuService.setModifierSnooze(supabase, {
        locationId,
        modifierGroupItemId: optionId,
        snoozedUntil: null,
      });
      sync();
    } finally {
      setBusy(false);
    }
  };

  const restoreGroup = async (groupId: string, optionIds: string[]) => {
    if (!locationId || busy) return;
    setBusy(true);
    unsnoozeModifierGroup(groupId);
    try {
      const res = await MenuService.setModifierGroupSnooze(supabase, {
        locationId,
        modifierGroupId: groupId,
        snoozedUntil: null,
      });
      if (res.error) {
        await Promise.all(
          optionIds.map((id) =>
            MenuService.setModifierSnooze(supabase, {
              locationId,
              modifierGroupItemId: id,
              snoozedUntil: null,
            }),
          ),
        );
      }
      sync();
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    if (!locationId || busy) return;
    setBusy(true);
    snoozedItems.forEach((i) => unsnoozeItem(i.id));
    snoozedGroups.forEach((g) => unsnoozeModifierGroup(g.group.id));
    try {
      await Promise.all([
        ...snoozedItems.map((i) =>
          MenuService.setItemSnooze(supabase, {
            locationId,
            menuItemId: i.id,
            snoozedUntil: null,
          }),
        ),
        ...snoozedGroups.flatMap((g) =>
          g.options.map((o) =>
            MenuService.setModifierSnooze(supabase, {
              locationId,
              modifierGroupItemId: o.id,
              snoozedUntil: null,
            }),
          ),
        ),
      ]);
      sync();
    } finally {
      setBusy(false);
    }
  };

  const total =
    snoozedItems.length +
    snoozedGroups.reduce((n, g) => n + g.options.length, 0);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      {...bottomSheetTheme}
      backdropComponent={OutOfStockBackdrop}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ban size={16} color={colors.danger} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              Out of Stock ({total})
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {total > 0 && (
              <TouchableOpacity
                onPress={restoreAll}
                disabled={busy}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: colors.success + "18",
                  borderWidth: 1,
                  borderColor: colors.success + "35",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>
                  Restore all
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => bottomSheetRef.current?.close()}
              style={{
                padding: 7,
                backgroundColor: colors.teal + "10",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal + "30",
              }}
            >
              <X size={15} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>

        {total === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Check size={28} color={colors.success} />
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 10 }}>
              {"Nothing is 86'd right now."}
            </Text>
          </View>
        )}

        {/* Items */}
        {snoozedItems.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <Text style={sectionLabel}>Items ({snoozedItems.length})</Text>
            {snoozedItems.map((item) => (
              <RestoreRow
                key={item.id}
                title={item.name}
                countdown={formatSnoozeCountdown(item.snoozedUntil)}
                disabled={busy}
                onRestore={() => restoreItem(item.id)}
              />
            ))}
          </View>
        )}

        {/* Modifiers grouped */}
        {snoozedGroups.length > 0 && (
          <View>
            <Text style={sectionLabel}>Modifiers</Text>
            {snoozedGroups.map(({ group, options }) => (
              <View
                key={group.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Layers size={13} color={colors.teal} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
                      {group.name}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 12,
                        backgroundColor: colors.danger + "18",
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.danger }}>
                        {`${options.length} 86'd`}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      restoreGroup(
                        group.id,
                        group.options.map((o) => o.id),
                      )
                    }
                    disabled={busy}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.success + "18",
                      borderWidth: 1,
                      borderColor: colors.success + "35",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.success }}>
                      Restore group
                    </Text>
                  </TouchableOpacity>
                </View>
                {options.map((o) => (
                  <RestoreRow
                    key={o.id}
                    title={o.name}
                    countdown={formatSnoozeCountdown(o.snoozedUntil)}
                    disabled={busy}
                    compact
                    onRestore={() => restoreOption(o.id)}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const sectionLabel = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: 8,
};

function RestoreRow({
  title,
  countdown,
  disabled,
  compact,
  onRestore,
}: {
  title: string;
  countdown: string | null;
  disabled: boolean;
  compact?: boolean;
  onRestore: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: compact ? 6 : 9,
        paddingHorizontal: compact ? 4 : 10,
        borderRadius: 8,
        backgroundColor: compact ? "transparent" : colors.screen,
        borderWidth: compact ? 0 : 1,
        borderColor: colors.border,
        marginBottom: compact ? 2 : 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
        <Ban size={12} color={colors.danger} />
        <Text style={{ fontSize: 12, color: colors.heading }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          {countdown === "86" ? "· until restored" : `· back in ${countdown}`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRestore}
        disabled={disabled}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 6,
          backgroundColor: colors.success + "18",
          borderWidth: 1,
          borderColor: colors.success + "35",
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.success }}>
          Restore
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const OutOfStockSheet = forwardRef(OutOfStockSheetComponent);
OutOfStockSheet.displayName = "OutOfStockSheet";

export default OutOfStockSheet;
