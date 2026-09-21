import { colors, spinnerColor } from "@/lib/theme";
import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

// Lazy on purpose: Metro evaluates a dynamically imported module the first
// time it is requested, so the handheld tree (screens, primitives, FlashList
// rows) never runs during a tablet, KDS, CFD or kiosk cold start. The route
// file itself is the only handheld code the tablet bundle touches.
const HandheldRoot = React.lazy(() => import("@/handheld/HandheldRoot"));

function Loading() {
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: colors.screen }}
    >
      <ActivityIndicator size="large" color={spinnerColor} />
    </View>
  );
}

/** Post-login route for `station_type === "handheld"` (lib/authFlow.ts). */
export default function HandheldRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <HandheldRoot />
    </Suspense>
  );
}
