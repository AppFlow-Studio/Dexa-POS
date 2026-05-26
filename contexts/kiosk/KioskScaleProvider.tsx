import React, { createContext, useContext, useMemo } from "react";
import { useWindowDimensions } from "react-native";

export interface KioskScale {
  scale: number;
  vw: number;
  vh: number;
}

const KioskScaleContext = createContext<KioskScale>({
  scale: 1,
  vw: 1080,
  vh: 1920,
});

export function KioskScaleProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const value = useMemo<KioskScale>(
    () => ({
      scale: Math.min(width / 1080, height / 1920),
      vw: width,
      vh: height,
    }),
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
