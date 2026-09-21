import React, { Suspense } from "react";
import { View } from "react-native";

const PickTablePage = React.lazy(() => import("@/handheld/pages/PickTablePage"));

/** /handheld/tables/pick — free tables to seat for a new dine-in order (artifact S2 → screen 2). */
export default function HandheldPickTableRoute() {
  return (
    <Suspense fallback={<View className="flex-1" />}>
      <PickTablePage />
    </Suspense>
  );
}
