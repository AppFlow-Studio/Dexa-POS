import { RIGHT_ANGLE_ROTATION_SHAPE_IDS } from '@/lib/table-shapes'
import { colors } from '@/lib/theme'
import { useFloorPlanEditorStore } from '@/stores/useFloorPlanEditorStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import {
  Lock,
  RotateCcw,
  RotateCw,
  Trash2,
  Unlock,
  X
} from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

interface PropertiesPanelProps {
  table: FloorPlanObject
  layoutId: string
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ table }) => {
  const {
    updateTableName,
    removeTable,
    clearSelection,
    updateTablePosition,
    updateTableSize
  } = useFloorPlanStore()
  const toggleObjectLock = useFloorPlanEditorStore(s => s.toggleObjectLock)
  const setObjectLocked = useFloorPlanEditorStore(s => s.setObjectLocked)
  const isLocked = useFloorPlanEditorStore(s =>
    s.lockedObjectIds.includes(table.id)
  )
  const [name, setName] = useState(table.name)
  const [width, setWidth] = useState(String(table.width || 100))
  const [height, setHeight] = useState(String(table.height || 100))
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Track whether the user is actively editing size fields
  const editingSize = useRef(false)

  useEffect(() => {
    setName(table.name)
  }, [table.name])

  useEffect(() => {
    if (!editingSize.current) {
      setWidth(String(table.width || 100))
      setHeight(String(table.height || 100))
    }
  }, [table.width, table.height])

  const handleNameChange = (v: string) => {
    setName(v)
  }

  const handleNameBlur = () => {
    if (table.id && name.trim()) updateTableName(table.id, name.trim())
  }

  const handleWidthBlur = () => {
    editingSize.current = false
    const w = parseInt(width, 10)
    const h = parseInt(height, 10)
    if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
      updateTableSize(table.id, w, h)
    } else {
      setWidth(String(table.width || 100))
    }
  }

  const handleHeightBlur = () => {
    editingSize.current = false
    const w = parseInt(width, 10)
    const h = parseInt(height, 10)
    if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
      updateTableSize(table.id, w, h)
    } else {
      setHeight(String(table.height || 100))
    }
  }

  const rotationStep = RIGHT_ANGLE_ROTATION_SHAPE_IDS.has(table.shape_id)
    ? 90
    : 45

  const labelStyle = {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 5
  }

  const inputStyle = {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.heading
  }

  const handleRotate = (dir: 'left' | 'right') => {
    const next =
      Math.round(
        ((table.rotation || 0) +
          (dir === 'left' ? -rotationStep : rotationStep)) /
          rotationStep
      ) * rotationStep
    updateTablePosition(table.id, table.x, table.y, next)
  }

  const handleDelete = () => {
    setShowDeleteConfirm(false)
    if (table.id) {
      setObjectLocked(table.id, false)
      removeTable(table.id)
      clearSelection()
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        width: 280,
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{ color: colors.heading, fontSize: 13, fontWeight: '700' }}
          >
            Properties
          </Text>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: colors.inset,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ color: colors.label, fontSize: 10, fontWeight: '600' }}
            >
              {table.name}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={clearSelection}
          style={{
            padding: 5,
            borderRadius: 6,
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <X size={13} color={colors.label} />
        </TouchableOpacity>
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        <View>
          <Text style={labelStyle}>Name</Text>
          <TextInput
            value={name}
            onChangeText={handleNameChange}
            onBlur={handleNameBlur}
            placeholder='Object name'
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
        </View>

        <View>
          <Text style={labelStyle}>Size</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...labelStyle, marginBottom: 4 }}>W</Text>
              <TextInput
                value={width}
                onChangeText={v => {
                  editingSize.current = true
                  setWidth(v)
                }}
                editable={!isLocked}
                onBlur={handleWidthBlur}
                keyboardType='numeric'
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...labelStyle, marginBottom: 4 }}>H</Text>
              <TextInput
                value={height}
                onChangeText={v => {
                  editingSize.current = true
                  setHeight(v)
                }}
                editable={!isLocked}
                onBlur={handleHeightBlur}
                keyboardType='numeric'
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </View>
          </View>
        </View>

        <View>
          <Text style={labelStyle}>Rotation</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              disabled={isLocked}
              onPress={() => handleRotate('left')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: isLocked ? colors.inset : colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isLocked ? 0.55 : 1
              }}
            >
              <RotateCcw size={13} color={colors.label} />
              <Text
                style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}
              >
                {`-${rotationStep} deg`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={isLocked}
              onPress={() => handleRotate('right')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: isLocked ? colors.inset : colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isLocked ? 0.55 : 1
              }}
            >
              <RotateCw size={13} color={colors.label} />
              <Text
                style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}
              >
                {`+${rotationStep} deg`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View>
          <Text style={labelStyle}>Lock</Text>
          <TouchableOpacity
            onPress={() => toggleObjectLock(table.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              borderRadius: 8,
              backgroundColor: isLocked ? colors.warning + '18' : colors.panel,
              borderWidth: 1,
              borderColor: isLocked ? colors.warning + '55' : colors.border
            }}
          >
            {isLocked ? (
              <Lock size={13} color={colors.warning} />
            ) : (
              <Unlock size={13} color={colors.label} />
            )}
            <Text
              style={{
                color: isLocked ? colors.warning : colors.label,
                fontWeight: '700',
                fontSize: 13
              }}
            >
              {isLocked ? 'Locked' : 'Unlocked'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setShowDeleteConfirm(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 9,
            borderRadius: 8,
            backgroundColor: colors.danger + '14',
            borderWidth: 1,
            borderColor: colors.danger + '50'
          }}
        >
          <Trash2 size={13} color={colors.danger} />
          <Text
            style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}
          >
            Delete
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType='fade'
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View
            style={{
              width: 300,
              backgroundColor: colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                padding: 18,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}
              >
                {`Delete "${table.name}"?`}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                This cannot be undone.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: colors.inset,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text
                  style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 8,
                  alignItems: 'center',
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '60'
                }}
              >
                <Text
                  style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

export default PropertiesPanel
