import { WALL_CORNER_SNAP_SHAPE_IDS } from '@/lib/table-shapes'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'

const DEG_TO_RAD = Math.PI / 180
const SNAP_THRESHOLD = 18  // px — corner snap activation distance
const EDGE_HIDE_TOLERANCE = 3 // px — how far an edge midpoint can be outside another wall and still count as "covered"

export type WallEdgeFlags = {
  hideTop: boolean
  hideRight: boolean
  hideBottom: boolean
  hideLeft: boolean
}

type WorldPoint = { x: number; y: number }
type WorldSegment = { start: WorldPoint; end: WorldPoint }

function rotateLocalPoint(
  point: WorldPoint,
  center: WorldPoint,
  rotation: number
): WorldPoint {
  const rad = rotation * DEG_TO_RAD
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos
  }
}

function getStructureSnapPoints(
  shapeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
): WorldPoint[] {
  if (shapeId === 'door-single') {
    const cx = x + width / 2
    const cy = y + height / 2
    const localPoints: WorldPoint[] = [
      { x: width * (6 / 80) - width / 2, y: height * (70 / 80) - height / 2 },
      { x: width * (74 / 80) - width / 2, y: height * (70 / 80) - height / 2 },
    ]
    return localPoints.map(point =>
      rotateLocalPoint(point, { x: cx, y: cy }, rotation)
    )
  }

  return getWallCorners(x, y, width, height, rotation)
}

function getStructureSnapSegment(
  shapeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
): WorldSegment | null {
  const cx = x + width / 2
  const cy = y + height / 2

  if (shapeId === 'door-single') {
    const start = rotateLocalPoint(
      { x: width * (6 / 80) - width / 2, y: height * (70 / 80) - height / 2 },
      { x: cx, y: cy },
      rotation
    )
    const end = rotateLocalPoint(
      {
        x: width * (74 / 80) - width / 2,
        y: height * (70 / 80) - height / 2
      },
      { x: cx, y: cy },
      rotation
    )
    return { start, end }
  }

  if (shapeId === 'door-double') {
    const start = rotateLocalPoint(
      { x: width * (2 / 160) - width / 2, y: height * (70 / 80) - height / 2 },
      { x: cx, y: cy },
      rotation
    )
    const end = rotateLocalPoint(
      {
        x: width * (158 / 160) - width / 2,
        y: height * (70 / 80) - height / 2
      },
      { x: cx, y: cy },
      rotation
    )
    return { start, end }
  }

  if (shapeId === 'wall-section') {
    const start = rotateLocalPoint(
      { x: -width / 2, y: 0 },
      { x: cx, y: cy },
      rotation
    )
    const end = rotateLocalPoint(
      { x: width / 2, y: 0 },
      { x: cx, y: cy },
      rotation
    )
    return { start, end }
  }

  return null
}

function getSegmentMidpoint(segment: WorldSegment): WorldPoint {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2
  }
}

function getClosestPointOnSegment(
  point: WorldPoint,
  segment: WorldSegment
): WorldPoint {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) return segment.start

  const t =
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
    lengthSq
  const clampedT = Math.max(0, Math.min(1, t))

  return {
    x: segment.start.x + dx * clampedT,
    y: segment.start.y + dy * clampedT
  }
}

function getSegmentAngleDegrees(segment: WorldSegment): number {
  return (Math.atan2(
    segment.end.y - segment.start.y,
    segment.end.x - segment.start.x
  ) /
    DEG_TO_RAD +
    360) %
    180
}

function getParallelAngleDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 180
  return Math.min(diff, 180 - diff)
}

/**
 * Returns the 4 world-space corners of a (possibly rotated) wall rectangle.
 * Corner order: [topLeft, topRight, bottomRight, bottomLeft]
 */
export function getWallCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const cx = x + width / 2
  const cy = y + height / 2
  const rad = rotation * DEG_TO_RAD
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfW = width / 2
  const halfH = height / 2

  const local: [number, number][] = [
    [-halfW, -halfH],
    [ halfW, -halfH],
    [ halfW,  halfH],
    [-halfW,  halfH],
  ]

  return local.map(([lx, ly]) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  })) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
}

/**
 * Transform a world point into a wall's local axis-aligned space.
 * Returns the point relative to the wall's center, un-rotated.
 */
function toLocalSpace(
  point: { x: number; y: number },
  wallCx: number,
  wallCy: number,
  rotation: number
): { x: number; y: number } {
  const rad = -rotation * DEG_TO_RAD
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - wallCx
  const dy = point.y - wallCy
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  }
}

/**
 * Returns true if a world-space point lies within (or very close to) the
 * filled rectangle of the given wall.
 */
function pointInsideWall(
  point: { x: number; y: number },
  wall: FloorPlanObject,
  tolerance: number
): boolean {
  const w = wall.width ?? 200
  const h = wall.height ?? 10
  const cx = wall.x + w / 2
  const cy = wall.y + h / 2
  const local = toLocalSpace(point, cx, cy, wall.rotation ?? 0)
  return (
    local.x >= -w / 2 - tolerance &&
    local.x <=  w / 2 + tolerance &&
    local.y >= -h / 2 - tolerance &&
    local.y <=  h / 2 + tolerance
  )
}

/**
 * An edge should be hidden when all 3 sample points along it (start, mid, end)
 * lie inside another wall's filled area. This handles all connection types:
 * - end-to-end (T-junction, L-corner, straight continuation)
 * - side-by-side overlap
 * - one wall on top of another
 */
function edgeCoveredByWall(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  other: FloorPlanObject
): boolean {
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
  return (
    pointInsideWall(p0, other, EDGE_HIDE_TOLERANCE) &&
    pointInsideWall(mid, other, EDGE_HIDE_TOLERANCE) &&
    pointInsideWall(p1, other, EDGE_HIDE_TOLERANCE)
  )
}

/**
 * Computes which edges of the given wall are fully covered by another wall.
 * Those edges have their stroke hidden so connected walls visually merge.
 */
export function getWallEdgeFlags(
  wall: FloorPlanObject,
  allWalls: FloorPlanObject[]
): WallEdgeFlags {
  const w = wall.width ?? 200
  const h = wall.height ?? 10
  const corners = getWallCorners(wall.x, wall.y, w, h, wall.rotation ?? 0)
  // edges: top(0→1), right(1→2), bottom(3→2, reversed so index matches), left(0→3)
  const edges = [
    { key: 'hideTop',    p0: corners[0], p1: corners[1] },
    { key: 'hideRight',  p0: corners[1], p1: corners[2] },
    { key: 'hideBottom', p0: corners[3], p1: corners[2] },
    { key: 'hideLeft',   p0: corners[0], p1: corners[3] },
  ]

  const flags: WallEdgeFlags = {
    hideTop: false,
    hideRight: false,
    hideBottom: false,
    hideLeft: false,
  }

  for (const other of allWalls) {
    if (other.id === wall.id) continue
    for (const edge of edges) {
      if (flags[edge.key as keyof WallEdgeFlags]) continue
      if (edgeCoveredByWall(edge.p0, edge.p1, other)) {
        flags[edge.key as keyof WallEdgeFlags] = true
      }
    }
  }

  return flags
}

/**
 * Given the dragged wall's raw (unsnapped) position and dimensions, check all other
 * wall-section objects. If any corner of the dragged wall is within SNAP_THRESHOLD of
 * any corner of another wall, snap the dragged wall so those corners coincide exactly.
 */
export function findWallCornerSnap(
  rawX: number,
  rawY: number,
  width: number,
  height: number,
  rotation: number,
  shapeId: string,
  selfId: string
): { x: number; y: number } | null {
  const { tables } = useFloorPlanStore.getState()
  const walls = tables.filter(
    t => WALL_CORNER_SNAP_SHAPE_IDS.has(t.shape_id) && t.id !== selfId
  )

  if (walls.length === 0) return null

  const draggedCorners = getStructureSnapPoints(
    shapeId,
    rawX,
    rawY,
    width,
    height,
    rotation
  )
  const draggedSegment = getStructureSnapSegment(
    shapeId,
    rawX,
    rawY,
    width,
    height,
    rotation
  )

  let bestDist = SNAP_THRESHOLD
  let bestSnap: { x: number; y: number } | null = null

  for (const wall of walls) {
    const ww = wall.width ?? 200
    const wh = wall.height ?? 10
    const targetCorners = getStructureSnapPoints(
      wall.shape_id,
      wall.x,
      wall.y,
      ww,
      wh,
      wall.rotation ?? 0
    )
    const targetSegment = getStructureSnapSegment(
      wall.shape_id,
      wall.x,
      wall.y,
      ww,
      wh,
      wall.rotation ?? 0
    )

    if (
      draggedSegment &&
      targetSegment &&
      shapeId.startsWith('door-') &&
      wall.shape_id === 'wall-section'
    ) {
      const draggedAngle = getSegmentAngleDegrees(draggedSegment)
      const targetAngle = getSegmentAngleDegrees(targetSegment)
      const angleDelta = getParallelAngleDelta(draggedAngle, targetAngle)

      if (angleDelta <= 12) {
        const draggedMid = getSegmentMidpoint(draggedSegment)
        const closestPoint = getClosestPointOnSegment(draggedMid, targetSegment)
        const dist = Math.sqrt(
          (draggedMid.x - closestPoint.x) ** 2 +
            (draggedMid.y - closestPoint.y) ** 2
        )

        if (dist < bestDist) {
          bestDist = dist
          bestSnap = {
            x: rawX + (closestPoint.x - draggedMid.x),
            y: rawY + (closestPoint.y - draggedMid.y)
          }
        }
      }
    }

    for (const dc of draggedCorners) {
      for (const tc of targetCorners) {
        const dist = Math.sqrt((dc.x - tc.x) ** 2 + (dc.y - tc.y) ** 2)
        if (dist < bestDist) {
          bestDist = dist
          bestSnap = {
            x: rawX + (tc.x - dc.x),
            y: rawY + (tc.y - dc.y),
          }
        }
      }
    }
  }

  return bestSnap
}
