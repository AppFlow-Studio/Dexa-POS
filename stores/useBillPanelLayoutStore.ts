import { create } from "zustand";

/**
 * Geometry of the left "bill summary" column, published by whichever bill panel
 * is currently on screen (BillSection on order-processing, TableBillSection on
 * the table view) via an onLayout on its root View.
 *
 * `PanelSheet` reads this to anchor its slide-up panel to the bill column
 * (left:0, bottom:0, width, height=snapFraction*height) instead of the native
 * modal's centered/full-screen presentation. Only one bill panel is mounted at
 * a time, so this holds the active screen's column dims. The POS is
 * landscape-locked, so the value is stable between re-measures.
 */
interface BillPanelLayoutState {
  /** Measured width of the bill column in px (0 until first layout). */
  width: number;
  /** Measured height of the bill column in px (0 until first layout). */
  height: number;
  setLayout: (width: number, height: number) => void;
}

export const useBillPanelLayoutStore = create<BillPanelLayoutState>((set) => ({
  width: 0,
  height: 0,
  setLayout: (width, height) =>
    // Guard against redundant sets (onLayout can fire with identical dims on
    // every re-render) so PanelSheet subscribers don't churn.
    set((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    ),
}));
