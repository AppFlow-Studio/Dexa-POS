import { TABLE_SHAPES } from "@/lib/table-shapes";
import React from "react";
import EditableTable from "./cards/EditableTable";
import ReadonlyStructure from "./cards/ReadonlyStructure";
import ReadonlyTable from "./cards/ReadonlyTable";
import { DraggableTableProps } from "./cards/types";

/**
 * Thin dispatcher that picks one of three fully-separated render paths for a
 * floor-plan object. Each path lives in its own file under ./cards:
 *
 *  - EditableTable      — edit mode only. Owns drag / rotate / wall-resize shared
 *                         values + gestures. Heavy Reanimated footprint, paid
 *                         only on the floor-plan editor screen.
 *  - ReadonlyStructure  — view-mode walls / doors / pillars / plants / zones /
 *                         labels. ZERO store subscriptions, timers, or effects —
 *                         these objects carry no live data, so nothing in a
 *                         long-lived store can retain their native view tree.
 *  - ReadonlyTable      — view-mode real tables. Holds the live session / order /
 *                         reservation subscriptions a table genuinely needs.
 *
 * The branch is constant for a given mount: the editor always passes
 * isEditMode=true; the view canvas always passes false and an object's
 * category never changes at runtime. So the conditional choice of which set of
 * hooks runs is stable and React-safe.
 */
const DraggableTableInner: React.FC<DraggableTableProps> = (props) => {
  const { table, isEditMode } = props;
  const isTableType = table.category === "table" || table.category === "booth";
  const isWall = table.shape_id === "wall-section";
  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES["square-4"];

  if (isEditMode) {
    return (
      <EditableTable
        {...props}
        isTableType={isTableType}
        isWall={isWall}
        shapeDef={shapeDef}
      />
    );
  }

  // Non-table objects (walls, doors, pillars, plants, zones, labels) carry no
  // live data. Route them to a zero-subscription renderer so they never open
  // store/timer listeners — those listener edges are what pinned the structure
  // SVG view trees in memory after navigating away. See ReadonlyStructure.
  if (!isTableType) {
    return (
      <ReadonlyStructure
        table={table}
        isSelected={props.isSelected}
        onSelect={props.onSelect}
        wallEdgeFlags={props.wallEdgeFlags}
      />
    );
  }

  return (
    <ReadonlyTable
      {...props}
      isTableType={isTableType}
      isWall={isWall}
      shapeDef={shapeDef}
    />
  );
};

export default React.memo(DraggableTableInner, (prev, next) => {
  // Re-render if dimensions change
  if (
    prev.table.width !== next.table.width ||
    prev.table.height !== next.table.height
  ) {
    return false;
  }
  // Re-render if position/rotation changes (for dragging)
  if (
    prev.table.x !== next.table.x ||
    prev.table.y !== next.table.y ||
    prev.table.rotation !== next.table.rotation
  ) {
    return false;
  }
  // Re-render if selected state changes
  if (prev.isSelected !== next.isSelected) {
    return false;
  }
  if (prev.interactionMode !== next.interactionMode) {
    return false;
  }
  if (prev.isEditMode !== next.isEditMode) {
    return false;
  }
  if (prev.disableEntryAnimation !== next.disableEntryAnimation) {
    return false;
  }
  if (
    prev.wallEdgeFlags?.hideTop !== next.wallEdgeFlags?.hideTop ||
    prev.wallEdgeFlags?.hideRight !== next.wallEdgeFlags?.hideRight ||
    prev.wallEdgeFlags?.hideBottom !== next.wallEdgeFlags?.hideBottom ||
    prev.wallEdgeFlags?.hideLeft !== next.wallEdgeFlags?.hideLeft
  ) {
    return false;
  }
  // NOTE: table.session fields deliberately NOT compared here.
  // ReadonlyTable reads live session data from useTableSessionStore directly
  // via useTableCardData, not from the table.session prop. The canvas-level
  // TableLayoutView.memo already ignores session fields. Adding session checks
  // here would cause false-positive re-renders when the floor plan store's
  // table.session prop changes but the actual rendered output is driven by
  // granular per-table selectors that may not have changed.
  // Otherwise skip re-render
  return true;
});
