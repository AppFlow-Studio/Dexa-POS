import { colors } from "@/lib/theme";
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 4, alignItems: "center" }}
    >
      {/* Shared button */}
      <TouchableOpacity
        onPress={() => onSelectSeat(null)}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor:
            activeSeat === null ? colors.teal + "25" : colors.screen,
          borderWidth: 1,
          borderColor: activeSeat === null ? colors.teal : colors.muted + "40",
        }}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: activeSeat === null ? colors.teal : colors.label,
          }}
        >
          Shared
        </Text>
      </TouchableOpacity>

      {/* Seat buttons */}
      {Array.from({ length: seatCount }, (_, i) => i + 1).map((seat) => (
        <TouchableOpacity
          key={seat}
          onPress={() => onSelectSeat(seat)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 16,
            backgroundColor:
              activeSeat === seat ? colors.teal + "25" : colors.screen,
            borderWidth: 1,
            borderColor:
              activeSeat === seat ? colors.teal : colors.muted + "40",
          }}
          activeOpacity={0.7}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: activeSeat === seat ? colors.teal : colors.label,
            }}
          >
            Seat {seat}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Remove seat button */}
      {onRemoveSeat && (
        <TouchableOpacity
          onPress={onRemoveSeat}
          disabled={!canRemoveSeat}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: canRemoveSeat ? colors.muted + "60" : colors.muted + "30",
            backgroundColor: colors.screen,
            opacity: canRemoveSeat ? 1 : 0.3,
          }}
          activeOpacity={0.7}
        >
          <Minus color={colors.label} size={14} />
        </TouchableOpacity>
      )}

      {/* Add seat button */}
      {onAddSeat && (
        <TouchableOpacity
          onPress={onAddSeat}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.teal + "60",
            backgroundColor: colors.teal + "10",
          }}
          activeOpacity={0.7}
        >
          <Plus color={colors.teal} size={14} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

export default SeatSelector;
