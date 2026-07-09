import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { GitMerge, Plus, Unlink } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MergeActionBarProps {
  selectedCount: number;
  canMergeAndSeat: boolean;
  canAddToSession: boolean;
  canUnmerge: boolean;
  onMerge: () => void;
  onAdd: () => void;
  onUnmerge: () => void;
  onCancel: () => void;
}

const MergeActionBar: React.FC<MergeActionBarProps> = ({
  selectedCount,
  canMergeAndSeat,
  canAddToSession,
  canUnmerge,
  onMerge,
  onAdd,
  onUnmerge,
  onCancel,
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const hasAction = canMergeAndSeat || canAddToSession || canUnmerge;
  const hint = selectedCount === 0
    ? "Tap tables to select them"
    : !hasAction
      ? "Select compatible tables to merge"
      : null;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(12),
      paddingVertical: s(8),
      backgroundColor: colors.warning + '0F',
      borderBottomWidth: 1,
      borderBottomColor: colors.warning + '30',
      gap: s(10),
    }}>
      {/* Left: indicator dot + hint/count */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(7), flex: 1 }}>
        <View style={{
          width: s(6), height: s(6), borderRadius: s(3),
          backgroundColor: colors.warning,
          shadowColor: colors.warning,
          shadowRadius: s(4),
          shadowOpacity: 0.8,
          shadowOffset: { width: 0, height: 0 },
        }} />
        {hint ? (
          <Text style={{ fontSize: s(12), color: colors.warning + 'CC', fontWeight: '500' }}>{hint}</Text>
        ) : (
          <Text style={{ fontSize: s(12), color: colors.warning, fontWeight: '700' }}>
            {selectedCount} table{selectedCount !== 1 ? "s" : ""} selected
          </Text>
        )}
      </View>

      {/* Right: action buttons */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        {canMergeAndSeat && (
          <TouchableOpacity
            onPress={onMerge}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: s(5),
              paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8),
              backgroundColor: colors.teal + '18',
              borderWidth: 1, borderColor: colors.teal + '50',
            }}
          >
            <GitMerge size={s(12)} color={colors.teal} />
            <Text style={{ fontSize: s(12), fontWeight: '700', color: colors.teal }}>Merge & Seat</Text>
          </TouchableOpacity>
        )}

        {canAddToSession && (
          <TouchableOpacity
            onPress={onAdd}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: s(5),
              paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8),
              backgroundColor: colors.info + '18',
              borderWidth: 1, borderColor: colors.info + '50',
            }}
          >
            <Plus size={s(12)} color={colors.info} />
            <Text style={{ fontSize: s(12), fontWeight: '700', color: colors.info }}>Add to Session</Text>
          </TouchableOpacity>
        )}

        {canUnmerge && (
          <TouchableOpacity
            onPress={onUnmerge}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: s(5),
              paddingHorizontal: s(12), paddingVertical: s(6), borderRadius: s(8),
              backgroundColor: colors.danger + '18',
              borderWidth: 1, borderColor: colors.danger + '50',
            }}
          >
            <Unlink size={s(12)} color={colors.danger} />
            <Text style={{ fontSize: s(12), fontWeight: '700', color: colors.danger }}>Unmerge</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.7}
          style={{
            paddingHorizontal: s(10), paddingVertical: s(6), borderRadius: s(8),
            backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.muted }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(MergeActionBar);