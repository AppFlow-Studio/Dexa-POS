import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useRouter } from 'expo-router'
import {
  ArrowRight,
  Clock,
  Grid,
  LayoutTemplate,
  Map,
  Plus,
  Settings2
} from 'lucide-react-native'
import { useEffect, useMemo, useRef } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const DiningRoomScreen = () => {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  // Stores
  const { floorPlans, createFloorPlan, tables, setActiveFloorPlan } =
    useFloorPlanStore()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const dining = useLocationConfigStore(s => s.config.dining)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)

  const {
    enablePerSeatOrdering,
    enableCoursing,
  } = dining

  // Settings are automatically synced by useLocationConfigStore

  const handleCreateFloorPlan = async () => {
    try {
      await createFloorPlan('New Floor Plan')
    } catch (error) {
      console.error('Failed to create floor plan:', error)
    }
  }

  // Calculate live table stats
  // Note: This only calculates stats for the currently loaded tables (Active Floor Plan)
  // because we don't load all tables for all floor plans at once anymore.
  const tableStats = useMemo(() => {
    const allTables = tables
    return {
      total: allTables.length,
      available: allTables.filter(
        t =>
          (t.session?.status || 'available') === 'available' &&
          (t.category === 'table' || t.category === 'booth')
      ).length,
      inUse: allTables.filter(
        t =>
          (t.session?.status || 'available') !== 'available' &&
          t.session?.status !== 'cleaning' &&
          (t.category === 'table' || t.category === 'booth')
      ).length,
      cleaning: allTables.filter(t => t.session?.status === 'cleaning').length
    }
  }, [tables])

  const cardStyle = {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  }

  const sectionTitleStyle = {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.heading
  }

  const labelStyle = {
    fontSize: 11,
    color: colors.label,
    marginBottom: 4
  }

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const
  }

  const rowTitleStyle = {
    fontSize: 13,
    color: colors.heading,
    fontWeight: '500' as const
  }

  const rowMetaStyle = {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1
  }

  const iconBoxStyle = {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.teal + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const
  }

  const ghostTealButtonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    backgroundColor: colors.teal + '20',
    borderWidth: 1,
    borderColor: colors.teal + '50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.heading,
    height: 34,
    textAlignVertical: 'center' as const
  }

  const dividerStyle = {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 14,
        paddingVertical: 10
      }}
    >
      {/* Header */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Dining Room
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Manage floor plans and table configurations.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
      >
        {/* Floor Plans Section */}
        <View style={cardStyle}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12
            }}
          >
            <View style={iconBoxStyle}>
              <Map size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Floor Plans</Text>
          </View>

          {floorPlans.length === 0 ? (
            <View
              style={{
                padding: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.border,
                borderRadius: 10
              }}
            >
              <Text
                style={{ fontSize: 12, color: colors.muted, marginBottom: 12 }}
              >
                No floor plans created yet.
              </Text>
              <TouchableOpacity
                onPress={handleCreateFloorPlan}
                style={ghostTealButtonStyle}
              >
                <Plus size={14} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Create Layout
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {floorPlans.map(layout => (
                <View
                  key={layout.id}
                  style={{
                    width: '48%',
                    backgroundColor: colors.screen,
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      marginBottom: 4
                    }}
                  >
                    <LayoutTemplate size={14} color={colors.label} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.heading
                      }}
                    >
                      {layout.name}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.muted,
                      marginBottom: 10
                    }}
                  >
                    {layout.table_count || 0} Tables configured
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      await setActiveFloorPlan(layout.id)
                      router.push({
                        pathname: '/tables/floor-plan',
                        params: { returnTo: '/settings/dining-room' }
                      })
                    }}
                    style={ghostTealButtonStyle}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Edit Layout
                    </Text>
                    <ArrowRight size={12} color={colors.teal} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={handleCreateFloorPlan}
                style={{
                  width: '48%',
                  backgroundColor: colors.screen,
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 108,
                  gap: 6
                }}
              >
                <Plus size={18} color={colors.muted} />
                <Text style={{ fontSize: 12, color: colors.label }}>
                  Create New
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Table Configuration Section */}
        <View style={cardStyle}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12
            }}
          >
            <View style={iconBoxStyle}>
              <Settings2 size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Table Configuration</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Default Party</Text>
              <TextInput
                style={inputStyle}
                value={dining.defaultPartySize.toString()}
                onChangeText={v =>
                  updateConfig('dining', {
                    defaultPartySize: parseInt(v) || 2
                  })
                }
                keyboardType='numeric'
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Sitting Time (min)</Text>
              <TextInput
                style={inputStyle}
                value={dining.defaultSittingTimeMinutes.toString()}
                onChangeText={v =>
                  updateConfig('dining', {
                    defaultSittingTimeMinutes: parseInt(v) || 0
                  })
                }
                keyboardType='numeric'
              />
            </View>
          </View>

          <View style={dividerStyle} />

          {/* Merging & Splitting */}
          <View style={{ gap: 10 }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Allow Table Merging</Text>
                <Text style={rowMetaStyle}>
                  Enables combining tables for large parties
                </Text>
              </View>
              <Switch
                checked={dining.allowTableMerging}
                onCheckedChange={v =>
                  updateConfig('dining', { allowTableMerging: v })
                }
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Allow Table Splitting</Text>
                <Text style={rowMetaStyle}>Multiple checks per table</Text>
              </View>
              <Switch
                checked={dining.allowTableSplitting}
                onCheckedChange={v =>
                  updateConfig('dining', { allowTableSplitting: v })
                }
              />
            </View>
          </View>
        </View>

        {/* Order Management Section */}
        <View style={cardStyle}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12
            }}
          >
            <View style={iconBoxStyle}>
              <Grid size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Order Management</Text>
          </View>

          <View style={{ gap: 10 }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Per-Seat Ordering</Text>
                <Text style={rowMetaStyle}>
                  Assign items to seats for accurate delivery and split billing
                </Text>
              </View>
              <Switch
                checked={enablePerSeatOrdering}
                onCheckedChange={v =>
                  updateConfig('dining', { enablePerSeatOrdering: v })
                }
              />
            </View>

            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Coursing</Text>
                <Text style={rowMetaStyle}>
                  Group items by course for multi-course service
                </Text>
              </View>
              <Switch
                checked={enableCoursing}
                onCheckedChange={v =>
                  updateConfig('dining', { enableCoursing: v })
                }
              />
            </View>
          </View>
        </View>

        {/* Table Status Section */}
        <View style={cardStyle}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12
            }}
          >
            <View style={iconBoxStyle}>
              <Clock size={16} color={colors.teal} />
            </View>
            <Text style={sectionTitleStyle}>Table Status</Text>
          </View>

          {/* Status pills */}
          <View
            style={{
              flexDirection: 'row',
              gap: 7,
              flexWrap: 'wrap',
              marginBottom: 12
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.teal + '15',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.teal
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.teal
                }}
              >
                {tableStats.available} Available
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.teal + '15',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.teal
                }}
              />
              <Text
                style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}
              >
                {tableStats.inUse} Seated
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.teal + '15',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.teal
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.teal
                }}
              >
                {tableStats.cleaning} Dirty
              </Text>
            </View>
          </View>

          <View style={dividerStyle} />

          {/* Sitting Time & Automation */}
          <View style={{ gap: 10 }}>
            <View style={rowStyle}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={rowTitleStyle}>Auto-Update Status</Text>
                <Text style={rowMetaStyle}>
                  Change to 'Dirty' after payment
                </Text>
              </View>
              <Switch
                checked={dining.autoUpdateTableStatus}
                onCheckedChange={v =>
                  updateConfig('dining', {
                    autoUpdateTableStatus: v
                  })
                }
              />
            </View>
          </View>
        </View>

        {/* Server Sections (Mock / Config) */}
        {/* <Card className="bg-panel border-gray-600">
          <CardHeader>
            <View className="flex-row items-center gap-3">
              <Users color="#8b5cf6" size={24} />
              <CardTitle className="text-white">Server Sections</CardTitle>
            </View>
          </CardHeader>
          <CardContent className="gap-6">
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Label className="text-white text-base">
                    Auto-Rotate Sections
                  </Label>
                  <Text className="text-gray-400 text-xs">
                    Rotate servers daily
                  </Text>
                </View>
                <Switch
                  checked={settings.autoRotateSections}
                  onCheckedChange={(v) =>
                    settings.updateDiningSettings({ autoRotateSections: v })
                  }
                />
              </View>

              <View className="flex-row items-center justify-between">
                <View>
                  <Label className="text-white text-base">
                    Balance Section Load
                  </Label>
                  <Text className="text-gray-400 text-xs">
                    Distribute guests evenly
                  </Text>
                </View>
                <Switch
                  checked={settings.balanceSectionLoad}
                  onCheckedChange={(v) =>
                    settings.updateDiningSettings({ balanceSectionLoad: v })
                  }
                />
              </View>
            </View>
            <View className="bg-screen p-4 rounded-lg border border-gray-700 items-center">
              <Grid size={32} color={colors.muted} className="mb-2" />
              <Text className="text-gray-500 text-center">
                Section visuals are available in the floor plan editor.
              </Text>
            </View>
          </CardContent>
        </Card> */}
      </ScrollView>
    </View>
  )
}

export default DiningRoomScreen
