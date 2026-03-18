// components/cfd-builtin/CFDBuiltinDisplay.tsx
// Root component for the built-in secondary display ReactRootView.
// Registered via AppRegistry so Kotlin's SecondaryDisplayPresentation can mount it.
// Shares Zustand stores with the main POS app (same JS runtime).
import "@/global.css";

import { CFDScreenRouter } from "@/components/cfd-client/CFDScreenRouter";
import { CFDBuiltinDisplayProvider } from "@/contexts/CFDDisplayDataContext";
import React from "react";
import { AppRegistry, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

function CFDBuiltinDisplay() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <CFDBuiltinDisplayProvider>
          <View style={styles.root}>
            <CFDScreenRouter />
          </View>
        </CFDBuiltinDisplayProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
});

AppRegistry.registerComponent("CFDSecondaryDisplay", () => CFDBuiltinDisplay);
