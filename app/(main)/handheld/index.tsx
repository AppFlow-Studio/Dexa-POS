import { colors, spinnerColor } from "@/lib/theme";
import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const HandheldRoot = React.lazy(() => import("@/handheld/HandheldRoot"));

function Loading() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.screen }}>
      <ActivityIndicator size="large" color={spinnerColor} />
    </View>
  );
}

/** Post-login route for `station_type === "handheld"` (lib/authFlow.ts): the tabs. */
export default function HandheldIndexRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <HandheldRoot />
    </Suspense>
  );
}
