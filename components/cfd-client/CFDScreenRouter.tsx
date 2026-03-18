// components/cfd-client/CFDScreenRouter.tsx
// Shared screen-state router used by both external CFD tablets and built-in secondary displays.
import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React from "react";

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

  switch (screenState) {
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
      // Fallback: show ordering if there are items, otherwise idle
      return items.length > 0 ? <OrderingScreen /> : <IdleScreen />;
  }
}
