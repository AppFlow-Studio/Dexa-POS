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

/**
 * Error boundary for the built-in secondary display.
 *
 * This React root has NO Sentry wrapper and is separate from the main app's
 * error boundaries. Without this, any uncaught render error propagates to the
 * native layer as a fatal JavascriptException, causing Android to show a brief
 * system crash dialog on the Presentation window.
 *
 * Shows a plain dark screen (invisible to customers) and auto-recovers after 5s.
 */
class CFDBuiltinErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[CFDBuiltinErrorBoundary]", error, info.componentStack);
    this.recoveryTimer = setTimeout(() => {
      this.setState({ hasError: false });
    }, 5000);
  }

  componentWillUnmount() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }

  render() {
    if (this.state.hasError) {
      return <View style={styles.root} />;
    }
    return this.props.children;
  }
}

function CFDBuiltinDisplay() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <CFDBuiltinErrorBoundary>
        <SafeAreaProvider>
          <CFDBuiltinDisplayProvider>
            <View style={styles.root}>
              <CFDScreenRouter />
            </View>
          </CFDBuiltinDisplayProvider>
        </SafeAreaProvider>
      </CFDBuiltinErrorBoundary>
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
