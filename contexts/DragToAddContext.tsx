import { TABLE_SHAPES } from "@/lib/table-shapes";
import React, { createContext, useContext } from "react";
import { SharedValue, useSharedValue } from "react-native-reanimated";

interface DragToAddContextType {
  draggedShapeId: SharedValue<keyof typeof TABLE_SHAPES | null>;
  dragPosition: SharedValue<{ x: number; y: number }>;
  isDraggingNewObject: SharedValue<boolean>;
  // NEW: A trigger to signal the drop event
  dropPending: SharedValue<boolean>;
}

const DragToAddContext = createContext<DragToAddContextType | undefined>(
  undefined
);

export const DragToAddProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const draggedShapeId = useSharedValue<keyof typeof TABLE_SHAPES | null>(null);
  const dragPosition = useSharedValue<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingNewObject = useSharedValue(false);
  const dropPending = useSharedValue(false);

  return (
    <DragToAddContext.Provider
      value={{
        draggedShapeId,
        dragPosition,
        isDraggingNewObject,
        dropPending,
      }}
    >
      {children}
    </DragToAddContext.Provider>
  );
};

export const useDragToAddContext = () => {
  const context = useContext(DragToAddContext);
  if (context === undefined) {
    throw new Error(
      "useDragToAddContext must be used within a DragToAddProvider"
    );
  }
  return context;
};
