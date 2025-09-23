import React, {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";
import { PieSliceData } from "./Pie-Slice";

interface PieSliceContext {
  slice: PieSliceData;
}

const PieSliceContext = createContext<PieSliceContext | undefined>(undefined);

interface PieSliceProviderProps {
  slice: PieSliceData;
}

export const PieSliceProvider = ({
  children,
  slice: _slice,
}: PropsWithChildren<PieSliceProviderProps>) => {
  return (
    <PieSliceContext.Provider value={{ slice: _slice }}>
      {children}
    </PieSliceContext.Provider>
  );
};

export const usePieSliceContext = () => {
  const context = useContext(PieSliceContext);

  if (context === undefined) {
    throw new Error(
      "usePieSliceContext must be used within a PieSliceProvider"
    );
  }

  return context;
};