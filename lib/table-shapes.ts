import BarSection from '@/components/tables/svg/BarSection'
import Booth2Person from '@/components/tables/svg/Booth2Person'
import Booth4Person from '@/components/tables/svg/Booth4Person'
import CashierStand from '@/components/tables/svg/CashierStand'
import DecorativePlant from '@/components/tables/svg/DecorativePlant'
import HostStand from '@/components/tables/svg/HostStand'
import KitchenPass from '@/components/tables/svg/KitchenPass'
import Pillar from '@/components/tables/svg/Pillar'
import ServerStation from '@/components/tables/svg/ServerStation'
import TableCircle2Chair from '@/components/tables/svg/TableCircle2Chair'
import TableCircle4Chair from '@/components/tables/svg/TableCircle4Chair'
import TableCircle6Chair from '@/components/tables/svg/TableCircle6Chair'
import TableHighTop from '@/components/tables/svg/TableHighTop'
import TableRectangle4Chair from '@/components/tables/svg/TableRectangle4Chair'
import TableRectangle6Chair from '@/components/tables/svg/TableRectangle6Chair'
import TableSquare2Chair from '@/components/tables/svg/TableSquare2Chair'
import TableSquare4Chair from '@/components/tables/svg/TableSquare4Chair'
import TableSquare8Chair from '@/components/tables/svg/TableSquare8Chair'
import TextLabel from '@/components/tables/svg/TextLabel'
import DoorDouble from '@/components/tables/svg/DoorDouble'
import DoorSingle from '@/components/tables/svg/DoorSingle'
import WallSection from '@/components/tables/svg/WallSection'
import ZoneRectangle from '@/components/tables/svg/ZoneRectangle'

// This object is the single source of truth.
// I have added 'id' to every object so you can access it directly.
export const TABLE_SHAPES = {
  // --- Standard Tables ---
  'square-2': {
    id: 'square-2',
    label: '2-Seater Square',
    component: TableSquare2Chair,
    capacity: 2,
    width: 79,
    height: 97,
    type: 'table' as const,
    category: 'table'
  },
  'square-4': {
    id: 'square-4',
    label: '4-Seater Square',
    component: TableSquare4Chair,
    capacity: 4,
    width: 97,
    height: 97,
    type: 'table' as const,
    category: 'table'
  },
  'rectangle-4': {
    id: 'rectangle-4',
    label: '4-Seater Rectangle',
    component: TableRectangle4Chair,
    capacity: 4,
    width: 140,
    height: 90,
    type: 'table' as const,
    category: 'table'
  },
  'rectangle-6': {
    id: 'rectangle-6',
    label: '6-Seater Rectangle',
    component: TableRectangle6Chair,
    capacity: 6,
    width: 180,
    height: 90,
    type: 'table' as const,
    category: 'table'
  },
  'square-8': {
    id: 'square-8',
    label: '8-Seater Long',
    component: TableSquare8Chair,
    capacity: 8,
    width: 208,
    height: 97,
    type: 'table' as const,
    category: 'table'
  },
  'circle-2': {
    id: 'circle-2',
    label: '2-Seater Circle',
    component: TableCircle2Chair,
    capacity: 2,
    width: 130,
    height: 130,
    type: 'table' as const,
    category: 'table'
  },
  'circle-4': {
    id: 'circle-4',
    label: '4-Seater Circle',
    component: TableCircle4Chair,
    capacity: 4,
    width: 130,
    height: 130,
    type: 'table' as const,
    category: 'table'
  },
  'circle-6': {
    id: 'circle-6',
    label: '6-Seater Circle',
    component: TableCircle6Chair,
    capacity: 6,
    width: 150,
    height: 150,
    type: 'table' as const,
    category: 'table'
  },
  'high-top-2': {
    id: 'high-top-2',
    label: '2-Seater High-Top',
    component: TableHighTop,
    capacity: 2,
    width: 120,
    height: 120,
    type: 'table' as const,
    category: 'table'
  },

  // --- Booths ---
  'booth-2': {
    id: 'booth-2',
    label: '2-Person Booth',
    component: Booth2Person,
    capacity: 2,
    width: 150,
    height: 100,
    type: 'table' as const,
    category: 'booth'
  },
  'booth-4': {
    id: 'booth-4',
    label: '4-Person Booth',
    component: Booth4Person,
    capacity: 4,
    width: 200,
    height: 100,
    type: 'table' as const,
    category: 'booth'
  },

  // --- Functional Objects ---
  'bar-section': {
    id: 'bar-section',
    label: 'Bar Section',
    component: BarSection,
    capacity: 0,
    width: 170,
    height: 100,
    type: 'static-object' as const,
    category: 'functional'
  },
  'cashier-stand': {
    id: 'cashier-stand',
    label: 'Cashier Stand',
    component: CashierStand,
    capacity: 0,
    width: 100,
    height: 100,
    type: 'static-object' as const,
    category: 'functional'
  },
  'host-stand': {
    id: 'host-stand',
    label: 'Host Stand',
    component: HostStand,
    capacity: 0,
    width: 40,
    height: 35,
    type: 'static-object' as const,
    category: 'functional'
  },
  'server-station': {
    id: 'server-station',
    label: 'Server Station',
    component: ServerStation,
    capacity: 0,
    width: 60,
    height: 40,
    type: 'static-object' as const,
    category: 'functional'
  },
  'kitchen-pass': {
    id: 'kitchen-pass',
    label: 'Kitchen Pass',
    component: KitchenPass,
    capacity: 0,
    width: 180,
    height: 25,
    type: 'static-object' as const,
    category: 'functional'
  },

  // --- Architectural & Decorative ---
  'wall-section': {
    id: 'wall-section',
    label: 'Wall Section',
    component: WallSection,
    capacity: 0,
    width: 200,
    height: 10,
    type: 'static-object' as const,
    category: 'structure'
  },
  'door-single': {
    id: 'door-single',
    label: 'Single Door',
    component: DoorSingle,
    capacity: 0,
    width: 55,
    height: 55,
    type: 'static-object' as const,
    category: 'structure'
  },
  'door-double': {
    id: 'door-double',
    label: 'Double Door',
    component: DoorDouble,
    capacity: 0,
    width: 110,
    height: 55,
    type: 'static-object' as const,
    category: 'structure'
  },
  pillar: {
    id: 'pillar',
    label: 'Pillar',
    component: Pillar,
    capacity: 0,
    width: 40,
    height: 40,
    type: 'static-object' as const,
    category: 'structure'
  },
  plant: {
    id: 'plant',
    label: 'Decorative Plant',
    component: DecorativePlant,
    capacity: 0,
    width: 50,
    height: 50,
    type: 'static-object' as const,
    category: 'decor'
  },
  // --- Zone & Label Placeholders ---
  'zone-rectangle': {
    id: 'zone-rectangle',
    label: 'Zone',
    component: ZoneRectangle,
    capacity: 0,
    width: 200,
    height: 200,
    type: 'static-object' as const,
    category: 'zone'
  },
  'label-text': {
    id: 'label-text',
    label: 'Text Label',
    component: TextLabel,
    capacity: 0,
    width: 100,
    height: 50,
    type: 'static-object' as const,
    category: 'zone'
  }
}

// We create the array from the object values directly since they now contain the ID
export const SHAPE_OPTIONS = Object.values(TABLE_SHAPES)

export const OBJECT_SIZE_PRESETS = [
  { id: 'S', label: 'S', scale: 0.8 },
  { id: 'M', label: 'M', scale: 1 },
  { id: 'L', label: 'L', scale: 1.2 },
  { id: 'XL', label: 'XL', scale: 1.4 }
] as const

export type ObjectSizePresetId = (typeof OBJECT_SIZE_PRESETS)[number]['id']

export const getShapeBaseSize = (shapeId: string) => {
  const shape = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]
  return {
    width: shape?.width ?? 100,
    height: shape?.height ?? 100
  }
}

export const getDimensionsForSizePreset = (
  shapeId: string,
  presetId: ObjectSizePresetId
) => {
  const preset = OBJECT_SIZE_PRESETS.find(item => item.id === presetId)
  const baseSize = getShapeBaseSize(shapeId)
  const scale = preset?.scale ?? 1

  return {
    width: Math.round(baseSize.width * scale),
    height: Math.round(baseSize.height * scale)
  }
}

export const getClosestSizePreset = (
  shapeId: string,
  width?: number,
  height?: number
): ObjectSizePresetId => {
  const baseSize = getShapeBaseSize(shapeId)
  const currentWidth = width ?? baseSize.width
  const currentHeight = height ?? baseSize.height

  let closestPreset: ObjectSizePresetId = 'M'
  let closestDistance = Number.POSITIVE_INFINITY

  for (const preset of OBJECT_SIZE_PRESETS) {
    const targetWidth = baseSize.width * preset.scale
    const targetHeight = baseSize.height * preset.scale
    const distance =
      Math.abs(currentWidth - targetWidth) + Math.abs(currentHeight - targetHeight)

    if (distance < closestDistance) {
      closestDistance = distance
      closestPreset = preset.id
    }
  }

  return closestPreset
}

export const WALL_CORNER_SNAP_SHAPE_IDS = new Set([
  'wall-section'
])

export const RIGHT_ANGLE_ROTATION_SHAPE_IDS = new Set([
  'door-single',
  'door-double'
])

export const FREE_PLACEMENT_SHAPE_IDS = new Set([
  'door-single',
  'door-double'
])
