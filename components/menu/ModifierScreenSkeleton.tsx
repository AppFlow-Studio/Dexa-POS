import { colors } from "@/lib/theme";
import React from "react";
import { View } from "react-native";

const ModifierScreenSkeleton: React.FC = () => {
  const skeletonBg = colors.card;
  const divider = { height: 1, backgroundColor: colors.border };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f1623" }}>
      {/* Top bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ width: 60, height: 16, backgroundColor: skeletonBg, borderRadius: 6 }} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ width: 28, height: 28, backgroundColor: skeletonBg, borderRadius: 8 }} />
          <View style={{ width: 110, height: 28, backgroundColor: colors.teal + "40", borderRadius: 20 }} />
        </View>
      </View>

      {/* Item header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ gap: 6 }}>
          <View style={{ width: 140, height: 14, backgroundColor: skeletonBg, borderRadius: 6 }} />
          <View style={{ width: 90, height: 11, backgroundColor: skeletonBg, borderRadius: 4 }} />
        </View>
        <View style={{ width: 48, height: 14, backgroundColor: skeletonBg, borderRadius: 6 }} />
      </View>

      {/* Category pill tabs */}
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {[80, 100, 70, 90].map((w, i) => (
          <View key={i} style={{ width: w, height: 28, backgroundColor: i === 0 ? colors.teal + "40" : skeletonBg, borderRadius: 20 }} />
        ))}
      </View>

      {/* Category name + rule */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <View style={{ width: 100, height: 13, backgroundColor: skeletonBg, borderRadius: 6 }} />
          <View style={{ width: 60, height: 11, backgroundColor: skeletonBg, borderRadius: 4 }} />
        </View>
        {/* Options grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[1,2,3,4,5,6].map((i) => (
            <View key={i} style={{ width: "23%", height: 52, backgroundColor: skeletonBg, borderRadius: 10 }} />
          ))}
        </View>
      </View>

      <View style={divider} />

      {/* Quantity row */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ width: 60, height: 12, backgroundColor: skeletonBg, borderRadius: 4 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 32, height: 32, backgroundColor: skeletonBg, borderRadius: 16 }} />
          <View style={{ width: 32, height: 20, backgroundColor: skeletonBg, borderRadius: 6 }} />
          <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "40", borderRadius: 16 }} />
        </View>
      </View>

      <View style={divider} />

      {/* Notes */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ width: 120, height: 12, backgroundColor: skeletonBg, borderRadius: 4 }} />
          <View style={{ width: 30, height: 10, backgroundColor: skeletonBg, borderRadius: 4 }} />
        </View>
        <View style={{ height: 52, backgroundColor: skeletonBg, borderRadius: 10 }} />
      </View>
    </View>
  );
};

export default React.memo(ModifierScreenSkeleton);
