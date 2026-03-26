import Slider from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { Map, MapPin, Plus, TrendingUp, Truck } from 'lucide-react-native'
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PARTNER_LOGO_MAP } from '@/lib/mockData'

// Helper for mapping store names to logo keys
const getPartnerLogo = (name: string) => {
  const map: Record<string, any> = {
    DoorDash: PARTNER_LOGO_MAP['Door Dash'],
    UberEats: PARTNER_LOGO_MAP['Uber-Eats'],
    Grubhub: PARTNER_LOGO_MAP['grubhub']
  }
  return map[name]
}

const DeliveryManagementScreen = () => {
  const insets = useSafeAreaInsets()
  const settings = useSettingsStore()

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
          Delivery Management
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Optimize delivery operations and manage third-party integrations.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12, gap: 10 }}
      >
        {/* ── Delivery Zones ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          {/* Card header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Map size={16} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: colors.heading
              }}
            >
              Delivery Zones
            </Text>
          </View>

          <View style={{ padding: 12, gap: 10 }}>
            {/* Map Placeholder */}
            <View
              style={{
                width: '100%',
                height: 160,
                backgroundColor: colors.screen,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              <MapPin size={32} color={colors.teal} />
              <Text
                style={{
                  fontSize: 10,
                  color: colors.label,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginTop: 8
                }}
              >
                [Map View]
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  marginTop: 4,
                  textAlign: 'center'
                }}
              >
                {`• [Your Restaurant]\n◦ Zone 1 (0-2 mi)\n○○ Zone 2 (2-4 mi)\n○○○ Zone 3 (4-6 mi)`}
              </Text>
            </View>

            {/* Zones Table */}
            <View
              style={{
                backgroundColor: colors.screen,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden'
              }}
            >
              {/* Table header */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.screen,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  Zone
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  Distance
                </Text>
                <Text
                  style={{
                    width: 64,
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    textAlign: 'right'
                  }}
                >
                  Fee
                </Text>
                <Text
                  style={{
                    width: 64,
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    textAlign: 'right'
                  }}
                >
                  ETA
                </Text>
              </View>
              {settings.zones.map((zone, index) => (
                <View
                  key={zone.id}
                  style={{
                    flexDirection: 'row',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderBottomWidth:
                      index < settings.zones.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                    alignItems: 'center'
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: '500'
                    }}
                  >
                    {zone.name}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.label }}>
                    {zone.distanceRange}
                  </Text>
                  <Text
                    style={{
                      width: 64,
                      fontSize: 13,
                      color: colors.heading,
                      textAlign: 'right'
                    }}
                  >
                    ${zone.fee.toFixed(2)}
                  </Text>
                  <Text
                    style={{
                      width: 64,
                      fontSize: 13,
                      color: colors.heading,
                      textAlign: 'right'
                    }}
                  >
                    {zone.eta} min
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Connected Delivery Partners ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          {/* Card header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '15',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Truck size={16} color={colors.teal} />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Connected Delivery Partners
              </Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                borderRadius: 8
              }}
            >
              <Plus size={12} color={colors.teal} />
              <Text
                style={{ fontSize: 12, color: colors.teal, fontWeight: '500' }}
              >
                Add Partner
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 12, gap: 8 }}>
            {settings.partners.map(partner => {
              const logoSource = getPartnerLogo(partner.name)
              const isActive = partner.status === 'Active'
              return (
                <View
                  key={partner.id}
                  style={{
                    backgroundColor: colors.screen,
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 12
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          backgroundColor: '#FFFFFF',
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}
                      >
                        {logoSource ? (
                          <Image
                            source={logoSource}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode='contain'
                          />
                        ) : (
                          <Text
                            style={{
                              color: '#000000',
                              fontWeight: '700',
                              fontSize: 14
                            }}
                          >
                            {partner.name.substring(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: colors.heading
                          }}
                        >
                          {partner.name}
                        </Text>
                        <View
                          style={{
                            alignSelf: 'flex-start',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            backgroundColor: isActive
                              ? colors.teal + '20'
                              : colors.border,
                            borderWidth: 1,
                            borderColor: isActive
                              ? colors.teal + '50'
                              : colors.border,
                            borderRadius: 20,
                            marginTop: 4
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              color: isActive ? colors.teal : colors.label
                            }}
                          >
                            {partner.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {partner.status === 'Paused' ? (
                        <TouchableOpacity
                          onPress={() =>
                            settings.toggleDeliveryPartnerStatus(partner.id)
                          }
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            backgroundColor: colors.teal + '20',
                            borderWidth: 1,
                            borderColor: colors.teal + '50',
                            borderRadius: 8
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.teal,
                              fontWeight: '600'
                            }}
                          >
                            Activate
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 8
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.label,
                              fontWeight: '600'
                            }}
                          >
                            Configure
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Stats row */}
                  <View
                    style={{
                      flexDirection: 'row',
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingTop: 10
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 4
                        }}
                      >
                        Commission
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.heading,
                          fontWeight: '700'
                        }}
                      >
                        {partner.commission}%
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 4
                        }}
                      >
                        Orders
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.heading,
                          fontWeight: '700'
                        }}
                      >
                        {partner.orders}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 4
                        }}
                      >
                        Revenue
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.heading,
                          fontWeight: '700'
                        }}
                      >
                        ${partner.revenue.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        {/* ── Delivery Optimization ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          {/* Card header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <TrendingUp size={16} color={colors.teal} />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: colors.heading
              }}
            >
              Delivery Optimization
            </Text>
          </View>

          <View style={{ padding: 12, gap: 2 }}>
            {/* Batch Orders by Zone */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.heading,
                    fontWeight: '500'
                  }}
                >
                  Batch Orders by Zone
                </Text>
                <Text
                  style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                >
                  Group nearby orders for single delivery
                </Text>
              </View>
              <Switch
                checked={settings.batchOrdersByZone}
                onCheckedChange={v =>
                  settings.updateDeliverySettings({ batchOrdersByZone: v })
                }
              />
            </View>

            {/* Delay Orders to Batch */}
            <View
              style={{
                backgroundColor: colors.screen,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 8,
                gap: 4
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 4
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: '500'
                    }}
                  >
                    Delay Orders to Batch
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                  >
                    Wait for potential batch matches
                  </Text>
                </View>
                <Switch
                  checked={settings.delayOrdersToBatch}
                  onCheckedChange={v =>
                    settings.updateDeliverySettings({ delayOrdersToBatch: v })
                  }
                />
              </View>

              {settings.delayOrdersToBatch && (
                <View style={{ paddingTop: 8, gap: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.label,
                        fontWeight: '500'
                      }}
                    >
                      Max Delay
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.teal,
                        fontWeight: '700'
                      }}
                    >
                      {settings.maxBatchDelayMinutes} min
                    </Text>
                  </View>
                  <Slider
                    value={settings.maxBatchDelayMinutes}
                    min={0}
                    max={30}
                    step={1}
                    onValueChange={v =>
                      settings.updateDeliverySettings({
                        maxBatchDelayMinutes: v
                      })
                    }
                    width={280}
                  />
                  <Text
                    style={{ fontSize: 10, color: colors.teal, marginTop: 4 }}
                  >
                    Average Savings: $2.40 per order
                  </Text>
                </View>
              )}
            </View>

            {/* Prioritize Delivery Orders */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                marginTop: 4
              }}
            >
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.heading,
                    fontWeight: '500'
                  }}
                >
                  Prioritize Delivery Orders
                </Text>
                <Text
                  style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                >
                  Delivery orders prepared before dine-in
                </Text>
              </View>
              <Switch
                checked={settings.prioritizeDeliveryOrders}
                onCheckedChange={v =>
                  settings.updateDeliverySettings({
                    prioritizeDeliveryOrders: v
                  })
                }
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default DeliveryManagementScreen
