import React, { createContext, useContext, ReactNode, FC } from "react";
import Animated, { SharedValue, useSharedValue } from "react-native-reanimated";

interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DropResult = "idle" | "success" | "failure";

interface DropZoneContextType {
  dropZoneLayouts: SharedValue<Record<string, LayoutRect>>;
  hoveredDropZoneKey: SharedValue<string | null>;
  draggingCellKey: SharedValue<string | null>;
  dropResult: SharedValue<DropResult>;
}

const DropZoneContext = createContext<DropZoneContextType | undefined>(
  undefined
);

export const DropZoneProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const dropZoneLayouts = useSharedValue<Record<string, LayoutRect>>({});
  const hoveredDropZoneKey = useSharedValue<string | null>(null);
  const draggingCellKey = useSharedValue<string | null>(null);
  const dropResult = useSharedValue<DropResult>("idle");

  return (
    <DropZoneContext.Provider
      value={{
        dropZoneLayouts,
        hoveredDropZoneKey,
        draggingCellKey,
        dropResult,
      }}
    >
      {children}
    </DropZoneContext.Provider>
  );
};

export const useDropZoneContext = () => {
  const context = useContext(DropZoneContext);
  if (context === undefined) {
    throw new Error("useDropZoneContext must be used within a DropZoneProvider");
  }
  return context;
};
