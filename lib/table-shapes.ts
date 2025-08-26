import TableSquare2Chair from "@/components/tables/svg/TableSquare2Chair";
import TableSquare4Chair from "@/components/tables/svg/TableSquare4Chair";
import TableSquare8Chair from "@/components/tables/svg/TableSquare8Chair";

// This object is now the single source of truth for your available table shapes
export const TABLE_SHAPES = {
  "square-2": {
    label: "2-Seater Square",
    component: TableSquare2Chair,
    capacity: 2,
  },
  "square-4": {
    label: "4-Seater Square",
    component: TableSquare4Chair,
    capacity: 4,
  },
  "square-8": {
    label: "8-Seater Long",
    component: TableSquare8Chair,
    capacity: 8,
  },
  // ... add more shapes here in the future
};

// We can also create an array for easy mapping in the UI
export const SHAPE_OPTIONS = Object.entries(TABLE_SHAPES).map(([id, data]) => ({
  id,
  ...data,
}));
