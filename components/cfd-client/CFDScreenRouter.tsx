// components/cfd-client/CFDScreenRouter.tsx
// Shared screen-state router used by both external CFD tablets and built-in secondary displays.
import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React from "react";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { IdleScreen } from "./IdleScreen";
import { OrderingScreen } from "./OrderingScreen";
import { PaymentScreen } from "./PaymentScreen";
import { ResultScreen } from "./ResultScreen";
import { TipSelectionScreen } from "./TipSelectionScreen";

interface Props {
  onTipSelected?: (tipAmount: number, tipPercentage: number | null) => void;
}

export function CFDScreenRouter({ onTipSelected }: Props) {
  const { screenState, items } = useCFDDisplayData();

  // Resolve actual screen for animation key
  const resolvedState = (() => {
    switch (screenState) {
      case "idle":
      case "ordering":
      case "tip_selection":
      case "payment":
      case "processing":
      case "approved":
      case "declined":
        return screenState;
      default:
        return items.length > 0 ? "ordering" : "idle";
    }
  })();

  const renderScreen = () => {
    switch (resolvedState) {
      case "idle":
        return <IdleScreen />;
      case "ordering":
        return <OrderingScreen />;
      case "tip_selection":
        return (
          <TipSelectionScreen onTipSelected={onTipSelected ?? (() => {})} />
        );
      case "payment":
        return <PaymentScreen />;
      case "processing":
        return <PaymentScreen processing />;
      case "approved":
        return <ResultScreen success />;
      case "declined":
        return <ResultScreen success={false} />;
      default:
        return <IdleScreen />;
    }
  };

  return (
    <Animated.View
      key={resolvedState}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={{ flex: 1 }}
    >
      {renderScreen()}
    </Animated.View>
  );
}
