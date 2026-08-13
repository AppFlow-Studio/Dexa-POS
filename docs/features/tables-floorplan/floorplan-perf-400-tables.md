# Floor Plan Performance: 400 Tables

## Summary

Optimize the floor plan rendering pipeline for worst-case scenarios: 400+ tables/objects all with active orders, reservations, and merged tables. Currently the architecture is good for ~100 tables but needs hardening for 4× that.

## Scope

- `hooks/useTableTimerTick.ts` — RAF-batched tick instead of synchronous Set copy + fire-all
- `components/tables/cards/useTableCardData.ts` — reduce memoization cost, deduplicate subscription deps
- `components/tables/DraggableTable.tsx` — tighten memo comparator (drop session props that are never used from there)
- `components/tables/TableLayoutView.tsx` — add viewport-windowed rendering (only render tables visible in the current zoom/viewport)

## Non-Scope

- Changing SVG shape components (they're already `React.memo` and lightweight)
- Changing store architecture or selectors
- Changing the edit mode path (`EditableTable`)
- `package.json` or dependency changes

## Plan

### 1. Timer Tick: RAF-batched dispatch

**Problem**: `useTableTimerTick` fires all ~400 listeners synchronously from a single `setInterval` callback. Each listener calls `setTick()` which queues a React sync update. 400 simultaneous `setState` calls from 400 components in one microtask causes a JS-thread stall.

**Fix**: Batch tick dispatching using `requestAnimationFrame` — dispatch listeners in micro-batches of 50 per frame over ~8 frames (instead of all 400 at once). This spreads the React re-render cost across animation frames.

### 2. `useTableCardData`: Deduplicate subscription deps

**Problem**: The `liveSession` derivation calls `useTableSessionStore` twice — once for the session object and once for `isInitialized`. Each is a separate Zustand subscription. At 400 tables that's 800 subscriptions.

**Fix**: Combine into a single selector that returns both values.

### 3. `DraggableTable` memo comparator

**Problem**: The comparator checks `table.session.*` fields (status, party_size, guest_name, etc.) but `ReadonlyTable` ignores `table.session` entirely — it reads from the live session store directly via `useTableCardData`. These checks cause false-positive re-renders when `table.session` changes in the floor plan store even though the actual rendered output doesn't change.

**Fix**: Remove the 10 `table.session.*` field comparisons from the memo comparator. The canvas-level `TableLayoutView.memo` already ignores session data. The per-table comparator only needs geometry + selection + interactionMode.

### 4. Progressive render: viewport windowing

**Problem**: At 400 tables, progressive rendering eventually mounts all 400 objects. Each is an absolute-positioned View with an SVG subtree. Even off-screen (outside the clipped viewport), React still manages all 400 component trees.

**Fix**: After progressive render reaches full count, compute which tables are within the visible viewport (accounting for current zoom/pan). Only render visible tables + a small overscan margin. Unmount off-screen tables entirely. Recompute on pan/zoom end (not during gesture, to avoid thrash).

### 5. Text fit memoization (textFit deps)

**Problem**: `effectiveWidth`/`effectiveHeight` were derived at render time without `useMemo`, so the downstream `textFit` useMemo deps changed every render even when dimensions didn't.

**Fix**: Wrap `effectiveWidth`/`effectiveHeight` in `useMemo` with stable deps.

## Progress

- [x] Timer tick: RAF batching (`hooks/useTableTimerTick.ts`)
- [x] `useTableCardData`: deduplicate subscriptions (`components/tables/cards/useTableCardData.ts`)
- [x] `DraggableTable` memo: remove session field comparisons (`components/tables/DraggableTable.tsx`)
- [x] TableLayoutView: viewport windowing (`components/tables/TableLayoutView.tsx`)
- [x] Text fit: memoize effectiveWidth/effectiveHeight (`components/tables/cards/useTableCardData.ts`)

## Verification

- Open floor plan with 400 tables
- Verify initial render doesn't freeze (progressive)
- Verify pan/zoom is smooth
- Verify order updates only re-render one table
- Verify 60s tick doesn't cause jank

## Files

- `hooks/useTableTimerTick.ts`
- `components/tables/cards/useTableCardData.ts`
- `components/tables/DraggableTable.tsx`
- `components/tables/TableLayoutView.tsx`
