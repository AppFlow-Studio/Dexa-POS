import { Shift } from "@/lib/types";
import React, {
  createContext,
  FC,
  ReactNode,
  useContext,
  useState,
} from "react";
import { SharedValue, useSharedValue } from "react-native-reanimated";

interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DropResult = "idle" | "success" | "failure";

// Data stored in React State (Safe for complex objects)
export interface DragItemState {
  shift: Shift;
  wage: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
}

interface DropZoneContextType {
  dropZoneLayouts: SharedValue<Record<string, LayoutRect>>;
  hoveredDropZoneKey: SharedValue<string | null>;
  draggingCellKey: SharedValue<string | null>;
  dropResult: SharedValue<DropResult>;

  // Position tracking (High performance)
  dragTranslation: SharedValue<{ x: number; y: number }>;

  // Content tracking (Safe for objects)
  activeDragItem: DragItemState | null;
  setActiveDragItem: (item: DragItemState | null) => void;
}

const DropZoneContext = createContext<DropZoneContextType | undefined>(
  undefined
);

export const DropZoneProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const dropZoneLayouts = useSharedValue<Record<string, LayoutRect>>({});
  const hoveredDropZoneKey = useSharedValue<string | null>(null);
  const draggingCellKey = useSharedValue<string | null>(null);
  const dropResult = useSharedValue<DropResult>("idle");

  // Position on UI Thread
  const dragTranslation = useSharedValue({ x: 0, y: 0 });

  // Content on JS Thread
  const [activeDragItem, setActiveDragItem] = useState<DragItemState | null>(
    null
  );

  return (
    <DropZoneContext.Provider
      value={{
        dropZoneLayouts,
        hoveredDropZoneKey,
        draggingCellKey,
        dropResult,
        dragTranslation,
        activeDragItem,
        setActiveDragItem,
      }}
    >
      {children}
    </DropZoneContext.Provider>
  );
};

export const useDropZoneContext = () => {
  const context = useContext(DropZoneContext);
  if (context === undefined) {
    throw new Error(
      "useDropZoneContext must be used within a DropZoneProvider"
    );
  }
  return context;
};
