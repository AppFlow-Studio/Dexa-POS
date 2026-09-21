import { POS_SCREEN_OPTIONS } from "@/lib/screenConfig";
import { colors, spinnerColor } from "@/lib/theme";
import { Stack } from "expo-router";
import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

// Lazy on purpose: Metro evaluates a dynamically imported module the first
// time it is requested, so nothing under handheld/ runs during a tablet,
// KDS, CFD or kiosk cold start. This layout and the three route files are
// the only handheld code the shared bundle touches.
const HandheldFrame = React.lazy(() => import("@/handheld/HandheldFrame"));

function Loading() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.screen }}>
      <ActivityIndicator size="large" color={spinnerColor} />
    </View>
  );
}

/**
 * The handheld's own native Stack: index (tabs) plus pushed table / order
 * pages. POS_SCREEN_OPTIONS keeps `animation: 'none'` — the documented
 * react-native-screens leak (lib/screenConfig.ts) applies here too — so
 * pages swap instantly, which also keeps tap-to-visual under 100 ms.
 */
export default function HandheldLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <HandheldFrame>
        <Stack
          screenOptions={{
            ...POS_SCREEN_OPTIONS,
            contentStyle: { backgroundColor: colors.screen },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="table/[id]" />
          <Stack.Screen name="order/[id]" />
        </Stack>
      </HandheldFrame>
    </Suspense>
  );
}
