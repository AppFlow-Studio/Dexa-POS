// components/cfd-client/CFDErrorBoundary.tsx
// Error boundary for the CFD client subtree. Catches synchronous throws from
// `useCFDWSClient`, the CFD provider, and any CFD screen — and offers a
// "Reset CFD Pairing" recovery path so the tablet never gets stuck on a
// white screen that requires an app reset.

import { colors } from "@/lib/theme";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { router } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CFDErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[CFDErrorBoundary] Caught error:", error, info);
  }

  handleReset = () => {
    try {
      useCFDClientStore.getState().clearPairing();
    } catch (e) {
      console.error("[CFDErrorBoundary] clearPairing failed:", e);
    }
    this.setState({ hasError: false, error: null }, () => {
      try {
        router.replace("/(cfd)/cfd-pairing");
      } catch (e) {
        console.error("[CFDErrorBoundary] navigation failed:", e);
      }
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error?.message ?? "Something went wrong in the CFD display.";

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          gap: 16,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            backgroundColor: colors.danger + "15",
            borderWidth: 1,
            borderColor: colors.danger + "30",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AlertTriangle size={32} color={colors.danger} />
        </View>

        <View style={{ alignItems: "center", gap: 6, maxWidth: 360 }}>
          <Text
            style={{ fontSize: 18, fontWeight: "700", color: colors.heading }}
          >
            CFD Display Error
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.label,
              textAlign: "center",
            }}
          >
            {message}
          </Text>
        </View>

        <Pressable
          onPress={this.handleReset}
          style={{
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
            Reset CFD Pairing
          </Text>
        </Pressable>
      </View>
    );
  }
}
