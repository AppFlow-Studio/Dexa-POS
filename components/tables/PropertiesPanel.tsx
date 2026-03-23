import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { RotateCcw, RotateCw, Trash2, X } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native'

interface PropertiesPanelProps {
  table: FloorPlanObject
  layoutId: string
}

const labelStyle = {
  color: colors.muted,
  fontSize: 9,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  marginBottom: 5,
}

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  fontSize: 13,
  color: colors.heading,
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ table }) => {
  const { updateTableName, removeTable, clearSelection, updateTablePosition, updateTableSize } = useFloorPlanStore()
  const [name, setName] = useState(table.name)
  const [width, setWidth] = useState(String(table.width || 100))
  const [height, setHeight] = useState(String(table.height || 100))
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Track whether the user is actively editing size fields
  const editingSize = useRef(false)

  useEffect(() => { setName(table.name) }, [table.name])
  useEffect(() => {
    if (!editingSize.current) {
      setWidth(String(table.width || 100))
      setHeight(String(table.height || 100))
    }
  }, [table.width, table.height])

  const handleNameChange = (v: string) => { setName(v) }
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

  const handleRotate = (dir: 'left' | 'right') => {
    const next = Math.round(((table.rotation || 0) + (dir === 'left' ? -45 : 45)) / 45) * 45
    updateTablePosition(table.id, table.x, table.y, next)
  }

  const handleDelete = () => {
    setShowDeleteConfirm(false)
    if (table.id) { removeTable(table.id); clearSelection() }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ position: 'absolute', bottom: 14, right: 14, width: 280, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '700' }}>Properties</Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.label, fontSize: 10, fontWeight: '600' }}>{table.name}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={clearSelection} style={{ padding: 5, borderRadius: 6, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}>
          <X size={13} color={colors.label} />
        </TouchableOpacity>
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        {/* Name */}
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

        {/* Size */}
        <View>
          <Text style={labelStyle}>Size</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...labelStyle, marginBottom: 4 }}>W</Text>
              <TextInput
                value={width}
                onChangeText={v => { editingSize.current = true; setWidth(v) }}
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
                onChangeText={v => { editingSize.current = true; setHeight(v) }}
                onBlur={handleHeightBlur}
                keyboardType='numeric'
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </View>
          </View>
        </View>

        {/* Rotation */}
        <View>
          <Text style={labelStyle}>Rotation</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleRotate('left')}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}
            >
              <RotateCcw size={13} color={colors.label} />
              <Text style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}>−45°</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleRotate('right')}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}
            >
              <RotateCw size={13} color={colors.label} />
              <Text style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}>+45°</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          onPress={() => setShowDeleteConfirm(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.danger + '14', borderWidth: 1, borderColor: colors.danger + '50' }}
        >
          <Trash2 size={13} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Delete Confirm Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType='fade' onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 300, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}>Delete "{table.name}"?</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>This cannot be undone.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '60' }}>
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

export default PropertiesPanel
