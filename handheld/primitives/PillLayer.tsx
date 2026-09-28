import React from "react";
import { View } from "react-native";
import { tint } from "../lib/tokens";

/**
 * A rounded highlight that fills its parent — the active tab's pill, an icon
 * button's press circle. It keeps its colour and radius from the first
 * render; only its opacity changes (0 = hidden).
 *
 * Why a layer: toggling a rounded View's background between "transparent"
 * and a colour drew it as a square box on Android after the first change. A
 * transparent View with only a radius is layout-only, Fabric flattens it
 * away, and the view recreated when the colour arrives comes back without
 * its radius. A layer that always has a colour is never flattened. The
 * parent sizes it; put it first so the content draws on top.
 */
export function PillLayer({ opacity }: { opacity: number }) {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 rounded-full"
      style={{ backgroundColor: tint.accentSoft, opacity }}
    />
  );
}
