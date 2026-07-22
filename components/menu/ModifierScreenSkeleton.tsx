import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { View } from "react-native";

const ModifierScreenSkeleton: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const skeletonBg = colors.card;
  const divider = { height: 1, backgroundColor: colors.border };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f1623" }}>
      {/* Top bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(16), paddingVertical: s(10), borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ width: s(60), height: s(16), backgroundColor: skeletonBg, borderRadius: s(6) }} />
        <View style={{ flexDirection: "row", gap: s(8) }}>
          <View style={{ width: s(28), height: s(28), backgroundColor: skeletonBg, borderRadius: s(8) }} />
          <View style={{ width: s(110), height: s(28), backgroundColor: colors.teal + "40", borderRadius: s(20) }} />
        </View>
      </View>

      {/* Item header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(16), paddingVertical: s(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ gap: s(6) }}>
          <View style={{ width: s(140), height: s(14), backgroundColor: skeletonBg, borderRadius: s(6) }} />
          <View style={{ width: s(90), height: s(11), backgroundColor: skeletonBg, borderRadius: s(4) }} />
        </View>
        <View style={{ width: s(48), height: s(14), backgroundColor: skeletonBg, borderRadius: s(6) }} />
      </View>

      {/* Category pill tabs */}
      <View style={{ flexDirection: "row", gap: s(6), paddingHorizontal: s(16), paddingVertical: s(10), borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {[80, 100, 70, 90].map((w, i) => (
          <View key={i} style={{ width: s(w), height: s(28), backgroundColor: i === 0 ? colors.teal + "40" : skeletonBg, borderRadius: s(20) }} />
        ))}
      </View>

      {/* Category name + rule */}
      <View style={{ paddingHorizontal: s(16), paddingTop: s(12), paddingBottom: s(8) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: s(10) }}>
          <View style={{ width: s(100), height: s(13), backgroundColor: skeletonBg, borderRadius: s(6) }} />
          <View style={{ width: s(60), height: s(11), backgroundColor: skeletonBg, borderRadius: s(4) }} />
        </View>
        {/* Options grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
          {[1,2,3,4,5,6].map((i) => (
            <View key={i} style={{ width: "23%", height: s(52), backgroundColor: skeletonBg, borderRadius: s(10) }} />
          ))}
        </View>
      </View>

      <View style={divider} />

      {/* Quantity row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: s(16), paddingVertical: s(12) }}>
        <View style={{ width: s(60), height: s(12), backgroundColor: skeletonBg, borderRadius: s(4) }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}>
          <View style={{ width: s(32), height: s(32), backgroundColor: skeletonBg, borderRadius: s(16) }} />
          <View style={{ width: s(32), height: s(20), backgroundColor: skeletonBg, borderRadius: s(6) }} />
          <View style={{ width: s(32), height: s(32), backgroundColor: colors.teal + "40", borderRadius: s(16) }} />
        </View>
      </View>

      <View style={divider} />

      {/* Notes */}
      <View style={{ paddingHorizontal: s(16), paddingVertical: s(12) }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: s(8) }}>
          <View style={{ width: s(120), height: s(12), backgroundColor: skeletonBg, borderRadius: s(4) }} />
          <View style={{ width: s(30), height: s(10), backgroundColor: skeletonBg, borderRadius: s(4) }} />
        </View>
        <View style={{ height: s(52), backgroundColor: skeletonBg, borderRadius: s(10) }} />
      </View>
    </View>
  );
};

export default React.memo(ModifierScreenSkeleton);
