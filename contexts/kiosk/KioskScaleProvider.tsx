import React, { createContext, useContext, useMemo } from "react";
import { useWindowDimensions } from "react-native";

export interface KioskScale {
  scale: number;
  vw: number;
  vh: number;
  orientation: "vertical" | "horizontal";
}

const KioskScaleContext = createContext<KioskScale>({
  scale: 1,
  vw: 1080,
  vh: 1920,
  orientation: "vertical",
});

export function KioskScaleProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const value = useMemo<KioskScale>(
    () => {
      const orientation = width >= height ? "horizontal" : "vertical";
      const baseWidth = orientation === "horizontal" ? 1920 : 1080;
      const baseHeight = orientation === "horizontal" ? 1080 : 1920;
      return {
        scale: Math.min(width / baseWidth, height / baseHeight),
        vw: width,
        vh: height,
        orientation,
      };
    },
    [height, width],
  );

  return (
    <KioskScaleContext.Provider value={value}>
      {children}
    </KioskScaleContext.Provider>
  );
}

export function useKioskScale(): KioskScale {
  return useContext(KioskScaleContext);
}
