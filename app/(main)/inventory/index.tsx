import AddInventoryItemSheet from '@/components/inventory/AddInventoryItemSheet'
import InventoryItemDetailModal from '@/components/inventory/InventoryItemDetailModal'
import InventoryItemFormModal from '@/components/inventory/InventoryItemFormModal'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useInventoryWriteGate } from '@/hooks/inventory/useInventoryWriteGate'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { InventoryItem } from '@/lib/types'
import { useInventoryStore } from '@/stores/useInventoryStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import BottomSheet from '@/components/ui/bottomSheet'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit,
  LayoutGrid,
  List,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Trash2
} from 'lucide-react-native'
import React, { useEffect, useMemo, useState } from 'react'
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native'

const formatInventoryQuantity = (value: number | null | undefined) => {
  const quantity = Number(value ?? 0)

  if (!Number.isFinite(quantity)) return '0'
  if (Number.isInteger(quantity)) return String(quantity)

  return quantity.toFixed(2).replace(/\.?0+$/, '')
}

const formatInventoryUnit = (item: InventoryItem) =>
  item.unit?.trim() || item.unitType?.trim() || 'unit'

/* =========================
   Grid Box
========================= */
const InventoryItemBox: React.FC<{
  item: InventoryItem
  onEdit: () => void
  onDelete: () => void
  onTap: () => void
}> = ({ item, onEdit, onDelete, onTap }) => {
  const isLowStock = (item.stockQuantity ?? 0) <= (item.reorderThreshold ?? 0)
  const vendors = useInventoryStore(state => state.vendors)
  const vendor = vendors.find(v => v.id === item.vendorId)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.6}
      style={{
        backgroundColor: colors.panel,
        margin: s(5),
        borderRadius: s(14),
        padding: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
        justifyContent: 'space-between',
        overflow: 'hidden'
      }}
    >
      {/* Gradient Accent Top */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: isLowStock ? colors.danger : colors.teal
        }}
      />

      {/* Top Section: Icon & Menu */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: s(8)
        }}
      >
        <View
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(10),
            backgroundColor: (isLowStock ? colors.danger : colors.teal) + '15',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Package size={s(15)} color={isLowStock ? colors.danger : colors.teal} />
        </View>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity
              style={{
                width: s(28),
                height: s(28),
                borderRadius: s(9),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <MoreHorizontal size={s(12)} color={colors.muted} />
            </TouchableOpacity>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className='w-40'
            style={{
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: s(14),
              padding: s(6),
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12
            }}
          >
            <DropdownMenuItem
              onPress={onEdit}
              className='active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent'
              style={{
                borderRadius: s(10),
                paddingHorizontal: s(10),
                paddingVertical: s(9),
                backgroundColor: colors.card
              }}
            >
              <Edit size={s(13)} color={colors.label} />
              <Text
                style={{
                  marginLeft: s(6),
                  fontSize: s(12),
                  fontWeight: '600',
                  color: colors.heading
                }}
              >
                Edit
              </Text>
            </DropdownMenuItem>

            <DropdownMenuItem
              onPress={onDelete}
              className='active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent'
              style={{
                borderRadius: s(10),
                paddingHorizontal: s(10),
                paddingVertical: s(9),
                backgroundColor: colors.card
              }}
            >
              <Trash2 size={s(13)} color={colors.danger} />
              <Text
                style={{
                  marginLeft: s(6),
                  fontSize: s(12),
                  fontWeight: '600',
                  color: colors.danger
                }}
              >
                Delete
              </Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>

      {/* Name & Category */}
      <View style={{ marginBottom: s(8) }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: s(11),
            fontWeight: '700',
            color: colors.heading,
            marginBottom: s(2),
            lineHeight: s(14)
          }}
        >
          {item.name}
        </Text>

        <Text
          numberOfLines={1}
          style={{
            fontSize: s(8.5),
            color: colors.muted
          }}
        >
          {item.category || '—'}
        </Text>
      </View>

      {/* Stock Highlight */}
      <View
        style={{
          backgroundColor: (isLowStock ? colors.danger : colors.teal) + '10',
          borderRadius: s(8),
          padding: s(6),
          marginBottom: s(6)
        }}
      >
        <Text style={{ fontSize: s(8), color: colors.muted, marginBottom: s(2) }}>
          Stock
        </Text>
        <Text
          style={{
            fontSize: s(12),
            fontWeight: '700',
            color: isLowStock ? colors.danger : colors.teal
          }}
        >
          {formatInventoryQuantity(item.stockQuantity)} {formatInventoryUnit(item)}
        </Text>
      </View>

      {/* Cost & Vendor */}
      <View style={{ flexDirection: 'row', gap: s(4) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(8), color: colors.muted, marginBottom: s(1) }}>
            Cost
          </Text>
          <Text
            style={{ fontSize: s(10), fontWeight: '600', color: colors.label }}
          >
            ${(item.cost ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(8), color: colors.muted, marginBottom: s(1) }}>
            Vendor
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: s(9),
              fontWeight: '500',
              color: colors.label
            }}
          >
            {vendor?.name || '—'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

/* =========================
   Row Item
========================= */
const InventoryItemRow: React.FC<{
  item: InventoryItem
  onEdit: () => void
  onDelete: () => void
  onTap: () => void
}> = ({ item, onEdit, onDelete, onTap }) => {
  const isLowStock = (item.stockQuantity ?? 0) <= (item.reorderThreshold ?? 0)
  const vendors = useInventoryStore(state => state.vendors)
  const vendor = vendors.find(v => v.id === item.vendorId)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.panel,
        marginHorizontal: s(10),
        marginBottom: s(4),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 3,
        borderLeftColor: isLowStock ? colors.danger : colors.teal,
        paddingHorizontal: s(12),
        paddingVertical: s(10),
        gap: s(8)
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: s(30),
          height: s(30),
          borderRadius: s(8),
          backgroundColor: (isLowStock ? colors.danger : colors.teal) + '15',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <Package size={s(13)} color={isLowStock ? colors.danger : colors.teal} />
      </View>

      {/* Name + Category */}
      <View style={{ flex: 3 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: s(12), fontWeight: '700', color: colors.heading }}
        >
          {item.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}
        >
          {item.category || '—'}
        </Text>
      </View>

      {/* Stock */}
      <View style={{ flex: 2, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: s(9), color: colors.muted, marginBottom: s(1) }}>
          Stock
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
          <Text
            style={{
              fontSize: s(12),
              fontWeight: '700',
              color: isLowStock ? colors.danger : colors.teal
            }}
          >
            {formatInventoryQuantity(item.stockQuantity)}
          </Text>
          <Text style={{ fontSize: s(9), color: colors.muted }}>
            {formatInventoryUnit(item)}
          </Text>
          {isLowStock && <AlertTriangle size={s(10)} color={colors.danger} />}
        </View>
      </View>

      {/* Reorder Threshold */}
      <View style={{ flex: 1.5, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: s(9), color: colors.muted, marginBottom: s(1) }}>
          Reorder
        </Text>
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}>
          {formatInventoryQuantity(item.reorderThreshold)}
        </Text>
      </View>

      {/* Cost */}
      <View style={{ flex: 1.5, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: s(9), color: colors.muted, marginBottom: s(1) }}>
          Cost
        </Text>
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}>
          ${(item.cost ?? 0).toFixed(2)}
        </Text>
      </View>

      {/* Vendor */}
      <View style={{ flex: 2, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: s(9), color: colors.muted, marginBottom: s(1) }}>
          Vendor
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: s(11), fontWeight: '500', color: colors.label }}
        >
          {vendor?.name || '—'}
        </Text>
      </View>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TouchableOpacity
            style={{
              width: s(28),
              height: s(28),
              borderRadius: s(9),
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <MoreHorizontal size={s(14)} color={colors.muted} />
          </TouchableOpacity>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className='w-40'
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: s(14),
            padding: s(6),
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12
          }}
        >
          <DropdownMenuItem
            onPress={onEdit}
            className='active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent'
            style={{
              borderRadius: s(10),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.card
            }}
          >
            <Edit size={s(13)} color={colors.label} />
            <Text
              style={{
                marginLeft: s(6),
                fontSize: s(12),
                fontWeight: '600',
                color: colors.heading
              }}
            >
              Edit
            </Text>
          </DropdownMenuItem>
          <DropdownMenuItem
            onPress={onDelete}
            className='active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent'
            style={{
              borderRadius: s(10),
              paddingHorizontal: s(10),
              paddingVertical: s(9),
              backgroundColor: colors.card
            }}
          >
            <Trash2 size={s(13)} color={colors.danger} />
            <Text
              style={{
                marginLeft: s(6),
                fontSize: s(12),
                fontWeight: '600',
                color: colors.danger
              }}
            >
              Delete
            </Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TouchableOpacity>
  )
}

/* =========================
   Screen
========================= */
const InventoryScreen = () => {
  const {
    inventoryItems,
    getLowStockItems,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    fetchInventoryItems,
    vendors
  } = useInventoryStore()

  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  // Reads work offline from the mirror; writes do not. See Phase 5 in
  // docs/engineering/architecture/sqlite-offline-first.md.
  const { canWrite, blockedReason, runGuarded } = useInventoryWriteGate()

  useEffect(() => {
    if (selectedStore?.id) {
      fetchInventoryItems(selectedStore.id)
    }
  }, [selectedStore?.id])

  const lowStockItems = getLowStockItems()
  const addItemSheetRef = React.useRef<BottomSheet>(null)

  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [alertExpanded, setAlertExpanded] = useState(false)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'row'>('card')

  const filteredInventory = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return inventoryItems

    return inventoryItems.filter(i =>
      [i.name, i.category, vendors.find(v => v.id === i.vendorId)?.name]
        .filter(Boolean)
        .some(s => String(s).toLowerCase().includes(q))
    )
  }, [searchQuery, inventoryItems, vendors])

  const handleSaveItem = async (
    data: Omit<InventoryItem, 'id'>,
    id?: string
  ) => {
    if (!selectedStore?.id) return alert('No store selected')

    // Guarded because the modal does not surface a rejection: offline, the
    // store refuses the write and the form would otherwise just close.
    await runGuarded(() =>
      id
        ? updateInventoryItem(id, data, selectedStore.id)
        : addInventoryItem(data, selectedStore.id)
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Low Stock */}
      {lowStockItems.length > 0 && (
        <View
          style={{
            marginHorizontal: s(10),
            marginTop: s(10),
            marginBottom: s(8),
            borderRadius: s(10),
            backgroundColor: colors.danger + '12',
            borderWidth: 1,
            borderColor: colors.danger + '30',
            padding: s(10)
          }}
        >
          <TouchableOpacity
            onPress={() => setAlertExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <AlertTriangle size={s(14)} color={colors.danger} />
            <Text
              style={{
                marginLeft: s(6),
                flex: 1,
                fontSize: s(12),
                fontWeight: '700',
                color: colors.danger
              }}
            >
              Low Stock ({lowStockItems.length})
            </Text>

            {alertExpanded ? (
              <ChevronDown size={s(14)} color={colors.danger} />
            ) : (
              <ChevronRight size={s(14)} color={colors.danger} />
            )}
          </TouchableOpacity>

          {alertExpanded && (
            <View style={{ marginTop: s(6) }}>
              {lowStockItems.map(item => (
                <Text
                  key={item.id}
                  style={{
                    fontSize: s(11),
                    marginBottom: s(2),
                    color: colors.danger
                  }}
                >
                  • {item.name} ({formatInventoryQuantity(item.stockQuantity)} {formatInventoryUnit(item)} / {formatInventoryQuantity(item.reorderThreshold)})
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Search + View Toggle + Add */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: s(10),
          marginBottom: s(8),
          gap: s(8)
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.panel,
            borderRadius: s(8),
            paddingHorizontal: s(10),
            height: s(40),
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Search size={s(14)} color={colors.muted} />
          <TextInput
            placeholder='Search...'
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.muted}
            style={{
              marginLeft: s(6),
              flex: 1,
              fontSize: s(13),
              textAlignVertical: 'center',
              color: colors.label
            }}
          />
        </View>

        {/* View toggle */}
        <TouchableOpacity
          onPress={() => setViewMode(m => (m === 'card' ? 'row' : 'card'))}
          style={{
            height: s(40),
            width: s(40),
            borderRadius: s(8),
            backgroundColor: colors.panel,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          {viewMode === 'card' ? (
            <List size={s(16)} color={colors.label} />
          ) : (
            <LayoutGrid size={s(16)} color={colors.label} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => addItemSheetRef.current?.expand()}
          disabled={!canWrite}
          accessibilityState={{ disabled: !canWrite }}
          accessibilityHint={blockedReason ?? undefined}
          style={{
            height: s(40),
            width: s(40),
            borderRadius: s(8),
            backgroundColor: colors.teal + '20',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: canWrite ? 1 : 0.4
          }}
        >
          <Plus size={s(18)} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Row header (row view only) */}
      {viewMode === 'row' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: s(10),
            marginBottom: s(4),
            paddingHorizontal: s(12),
            paddingVertical: s(6),
            gap: s(8)
          }}
        >
          <View style={{ width: s(30), flexShrink: 0 }} />
          <Text
            style={{
              flex: 3,
              fontSize: s(9),
              fontWeight: '700',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Name
          </Text>
          <Text
            style={{
              flex: 2,
              fontSize: s(9),
              fontWeight: '700',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Stock
          </Text>
          <Text
            style={{
              flex: 1.5,
              fontSize: s(9),
              fontWeight: '700',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Reorder
          </Text>
          <Text
            style={{
              flex: 1.5,
              fontSize: s(9),
              fontWeight: '700',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Cost
          </Text>
          <Text
            style={{
              flex: 2,
              fontSize: s(9),
              fontWeight: '700',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Vendor
          </Text>
          <View style={{ width: s(26) }} />
        </View>
      )}

      {/* Card / Row List */}
      <FlatList
        key={viewMode}
        data={filteredInventory}
        keyExtractor={item => item.id}
        numColumns={viewMode === 'card' ? 5 : 1}
        contentContainerStyle={{
          paddingBottom: s(20),
          paddingHorizontal: viewMode === 'card' ? 0 : 0
        }}
        renderItem={({ item }) =>
          viewMode === 'card' ? (
            <InventoryItemBox
              item={item}
              onTap={() => setDetailItemId(item.id)}
              onEdit={() => setDetailItemId(item.id)}
              onDelete={() => {
                setSelectedItem(item)
                setDeleteConfirmOpen(true)
              }}
            />
          ) : (
            <InventoryItemRow
              item={item}
              onTap={() => setDetailItemId(item.id)}
              onEdit={() => setDetailItemId(item.id)}
              onDelete={() => {
                setSelectedItem(item)
                setDeleteConfirmOpen(true)
              }}
            />
          )
        }
      />

      {/* Modals */}
      <InventoryItemFormModal
        isOpen={modalMode !== null}
        onClose={() => {
          setModalMode(null)
          setSelectedItem(null)
        }}
        onSave={handleSaveItem}
        vendors={vendors}
        initialData={selectedItem}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (selectedItem) {
            void runGuarded(() => deleteInventoryItem(selectedItem.id))
          }
          setDeleteConfirmOpen(false)
        }}
        title='Delete Item'
        description={`Delete "${selectedItem?.name}"?`}
        confirmText='Delete'
        variant='destructive'
      />

      <AddInventoryItemSheet ref={addItemSheetRef} />

      <InventoryItemDetailModal
        isOpen={detailItemId !== null}
        itemId={detailItemId}
        onClose={() => setDetailItemId(null)}
        onUpdate={(id, data) => {
          if (selectedStore?.id) {
            return updateInventoryItem(id, data, selectedStore.id)
          }
          return Promise.resolve()
        }}
      />
    </View>
  )
}

export default InventoryScreen
