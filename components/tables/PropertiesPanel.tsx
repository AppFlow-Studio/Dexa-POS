import { useUiScale } from '@/lib/uiScale'
import {
  getClosestSizePreset,
  getDimensionsForSizePreset,
  OBJECT_SIZE_PRESETS,
  RIGHT_ANGLE_ROTATION_SHAPE_IDS
} from '@/lib/table-shapes'
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
import React, { useEffect, useState } from 'react'
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
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
  const [sizePreset, setSizePreset] = useState(
    getClosestSizePreset(table.shape_id, table.width, table.height)
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setName(table.name)
  }, [table.name])

  useEffect(() => {
    setSizePreset(getClosestSizePreset(table.shape_id, table.width, table.height))
  }, [table.shape_id, table.width, table.height])

  const handleNameChange = (v: string) => {
    setName(v)
  }

  const handleNameBlur = () => {
    if (table.id && name.trim()) updateTableName(table.id, name.trim())
  }

  const rotationStep = RIGHT_ANGLE_ROTATION_SHAPE_IDS.has(table.shape_id)
    ? 90
    : 45

  const labelStyle = {
    color: colors.muted,
    fontSize: s(9),
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: s(5)
  }

  const inputStyle = {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    paddingHorizontal: s(10),
    paddingVertical: s(8),
    fontSize: s(13),
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

  const handleSizePresetPress = (presetId: (typeof OBJECT_SIZE_PRESETS)[number]['id']) => {
    if (isLocked) return
    setSizePreset(presetId)
    const { width, height } = getDimensionsForSizePreset(table.shape_id, presetId)
    updateTableSize(table.id, width, height)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        position: 'absolute',
        bottom: s(14),
        left: s(14),
        width: s(280),
        backgroundColor: colors.card,
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: s(14),
          paddingVertical: s(11),
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Text
            style={{ color: colors.heading, fontSize: s(13), fontWeight: '700' }}
          >
            Properties
          </Text>
          <View
            style={{
              paddingHorizontal: s(7),
              paddingVertical: s(2),
              borderRadius: s(6),
              backgroundColor: colors.inset,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ color: colors.label, fontSize: s(10), fontWeight: '600' }}
            >
              {table.name}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={clearSelection}
          style={{
            padding: s(5),
            borderRadius: s(6),
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <X size={s(13)} color={colors.label} />
        </TouchableOpacity>
      </View>

      <View style={{ padding: s(14), gap: s(12) }}>
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
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            {OBJECT_SIZE_PRESETS.map(preset => {
              const isActive = sizePreset === preset.id
              return (
                <TouchableOpacity
                  key={preset.id}
                  disabled={isLocked}
                  onPress={() => handleSizePresetPress(preset.id)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: s(10),
                    borderRadius: s(8),
                    backgroundColor: isActive
                      ? colors.teal + '20'
                      : isLocked
                        ? colors.inset
                        : colors.panel,
                    borderWidth: 1,
                    borderColor: isActive ? colors.teal + '65' : colors.border,
                    opacity: isLocked ? 0.55 : 1
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.teal : colors.label,
                      fontSize: s(13),
                      fontWeight: '700'
                    }}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          
        </View>

        <View>
          <Text style={labelStyle}>Rotation</Text>
          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <TouchableOpacity
              disabled={isLocked}
              onPress={() => handleRotate('left')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: s(5),
                paddingVertical: s(8),
                borderRadius: s(8),
                backgroundColor: isLocked ? colors.inset : colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isLocked ? 0.55 : 1
              }}
            >
              <RotateCcw size={s(13)} color={colors.label} />
              <Text
                style={{ color: colors.label, fontSize: s(12), fontWeight: '600' }}
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
                gap: s(5),
                paddingVertical: s(8),
                borderRadius: s(8),
                backgroundColor: isLocked ? colors.inset : colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isLocked ? 0.55 : 1
              }}
            >
              <RotateCw size={s(13)} color={colors.label} />
              <Text
                style={{ color: colors.label, fontSize: s(12), fontWeight: '600' }}
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
              gap: s(6),
              paddingVertical: s(9),
              borderRadius: s(8),
              backgroundColor: isLocked ? colors.warning + '18' : colors.panel,
              borderWidth: 1,
              borderColor: isLocked ? colors.warning + '55' : colors.border
            }}
          >
            {isLocked ? (
              <Lock size={s(13)} color={colors.warning} />
            ) : (
              <Unlock size={s(13)} color={colors.label} />
            )}
            <Text
              style={{
                color: isLocked ? colors.warning : colors.label,
                fontWeight: '700',
                fontSize: s(13)
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
            gap: s(6),
            paddingVertical: s(9),
            borderRadius: s(8),
            backgroundColor: colors.danger + '14',
            borderWidth: 1,
            borderColor: colors.danger + '50'
          }}
        >
          <Trash2 size={s(13)} color={colors.danger} />
          <Text
            style={{ color: colors.danger, fontWeight: '700', fontSize: s(13) }}
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
              width: s(300),
              backgroundColor: colors.card,
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                padding: s(18),
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{ color: colors.heading, fontSize: s(14), fontWeight: '700' }}
              >
                {`Delete "${table.name}"?`}
              </Text>
              <Text style={{ color: colors.muted, fontSize: s(12), marginTop: s(4) }}>
                This cannot be undone.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: s(8), padding: s(14) }}>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: s(9),
                  borderRadius: s(8),
                  alignItems: 'center',
                  backgroundColor: colors.inset,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text
                  style={{ color: colors.label, fontWeight: '600', fontSize: s(13) }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  flex: 1,
                  paddingVertical: s(9),
                  borderRadius: s(8),
                  alignItems: 'center',
                  backgroundColor: colors.danger + '20',
                  borderWidth: 1,
                  borderColor: colors.danger + '60'
                }}
              >
                <Text
                  style={{ color: colors.danger, fontWeight: '700', fontSize: s(13) }}
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