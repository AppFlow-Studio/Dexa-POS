/**
 * Notification Settings Screen
 *
 * Configure sound alerts for external orders (online, kiosk, third-party).
 * Sound assets are shared with the KDS sound system.
 */

import SettingsCard from '@/components/settings/SettingsCard'
import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import KDSSoundService, {
  SOUND_PRESET_OPTIONS,
  type SoundPreset
} from '@/services/kds/kdsSoundService'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import {
  Bell,
  ChevronDown,
  Globe,
  Play,
  Smartphone,
  Truck
} from 'lucide-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'

// Filtered options for POS notifications (exclude 'none' from picker, master toggle handles disable)
const SOUND_OPTIONS = SOUND_PRESET_OPTIONS.filter(o => o.value !== 'none')

interface SoundPickerProps {
  label: string
  icon: React.ElementType
  value: SoundPreset
  onChange: (v: SoundPreset) => void
  onTest: (v: SoundPreset) => void
  disabled?: boolean
}

function SoundPicker ({
  label,
  icon: Icon,
  value,
  onChange,
  onTest,
  disabled
}: SoundPickerProps) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [open, setOpen] = useState(false)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: s(12),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: disabled ? 0.4 : 1
      }}
    >
      <View
        style={{
          width: s(36),
          height: s(36),
          borderRadius: s(10),
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: s(12)
        }}
      >
        <Icon size={s(18)} color={colors.teal} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.label, fontSize: s(14), fontWeight: '500' }}>
          {label}
        </Text>
        <Text style={{ color: colors.muted, fontSize: s(12), marginTop: s(2) }}>
          Plays when a new order arrives from this source
        </Text>
      </View>

      {/* Sound selector dropdown */}
      <TouchableOpacity
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          paddingHorizontal: s(12),
          paddingVertical: s(8),
          borderRadius: s(8),
          borderWidth: 1,
          borderColor: colors.border,
          marginRight: s(8)
        }}
      >
        <Text style={{ color: colors.label, fontSize: s(13), marginRight: s(6) }}>
          {SOUND_PRESET_OPTIONS.find(o => o.value === value)?.label || value}
        </Text>
        <ChevronDown size={s(14)} color={colors.muted} />
      </TouchableOpacity>

      {/* Test button */}
      <TouchableOpacity
        disabled={disabled}
        onPress={() => onTest(value)}
        style={{
          width: s(36),
          height: s(36),
          borderRadius: s(10),
          backgroundColor: colors.teal + '20',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Play size={s(16)} color={colors.teal} />
      </TouchableOpacity>

      {/* Dropdown modal */}
      <Modal visible={open} transparent animationType='fade'>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              padding: s(8),
              minWidth: s(200),
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            {SOUND_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                style={{
                  paddingHorizontal: s(16),
                  paddingVertical: s(12),
                  borderRadius: s(8),
                  backgroundColor:
                    opt.value === value ? colors.teal + '20' : 'transparent'
                }}
              >
                <Text
                  style={{
                    color: opt.value === value ? colors.teal : colors.label,
                    fontSize: s(14),
                    fontWeight: opt.value === value ? '600' : '400'
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

export default function NotificationsScreen () {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const config = useLocationConfigStore(s => s.config.notifications)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)

  // Local sound service for test/preview playback
  const previewServiceRef = useRef<KDSSoundService | null>(null)

  useEffect(() => {
    const svc = new KDSSoundService()
    previewServiceRef.current = svc
    svc.init()
    return () => {
      svc.dispose()
      previewServiceRef.current = null
    }
  }, [])

  const update = useCallback(
    (partial: Partial<typeof config>) => {
      updateConfig('notifications', partial)
    },
    [updateConfig]
  )

  const handleTest = useCallback((preset: SoundPreset) => {
    previewServiceRef.current?.playPreview(preset)
  }, [])

  return (
    <View
      style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.screen }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(20), paddingBottom: s(40) }}
      >
        {/* Header */}
        <View style={{ marginBottom: s(20) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: s(4)
            }}
          >
            <Bell size={s(22)} color={colors.teal} />
            <Text
              style={{
                fontSize: s(22),
                fontWeight: '700',
                color: colors.heading,
                marginLeft: s(10)
              }}
            >
              Notifications
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: s(13) }}>
            Configure sound alerts when external orders arrive at this station
          </Text>
        </View>

        {/* Master toggle */}
        <SettingsCard title='Sound Alerts'>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: s(8)
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.heading,
                  fontSize: s(15),
                  fontWeight: '600'
                }}
              >
                Enable Sound Alerts
              </Text>
              <Text style={{ color: colors.muted, fontSize: s(12), marginTop: s(2) }}>
                Play a sound when orders arrive from external sources (online,
                kiosk, third-party)
              </Text>
            </View>
            <Switch
              checked={config.soundEnabled}
              onCheckedChange={v => update({ soundEnabled: v })}
            />
          </View>
        </SettingsCard>

        <View style={{ height: s(16) }} />

        {/* Per-source sound pickers */}
        <SettingsCard title='Order Source Sounds'>
          <SoundPicker
            label='Online Orders'
            icon={Globe}
            value={config.onlineOrderSound}
            onChange={v => update({ onlineOrderSound: v })}
            onTest={handleTest}
            disabled={!config.soundEnabled}
          />
          <SoundPicker
            label='Kiosk Orders'
            icon={Smartphone}
            value={config.kioskOrderSound}
            onChange={v => update({ kioskOrderSound: v })}
            onTest={handleTest}
            disabled={!config.soundEnabled}
          />
          <SoundPicker
            label='Third-Party Orders'
            icon={Truck}
            value={config.thirdPartyOrderSound}
            onChange={v => update({ thirdPartyOrderSound: v })}
            onTest={handleTest}
            disabled={!config.soundEnabled}
          />
        </SettingsCard>
      </ScrollView>
    </View>
  )
}
