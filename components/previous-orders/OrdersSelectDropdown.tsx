import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import * as PopoverPrimitive from "@rn-primitives/popover";
import { Check, ChevronDown } from "lucide-react-native";
import React, { useCallback, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface SelectOption<T extends string> {
  key: T;
  label: string;
}

interface OrdersSelectDropdownProps<T extends string> {
  /** Prefix rendered before the current value, e.g. "Status:". */
  prefix: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Highlight the trigger when a non-default value is selected. */
  isActive?: boolean;
}

/**
 * Single-select dropdown used for the Status and Sort controls in the Previous
 * Orders control bar. Replaces the sort/status pills that used to live in the
 * horizontally-scrolling filter strip.
 */
export default function OrdersSelectDropdown<T extends string>({
  prefix,
  options,
  value,
  onChange,
  isActive = false,
}: OrdersSelectDropdownProps<T>) {
  const uiScale = useUiScale();
  const s = useCallback((n: number) => Math.round(n * uiScale), [uiScale]);
  const triggerRef = useRef<PopoverPrimitive.TriggerRef>(null);

  const current = useMemo(
    () => options.find((o) => o.key === value) ?? options[0],
    [options, value],
  );

  const handleSelect = useCallback(
    (key: T) => {
      onChange(key);
      triggerRef.current?.close();
    },
    [onChange],
  );

  return (
    <Popover>
      <PopoverTrigger
        ref={triggerRef}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(6),
          height: s(44),
          paddingHorizontal: s(12),
          borderRadius: s(8),
          borderWidth: 1,
          borderColor: isActive ? colors.teal + "80" : colors.border,
          backgroundColor: isActive ? colors.teal + "14" : colors.card,
        }}
      >
        <Text style={{ fontSize: s(13), color: colors.label }}>{prefix}</Text>
        <Text
          style={{
            fontSize: s(13),
            fontWeight: "700",
            color: isActive ? colors.teal : colors.heading,
          }}
        >
          {current?.label}
        </Text>
        <ChevronDown size={s(14)} color={colors.label} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="p-1 border rounded-xl"
        style={{
          width: s(210),
          backgroundColor: colors.card,
          borderColor: colors.border,
        }}
      >
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => handleSelect(option.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: s(44),
                paddingHorizontal: s(10),
                borderRadius: s(8),
                backgroundColor: selected ? colors.teal + "14" : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: selected ? "700" : "500",
                  color: selected ? colors.teal : colors.heading,
                }}
              >
                {option.label}
              </Text>
              {selected && <Check size={s(15)} color={colors.teal} />}
            </Pressable>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Shared "N filter · Clear" pill so active non-default filters stay visible. */
export function ActiveFilterPill({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onClear}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(6),
        height: s(44),
        paddingHorizontal: s(12),
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.teal + "80",
        backgroundColor: colors.teal + "14",
      }}
    >
      <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.teal }}>
        {count} filter{count > 1 ? "s" : ""}
      </Text>
      <View
        style={{ width: 1, height: s(14), backgroundColor: colors.teal + "50" }}
      />
      <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.teal }}>
        Clear
      </Text>
    </Pressable>
  );
}
