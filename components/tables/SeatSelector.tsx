import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface SeatSelectorProps {
  seatCount: number;
  activeSeat: number | null;
  onSelectSeat: (seat: number | null) => void;
  onAddSeat?: () => void;
  onRemoveSeat?: () => void;
  canRemoveSeat?: boolean;
}

const SeatSelector: React.FC<SeatSelectorProps> = ({
  seatCount,
  activeSeat,
  onSelectSeat,
  onAddSeat,
  onRemoveSeat,
  canRemoveSeat = true,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: s(6),
        paddingHorizontal: s(4),
        alignItems: "center",
      }}
    >
      {/* Read-only pill showing seat count */}
      <View
        style={{
          paddingHorizontal: s(14),
          paddingVertical: s(6),
          borderRadius: s(16),
          backgroundColor: colors.teal + "15",
          borderWidth: 1,
          borderColor: colors.teal + "40",
        }}
      >
        <Text
          style={{
            fontSize: s(12),
            fontWeight: "600",
            color: colors.teal,
          }}
        >
          {seatCount === 1 ? "1 Seat" : `${seatCount} Seats`}
        </Text>
      </View>

      {/* Remove seat button */}
      {onRemoveSeat && (
        <TouchableOpacity
          onPress={onRemoveSeat}
          disabled={!canRemoveSeat}
          style={{
            width: s(28),
            height: s(28),
            borderRadius: s(14),
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: canRemoveSeat
              ? colors.muted + "60"
              : colors.muted + "30",
            backgroundColor: colors.screen,
            opacity: canRemoveSeat ? 1 : 0.3,
          }}
          activeOpacity={0.7}
        >
          <Minus color={colors.label} size={s(14)} />
        </TouchableOpacity>
      )}

      {/* Add seat button */}
      {onAddSeat && (
        <TouchableOpacity
          onPress={onAddSeat}
          style={{
            width: s(28),
            height: s(28),
            borderRadius: s(14),
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.teal + "60",
            backgroundColor: colors.teal + "10",
          }}
          activeOpacity={0.7}
        >
          <Plus color={colors.teal} size={s(14)} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

export default SeatSelector;
