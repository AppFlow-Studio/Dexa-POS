import { useToast } from "@/contexts/ToastContext";
import { useOnlineMenu } from "@/hooks/pos/useOnlineMenu";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
    computeSnoozeUntil,
    formatSnoozeCountdown,
    isActivelySnoozed,
    SnoozeOption,
} from "@/lib/snoozeDurations";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { ItemModifierStockSection } from "@/components/menu/ItemModifierStockSection";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
    BottomSheetTextInput,
} from "@/components/ui/bottomSheet";
import { BottomSheetMethods } from "@/components/ui/bottomSheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ban, Check, Clock, X } from "lucide-react-native";
import React, {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Platform,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export type SnoozeKind = "item" | "modifier-option" | "modifier-group";

export interface SnoozeItem {
  id: string;
  name: string;
  snoozedUntil?: string | null;
  /** What is being 86'd. Defaults to "item" for backward compatibility. */
  kind?: SnoozeKind;
  /** For "modifier-group": the option ids, used for the per-option fallback. */
  optionIds?: string[];
}

export interface SnoozeBottomSheetRef {
  open: (item: SnoozeItem) => void;
  close: () => void;
}

interface DurationChoice {
  label: string;
  option: SnoozeOption;
}

const DURATION_CHOICES: DurationChoice[] = [
  { label: "For 1 hour", option: { kind: "hours", hours: 1 } },
  { label: "For 4 hours", option: { kind: "hours", hours: 4 } },
  { label: "Until end of day", option: { kind: "end_of_day" } },
  { label: "Until I turn it back on", option: { kind: "until_manual" } },
];

const SnoozeBackdrop = (props: any) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    opacity={0.7}
  />
);

const SnoozeBottomSheetComponent: React.ForwardRefRenderFunction<
  SnoozeBottomSheetRef,
  object
> = (_props, ref) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  const [item, setItem] = useState<SnoozeItem | null>(null);
  const [reason, setReason] = useState("");
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useSupabaseClient();
  const { show: showToast } = useToast();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  // Does this location publish an online (OrderOut) menu? A per-item/-modifier
  // 86 propagates there automatically via the DB snooze trigger, so the
  // confirmation tells the user their online menu is being kept in sync.
  const { onlineMenuId } = useOnlineMenu(selectedStore?.id);
  const snoozeItemInStore = useMenuStore((s) => s.snoozeItem);
  const unsnoozeItemInStore = useMenuStore((s) => s.unsnoozeItem);
  const snoozeModifierOptionInStore = useMenuStore(
    (s) => s.snoozeModifierOption,
  );
  const unsnoozeModifierOptionInStore = useMenuStore(
    (s) => s.unsnoozeModifierOption,
  );
  const snoozeModifierGroupInStore = useMenuStore((s) => s.snoozeModifierGroup);
  const unsnoozeModifierGroupInStore = useMenuStore(
    (s) => s.unsnoozeModifierGroup,
  );

  const locationId = selectedStore?.id;
  const currentlySnoozed = isActivelySnoozed(item?.snoozedUntil);

  // When 86ing an ITEM, also surface its attached modifier groups so their
  // options can be marked out of stock right here (mirrors the website's
  // edit-item form). Only for item targets — a modifier-option/group sheet has
  // no "attached modifiers" of its own.
  const menuItemsById = useMenuStore((s) => s.menuItemsById);
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const isItemTarget = (item?.kind ?? "item") === "item";
  const itemModifierGroups = useMemo(() => {
    if (!isItemTarget || !item?.id) return [];
    const ids = menuItemsById[item.id]?.modifierGroupIds ?? [];
    if (!ids.length) return [];
    const idSet = new Set(ids);
    return modifierGroups.filter((g) => idSet.has(g.id));
  }, [isItemTarget, item?.id, menuItemsById, modifierGroups]);

  const snapPoints = useMemo(
    () => (itemModifierGroups.length > 0 ? ["90%"] : ["70%"]),
    [itemModifierGroups.length],
  );

  useImperativeHandle(ref, () => ({
    open: (newItem: SnoozeItem) => {
      setItem(newItem);
      setReason("");
      setCustomDate(null);
      setShowCustomPicker(false);
      setError(null);
      setIsLoading(false);
      bottomSheetRef.current?.expand();
    },
    close: () => bottomSheetRef.current?.close(),
  }));

  const handleClose = useCallback(() => {
    bottomSheetRef.current?.close();
  }, []);

  // Persist the 86/restore to the backend for whichever target kind this is.
  // Returns an error object (or null on success). snoozedUntil === null clears.
  const writeSnooze = useCallback(
    async (
      target: SnoozeItem,
      snoozedUntil: string | null,
      reasonValue: string | null,
    ): Promise<any> => {
      if (!locationId) return { message: "Missing location information" };
      const k = target.kind ?? "item";
      if (k === "item") {
        const { error } = await MenuService.setItemSnooze(supabase, {
          locationId,
          menuItemId: target.id,
          snoozedUntil,
          reason: reasonValue,
        });
        return error;
      }
      if (k === "modifier-option") {
        const { error } = await MenuService.setModifierSnooze(supabase, {
          locationId,
          modifierGroupItemId: target.id,
          snoozedUntil,
          reason: reasonValue,
        });
        return error;
      }
      // modifier-group: fan out via the group RPC, fall back to per-option.
      const res = await MenuService.setModifierGroupSnooze(supabase, {
        locationId,
        modifierGroupId: target.id,
        snoozedUntil,
        reason: reasonValue,
      });
      if (res.error && target.optionIds?.length) {
        const results = await Promise.all(
          target.optionIds.map((id) =>
            MenuService.setModifierSnooze(supabase, {
              locationId,
              modifierGroupItemId: id,
              snoozedUntil,
              reason: reasonValue,
            }),
          ),
        );
        return results.find((r) => r.error)?.error ?? null;
      }
      return res.error;
    },
    [locationId, supabase],
  );

  // Mirror the backend write into the local store so the UI updates instantly.
  const applyStorePatch = useCallback(
    (
      target: SnoozeItem,
      snoozedUntil: string | null,
      reasonValue: string | null,
    ) => {
      const k = target.kind ?? "item";
      const active = snoozedUntil != null;
      if (k === "item") {
        if (active) snoozeItemInStore(target.id, snoozedUntil, reasonValue);
        else unsnoozeItemInStore(target.id);
      } else if (k === "modifier-option") {
        if (active)
          snoozeModifierOptionInStore(target.id, snoozedUntil, reasonValue);
        else unsnoozeModifierOptionInStore(target.id);
      } else {
        if (active)
          snoozeModifierGroupInStore(target.id, snoozedUntil, reasonValue);
        else unsnoozeModifierGroupInStore(target.id);
      }
    },
    [
      snoozeItemInStore,
      unsnoozeItemInStore,
      snoozeModifierOptionInStore,
      unsnoozeModifierOptionInStore,
      snoozeModifierGroupInStore,
      unsnoozeModifierGroupInStore,
    ],
  );

  const applySnooze = useCallback(
    async (option: SnoozeOption) => {
      if (!item || !locationId) {
        setError("Missing item or location information");
        return;
      }
      const snoozedUntil = computeSnoozeUntil(
        option,
        selectedStore?.timezone ?? "UTC",
        selectedStore?.business_day_start_hour ?? 0,
      );

      const reasonValue = reason.trim() || null;
      const target = item;
      const previous = item.snoozedUntil ?? null;

      // Optimistic + close immediately so the 86 shows instantly; persist in
      // the background and roll back to the previous state if the write fails.
      setIsLoading(true);
      setError(null);
      applyStorePatch(target, snoozedUntil, reasonValue);
      handleClose();

      try {
        const rpcError = await writeSnooze(target, snoozedUntil, reasonValue);
        if (rpcError) {
          applyStorePatch(target, previous, null);
          showToast({
            title: "Error",
            type: "error",
            message: rpcError.message || "Failed to mark out of stock",
          });
          return;
        }
        // NOTE: intentionally NOT calling triggerPosSync here. That invalidates
        // the whole pos_sync query and rebuilds the entire menu from scratch,
        // which races the optimistic patch above and clobbers the just-applied
        // 86 (badge flickers / a reopened sheet shows stale state). The
        // optimistic store patch is the source of truth locally; the backend
        // write is already committed and reconciles on the next natural sync.
        // Mirrors the website, which never rebuilds the menu on an 86.
        showToast({
          title: "Marked Out of Stock",
          type: "success",
          message: onlineMenuId
            ? `${target.name} is 86'd · syncing to your online menu`
            : `${target.name} is 86'd`,
        });
      } catch (err: any) {
        applyStorePatch(target, previous, null);
        showToast({
          title: "Error",
          type: "error",
          message: err?.message || "An unexpected error occurred",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      item,
      locationId,
      reason,
      writeSnooze,
      applyStorePatch,
      handleClose,
      showToast,
      onlineMenuId,
    ],
  );

  const handleEnd86 = useCallback(async () => {
    if (!item || !locationId) return;
    const target = item;
    const previous = item.snoozedUntil ?? null;

    // Optimistic restore + close immediately; roll back on failure.
    setIsLoading(true);
    setError(null);
    applyStorePatch(target, null, null);
    handleClose();

    try {
      const rpcError = await writeSnooze(target, null, null);
      if (rpcError) {
        applyStorePatch(target, previous, null);
        showToast({
          title: "Error",
          type: "error",
          message: rpcError.message || "Failed to restore",
        });
        return;
      }
      // See applySnooze: no triggerPosSync — the optimistic patch already
      // reflects the restore; a full menu rebuild would clobber it.
      showToast({
        title: "Back In Stock",
        type: "success",
        message: onlineMenuId
          ? `${target.name} is available again · syncing to your online menu`
          : `${target.name} is available again`,
      });
    } catch (err: any) {
      applyStorePatch(target, previous, null);
      showToast({
        title: "Error",
        type: "error",
        message: err?.message || "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    item,
    locationId,
    writeSnooze,
    applyStorePatch,
    handleClose,
    showToast,
    onlineMenuId,
  ]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      {...bottomSheetTheme}
      backdropComponent={SnoozeBackdrop}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: s(16), paddingBottom: s(32) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: s(14),
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
          >
            <Ban size={s(16)} color={colors.danger} />
            <View>
              <Text
                style={{
                  fontSize: s(15),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Out of Stock (86)
              </Text>
              {item && (
                <Text
                  style={{
                    fontSize: s(12),
                    color: colors.label,
                    marginTop: s(2),
                  }}
                >
                  {item.name}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              padding: s(7),
              backgroundColor: colors.teal + "10",
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.teal + "30",
            }}
          >
            <X size={s(15)} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* Active snooze banner + End 86 */}
        {currentlySnoozed && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: s(8),
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              marginBottom: s(14),
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
            >
              <Clock size={s(14)} color={colors.danger} />
              <Text
                style={{
                  fontSize: s(13),
                  color: colors.danger,
                  fontWeight: "600",
                }}
              >
                {formatSnoozeCountdown(item?.snoozedUntil) === "86"
                  ? "Currently 86 (until restored)"
                  : `Currently 86 · back in ${formatSnoozeCountdown(
                      item?.snoozedUntil,
                    )}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleEnd86}
              disabled={isLoading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(6),
                backgroundColor: colors.success,
                borderRadius: s(8),
                paddingHorizontal: s(12),
                paddingVertical: s(8),
              }}
            >
              <Check size={s(13)} color={colors.onSolid} />
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.onSolid,
                }}
              >
                Make Available
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reason (optional) */}
        <Text
          style={{
            fontSize: s(11),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: s(6),
          }}
        >
          Reason (optional)
        </Text>
        <BottomSheetTextInput
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Ran out of salmon"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.screen,
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: s(12),
            paddingVertical: s(10),
            fontSize: s(13),
            color: colors.heading,
            marginBottom: s(14),
          }}
        />

        {/* Duration choices */}
        <Text
          style={{
            fontSize: s(11),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: s(8),
          }}
        >
          {currentlySnoozed ? "Change duration" : "Mark out of stock"}
        </Text>
        <View style={{ gap: s(8) }}>
          {DURATION_CHOICES.map((choice) => (
            <TouchableOpacity
              key={choice.label}
              onPress={() => applySnooze(choice.option)}
              disabled={isLoading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.screen,
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: s(14),
                paddingVertical: s(12),
              }}
            >
              <Text
                style={{
                  fontSize: s(14),
                  color: colors.heading,
                  fontWeight: "600",
                }}
              >
                {choice.label}
              </Text>
              <Ban size={s(15)} color={colors.danger} />
            </TouchableOpacity>
          ))}

          {/* Custom time */}
          <TouchableOpacity
            onPress={() => {
              setCustomDate(new Date(Date.now() + 60 * 60 * 1000));
              setShowCustomPicker(true);
            }}
            disabled={isLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.screen,
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: s(14),
              paddingVertical: s(12),
            }}
          >
            <Text
              style={{
                fontSize: s(14),
                color: colors.heading,
                fontWeight: "600",
              }}
            >
              Custom time…
            </Text>
            <Clock size={s(15)} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {showCustomPicker && customDate && (
          <View style={{ marginTop: s(12) }}>
            <DateTimePicker
              value={customDate}
              mode="datetime"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={(_e, d) => {
                if (Platform.OS !== "ios") setShowCustomPicker(false);
                if (d) setCustomDate(d);
              }}
            />
            <TouchableOpacity
              onPress={() =>
                customDate && applySnooze({ kind: "custom", date: customDate })
              }
              disabled={isLoading}
              style={{
                backgroundColor: colors.teal,
                borderRadius: s(8),
                paddingVertical: s(11),
                alignItems: "center",
                marginTop: s(8),
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.onSolid,
                }}
              >
                Set 86 until selected time
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Attached modifiers — 86 their options right from this sheet. */}
        <ItemModifierStockSection groups={itemModifierGroups} />

        {error && (
          <View
            style={{
              backgroundColor: colors.danger + "15",
              borderWidth: 1,
              borderColor: colors.danger + "30",
              borderRadius: s(8),
              paddingHorizontal: s(12),
              paddingVertical: s(8),
              marginTop: s(12),
            }}
          >
            <Text style={{ fontSize: s(12), color: colors.danger }}>
              {error}
            </Text>
          </View>
        )}

        {isLoading && (
          <View style={{ marginTop: s(12), alignItems: "center" }}>
            <ActivityIndicator color={colors.teal} size="small" />
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const SnoozeBottomSheet = forwardRef(SnoozeBottomSheetComponent);
SnoozeBottomSheet.displayName = "SnoozeBottomSheet";

export default SnoozeBottomSheet;
