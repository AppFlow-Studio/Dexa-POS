import BarSection from "@/components/tables/svg/BarSection";
import Booth2Person from "@/components/tables/svg/Booth2Person";
import Booth4Person from "@/components/tables/svg/Booth4Person";
import CashierStand from "@/components/tables/svg/CashierStand";
import DecorativePlant from "@/components/tables/svg/DecorativePlant";
import HostStand from "@/components/tables/svg/HostStand";
import KitchenPass from "@/components/tables/svg/KitchenPass";
import Pillar from "@/components/tables/svg/Pillar";
import ServerStation from "@/components/tables/svg/ServerStation";
import TableCircle2Chair from "@/components/tables/svg/TableCircle2Chair";
import TableCircle4Chair from "@/components/tables/svg/TableCircle4Chair";
import TableCircle6Chair from "@/components/tables/svg/TableCircle6Chair";
import TableHighTop from "@/components/tables/svg/TableHighTop";
import TableRectangle4Chair from "@/components/tables/svg/TableRectangle4Chair";
import TableRectangle6Chair from "@/components/tables/svg/TableRectangle6Chair";
import TableSquare2Chair from "@/components/tables/svg/TableSquare2Chair";
import TableSquare4Chair from "@/components/tables/svg/TableSquare4Chair";
import TableSquare8Chair from "@/components/tables/svg/TableSquare8Chair";
import WallSection from "@/components/tables/svg/WallSection";

// This object is now the single source of truth for your available table shapes
export const TABLE_SHAPES = {
  // --- Standard Tables ---
  "square-2": {
    label: "2-Seater Square",
    component: TableSquare2Chair,
    capacity: 2,
    width: 79,
    height: 97,
    type: "table" as const,
  },
  "square-4": {
    label: "4-Seater Square",
    component: TableSquare4Chair,
    capacity: 4,
    width: 97,
    height: 97,
    type: "table" as const,
  },
  "rectangle-4": {
    label: "4-Seater Rectangle",
    component: TableRectangle4Chair,
    capacity: 4,
    width: 140,
    height: 90,
    type: "table" as const,
  },
  "rectangle-6": {
    label: "6-Seater Rectangle",
    component: TableRectangle6Chair,
    capacity: 6,
    width: 180,
    height: 90,
    type: "table" as const,
  },
  "square-8": {
    label: "8-Seater Long",
    component: TableSquare8Chair,
    capacity: 8,
    width: 208,
    height: 97,
    type: "table" as const,
  },
  "circle-2": {
    label: "2-Seater Circle",
    component: TableCircle2Chair,
    capacity: 2,
    width: 80,
    height: 80,
    type: "table" as const,
  },
  "circle-4": {
    label: "4-Seater Circle",
    component: TableCircle4Chair,
    capacity: 4,
    width: 90,
    height: 90,
    type: "table" as const,
  },
  "circle-6": {
    label: "6-Seater Circle",
    component: TableCircle6Chair,
    capacity: 6,
    width: 120,
    height: 120,
    type: "table" as const,
  },
  "high-top-2": {
    label: "2-Seater High-Top",
    component: TableHighTop,
    capacity: 2,
    width: 60,
    height: 60,
    type: "table" as const,
  },

  // --- Booths ---
  "booth-2": {
    label: "2-Person Booth",
    component: Booth2Person,
    capacity: 2,
    width: 70,
    height: 90,
    type: "table" as const,
  },
  "booth-4": {
    label: "4-Person Booth",
    component: Booth4Person,
    capacity: 4,
    width: 120,
    height: 90,
    type: "table" as const,
  },

  // --- Functional Objects ---
  "bar-section": {
    label: "Bar Section",
    component: BarSection,
    capacity: 0,
    width: 170,
    height: 100,
    type: "static-object" as const,
  },
  "cashier-stand": {
    label: "Cashier Stand",
    component: CashierStand,
    capacity: 0,
    width: 100,
    height: 100,
    type: "static-object" as const,
  },
  "host-stand": {
    label: "Host Stand",
    component: HostStand,
    capacity: 0,
    width: 40,
    height: 35,
    type: "static-object" as const,
  },
  "server-station": {
    label: "Server Station",
    component: ServerStation,
    capacity: 0,
    width: 60,
    height: 40,
    type: "static-object" as const,
  },
  "kitchen-pass": {
    label: "Kitchen Pass",
    component: KitchenPass,
    capacity: 0,
    width: 180,
    height: 25,
    type: "static-object" as const,
  },

  // --- Architectural & Decorative ---
  "wall-section": {
    label: "Wall Section",
    component: WallSection,
    capacity: 0,
    width: 200,
    height: 10,
    type: "static-object" as const,
  },
  pillar: {
    label: "Pillar",
    component: Pillar,
    capacity: 0,
    width: 40,
    height: 40,
    type: "static-object" as const,
  },
  plant: {
    label: "Decorative Plant",
    component: DecorativePlant,
    capacity: 0,
    width: 50,
    height: 50,
    type: "static-object" as const,
  },
};

// We can also create an array for easy mapping in the UI
export const SHAPE_OPTIONS = Object.entries(TABLE_SHAPES).map(([id, data]) => ({
  id,
  ...data,
}));
