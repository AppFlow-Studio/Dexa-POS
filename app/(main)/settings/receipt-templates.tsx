import { TestPrintModal } from '@/components/settings/TestPrintModal'
import { Switch } from '@/components/ui/switch'
import { colors } from '@/lib/theme'
import { toastService } from '@/lib/toastService'
import { useReceiptTemplateStore } from '@/stores/useReceiptTemplateStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  DEFAULT_RECEIPT_TEMPLATE,
  ModifierStyle,
  ReceiptTemplateConfig
} from '@/types/receipt-template'
import {
  Barcode,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  GripVertical,
  Layers,
  MapPin,
  Printer,
  QrCode,
  TriangleAlert,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator
} from 'react-native-draggable-flatlist'

// ============================================================================
// TYPES
// ============================================================================

type TabType = 'receipt' | 'kitchen' | 'no_sale' | 'void_order' | 'time_sheet'

export type ReceiptSectionId =
  | 'logo'
  | 'storeInfo'
  | 'orderInfo'
  | 'items'
  | 'totals'
  | 'tipLine'
  | 'payment'
  | 'footer'
  | 'barcode'

export interface ReceiptSection {
  id: ReceiptSectionId
  label: string
}

const DEFAULT_RECEIPT_SECTION_ORDER: ReceiptSectionId[] = [
  'logo',
  'storeInfo',
  'orderInfo',
  'items',
  'totals',
  'tipLine',
  'payment',
  'footer',
  'barcode'
]

const RECEIPT_SECTION_LABELS: Record<ReceiptSectionId, string> = {
  logo: 'Logo',
  storeInfo: 'Store Info',
  orderInfo: 'Order Info',
  items: 'Items',
  totals: 'Totals',
  tipLine: 'Tip Line',
  payment: 'Payment',
  footer: 'Footer',
  barcode: 'Barcode / QR'
}

export type KitchenSectionId = 'header' | 'readyBy' | 'items' | 'footer'

export interface KitchenSection {
  id: KitchenSectionId
  label: string
}

const DEFAULT_KITCHEN_SECTION_ORDER: KitchenSectionId[] = [
  'header',
  'readyBy',
  'items',
  'footer'
]

const KITCHEN_SECTION_LABELS: Record<KitchenSectionId, string> = {
  header: 'Order Header',
  readyBy: 'Ready By Time',
  items: 'Items',
  footer: 'Item Count'
}

// ─── No Sale sections ───────────────────────────────────────────
export type NoSaleSectionId =
  | 'header'
  | 'storeInfo'
  | 'details'
  | 'reason'
  | 'footer'

export interface NoSaleSection {
  id: NoSaleSectionId
  label: string
}

const DEFAULT_NO_SALE_SECTION_ORDER: NoSaleSectionId[] = [
  'header',
  'storeInfo',
  'details',
  'reason',
  'footer'
]

const NO_SALE_SECTION_LABELS: Record<NoSaleSectionId, string> = {
  header: 'Header',
  storeInfo: 'Store Info',
  details: 'Details',
  reason: 'Reason',
  footer: 'Footer'
}

// ─── Void Order sections ────────────────────────────────────────
export type VoidOrderSectionId =
  | 'header'
  | 'storeInfo'
  | 'orderInfo'
  | 'items'
  | 'totals'
  | 'voidReason'
  | 'footer'

export interface VoidOrderSection {
  id: VoidOrderSectionId
  label: string
}

const DEFAULT_VOID_ORDER_SECTION_ORDER: VoidOrderSectionId[] = [
  'header',
  'storeInfo',
  'orderInfo',
  'items',
  'totals',
  'voidReason',
  'footer'
]

const VOID_ORDER_SECTION_LABELS: Record<VoidOrderSectionId, string> = {
  header: 'Header',
  storeInfo: 'Store Info',
  orderInfo: 'Order Info',
  items: 'Voided Items',
  totals: 'Totals',
  voidReason: 'Void Reason',
  footer: 'Footer'
}

// ─── Time Sheet sections ────────────────────────────────────────
export type TimeSheetSectionId =
  | 'header'
  | 'employeeInfo'
  | 'dateRange'
  | 'shifts'
  | 'totals'
  | 'footer'

export interface TimeSheetSection {
  id: TimeSheetSectionId
  label: string
}

const DEFAULT_TIME_SHEET_SECTION_ORDER: TimeSheetSectionId[] = [
  'header',
  'employeeInfo',
  'dateRange',
  'shifts',
  'totals',
  'footer'
]

const TIME_SHEET_SECTION_LABELS: Record<TimeSheetSectionId, string> = {
  header: 'Header',
  employeeInfo: 'Employee Info',
  dateRange: 'Date Range',
  shifts: 'Shifts',
  totals: 'Total Hours',
  footer: 'Footer'
}

// ============================================================================
// PRESET TEMPLATES
// ============================================================================

interface PresetDefinition {
  id: string
  label: string
  description: string
  overrides: Partial<ReceiptTemplateConfig>
}

const RECEIPT_PRESETS: PresetDefinition[] = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Clean and simple — just the essentials.',
    overrides: {
      showLogo: false,
      showBarcode: false,
      showQrCode: false,
      showTipLine: false,
      showTaxBreakdown: false,
      showItemModifiers: false,
      showServerName: false,
      headerText: null,
      footerText: null
    }
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced layout suitable for most restaurants.',
    overrides: {
      showLogo: false,
      showBarcode: false,
      showQrCode: false,
      showTipLine: true,
      showTaxBreakdown: true,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true
    }
  },
  {
    id: 'full',
    label: 'Full Detail',
    description: 'Everything visible — max information for customers.',
    overrides: {
      showLogo: false,
      showBarcode: false,
      showQrCode: false,
      showTipLine: true,
      showTaxBreakdown: true,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true
    }
  },
  {
    id: 'retail',
    label: 'Retail / Quick Service',
    description: 'No tip line, no server — fast and focused.',
    overrides: {
      showLogo: false,
      showBarcode: false,
      showQrCode: false,
      showTipLine: false,
      showTaxBreakdown: true,
      showItemModifiers: false,
      showServerName: false,
      showOrderType: false
    }
  }
]

const KITCHEN_PRESETS: PresetDefinition[] = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'Item names only — no mods, no extras. Fast reads.',
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: false,
      showServerName: false,
      showOrderType: false,
      groupByStation: false,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: false
    }
  },
  {
    id: 'standard_kitchen',
    label: 'Standard Kitchen',
    description: 'Balanced — mods on, station grouping, allergy alerts.',
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: true,
      groupByStation: true,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: false
    }
  },
  {
    id: 'large_text',
    label: 'Large Text',
    description:
      'Big bold items and mods — ideal for noisy, fast-paced kitchens.',
    overrides: {
      largeItemText: true,
      showModsLarge: true,
      showItemModifiers: true,
      showServerName: false,
      showOrderType: true,
      groupByStation: true,
      groupBySeat: false,
      showAllergyAlert: true,
      showReadyByTime: true
    }
  },
  {
    id: 'fine_dining',
    label: 'Fine Dining',
    description: 'Seat-by-seat view — perfect for plated service.',
    overrides: {
      largeItemText: false,
      showModsLarge: false,
      showItemModifiers: true,
      showServerName: true,
      showOrderType: false,
      groupByStation: false,
      groupBySeat: true,
      showAllergyAlert: true,
      showReadyByTime: true
    }
  }
]

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

function CollapsibleSection ({
  title,
  subtitle,
  defaultOpen = true,
  children
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={{ marginBottom: 4 }}>
      <TouchableOpacity
        onPress={() => setOpen(v => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
          paddingHorizontal: 10,
          marginTop: 6,
          borderRadius: 8,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.label,
              textTransform: 'uppercase',
              letterSpacing: 0.8
            }}
          >
            {title}
          </Text>
          {subtitle && !open ? (
            <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {open ? (
          <ChevronDown size={12} color={colors.muted} />
        ) : (
          <ChevronRight size={12} color={colors.muted} />
        )}
      </TouchableOpacity>
      {open && <View style={{ paddingTop: 4 }}>{children}</View>}
    </View>
  )
}

function ToggleRow ({
  label,
  subtitle,
  value,
  onToggle
}: {
  label: string
  subtitle?: string
  value: boolean
  onToggle: (val: boolean) => void
}) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 3,
        borderWidth: 1,
        borderColor: value ? colors.teal + '40' : colors.border,
        backgroundColor: value ? colors.teal + '0D' : colors.card
      }}
    >
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text
          style={{ fontSize: 13, color: colors.heading, fontWeight: '500' }}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </TouchableOpacity>
  )
}

function TextRow ({
  label,
  value,
  onChangeText,
  placeholder
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text
        style={{
          fontSize: 11,
          color: colors.muted,
          marginBottom: 3,
          paddingHorizontal: 2,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: '600'
        }}
      >
        {label}
      </Text>
      <TextInput
        style={{
          backgroundColor: colors.screen,
          color: colors.heading,
          fontSize: 13,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.muted}
      />
    </View>
  )
}

// ============================================================================
// PRESET PICKER MODAL
// ============================================================================

function PresetPickerModal ({
  visible,
  presets,
  onApply,
  onClose
}: {
  visible: boolean
  presets: PresetDefinition[]
  onApply: (overrides: Partial<ReceiptTemplateConfig>) => void
  onClose: () => void
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 40
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
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
                borderWidth: 1,
                borderColor: colors.teal + '40',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10
              }}
            >
              <Layers size={15} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Choose a Preset
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                One-tap template configuration
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                backgroundColor: colors.screen,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={13} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Preset list */}
          <View style={{ padding: 10 }}>
            {presets.map((preset, idx) => {
              const isLast = idx === presets.length - 1
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => {
                    onApply(preset.overrides)
                    onClose()
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.card,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    marginBottom: isLast ? 0 : 6
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {preset.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginTop: 1
                      }}
                    >
                      {preset.description}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Apply
                    </Text>
                    <ChevronRight
                      size={12}
                      color={colors.teal}
                      style={{ marginLeft: 2 }}
                    />
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Footer */}
          <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                backgroundColor: 'transparent'
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '500', color: colors.label }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ============================================================================
// COPY FROM LOCATION MODAL
// ============================================================================

function CopyFromLocationModal ({
  visible,
  currentLocationId,
  templateType,
  onApply,
  onClose
}: {
  visible: boolean
  currentLocationId: string
  templateType: string
  onApply: (config: ReceiptTemplateConfig) => void
  onClose: () => void
}) {
  const templates = useReceiptTemplateStore(s => s.templates)

  const otherTemplates = templates.filter(
    t => t.locationId !== currentLocationId && t.templateType === templateType
  )

  const typeLabel =
    templateType === 'kitchen'
      ? 'Kitchen Ticket'
      : templateType === 'no_sale'
      ? 'No Sale'
      : templateType === 'void_order'
      ? 'Void Order'
      : templateType === 'time_sheet'
      ? 'Time Sheet'
      : 'Sale Receipt'

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 40
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: 10
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: colors.teal + '15',
                borderWidth: 1,
                borderColor: colors.teal + '40',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Copy size={15} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Copy from Location
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                Import {typeLabel} settings
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                backgroundColor: colors.screen,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={13} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={{ padding: 10 }}>
            {otherTemplates.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8
                  }}
                >
                  <MapPin size={16} color={colors.muted} />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.label,
                    textAlign: 'center'
                  }}
                >
                  No other locations found
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    textAlign: 'center',
                    marginTop: 3,
                    lineHeight: 16
                  }}
                >
                  Save a template at another location{'\n'}for it to appear
                  here.
                </Text>
              </View>
            ) : (
              <View>
                {otherTemplates.map((tmpl, idx) => {
                  const locationName = tmpl.templateName || 'Location'
                  const initials = locationName.slice(0, 2).toUpperCase()
                  const isLast = idx === otherTemplates.length - 1
                  return (
                    <TouchableOpacity
                      key={tmpl.id}
                      onPress={() => {
                        onApply(tmpl)
                        onClose()
                      }}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        marginBottom: isLast ? 0 : 6,
                        gap: 10
                      }}
                    >
                      {/* Location icon box */}
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: colors.teal + '15',
                          borderWidth: 1,
                          borderColor: colors.teal + '40',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <MapPin size={15} color={colors.teal} />
                      </View>
                      {/* Info */}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: colors.heading
                          }}
                        >
                          {locationName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.muted,
                            marginTop: 1
                          }}
                        >
                          {typeLabel} template
                        </Text>
                      </View>
                      {/* Apply */}
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: colors.teal
                          }}
                        >
                          Apply
                        </Text>
                        <ChevronRight
                          size={12}
                          color={colors.teal}
                          style={{ marginLeft: 2 }}
                        />
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                backgroundColor: 'transparent'
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: '500', color: colors.label }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ============================================================================
// RECEIPT PAPER WRAPPER
// ============================================================================

function ReceiptPaper ({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 14,
        marginHorizontal: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 4
      }}
    >
      {children}
    </View>
  )
}

function DottedLine () {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderStyle: 'dashed',
        borderTopColor: '#d1d5db',
        marginVertical: 6
      }}
    />
  )
}

function DoubleLine () {
  return (
    <View
      style={{
        borderTopWidth: 1.5,
        borderTopColor: '#9ca3af',
        marginVertical: 6
      }}
    />
  )
}

// ============================================================================
// RECEIPT PREVIEW (draggable sections)
// ============================================================================

function renderReceiptSection (
  sectionId: ReceiptSectionId,
  config: ReceiptTemplateConfig,
  storeName: string,
  storeAddress: string,
  storePhone: string
): React.ReactNode {
  switch (sectionId) {
    case 'logo':
      return config.showLogo ? (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              width: 36,
              height: 36,
              backgroundColor: '#e5e7eb',
              borderRadius: 6,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ fontSize: 8, color: '#9ca3af', fontWeight: '700' }}>
              LOGO
            </Text>
          </View>
        </View>
      ) : null
    case 'storeInfo':
      return (
        <View>
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '700',
              fontSize: 12
            }}
          >
            {storeName || '—'}
          </Text>
          {storeAddress ? (
            <Text
              style={{
                color: '#6b7280',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 1
              }}
            >
              {storeAddress}
            </Text>
          ) : null}
          {storePhone ? (
            <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 9 }}>
              {storePhone}
            </Text>
          ) : null}
          {config.headerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 3
              }}
            >
              {config.headerText}
            </Text>
          ) : null}
          <DoubleLine />
        </View>
      )
    case 'orderInfo':
      return (
        <View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Order #1042</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>01/15/2026</Text>
          </View>
          {config.showOrderType && (
            <Text style={{ color: '#6b7280', fontSize: 9, marginTop: 1 }}>
              Dine In - Table 5
            </Text>
          )}
          {config.showServerName && (
            <Text style={{ color: '#6b7280', fontSize: 9 }}>
              Server: Sarah M.
            </Text>
          )}
          <DottedLine />
        </View>
      )
    case 'items':
      return (
        <View>
          <View style={{ gap: 3 }}>
            {config.groupBySeat ? (
              <>
                <Text
                  style={{
                    color: '#6b7280',
                    fontSize: 8,
                    textAlign: 'center',
                    fontWeight: '700'
                  }}
                >
                  -- SEAT 1 --
                </Text>
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#d1d5db',
                    marginVertical: 2
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    1x Cheeseburger
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$12.99</Text>
                </View>
                {config.showItemModifiers && (
                  <Text
                    style={{ color: '#6b7280', fontSize: 8, marginLeft: 8 }}
                  >
                    + Extra Cheese, No Onions
                  </Text>
                )}
                <Text
                  style={{
                    color: '#6b7280',
                    fontSize: 8,
                    textAlign: 'center',
                    fontWeight: '700',
                    marginTop: 4
                  }}
                >
                  -- SEAT 2 --
                </Text>
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#d1d5db',
                    marginVertical: 2
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    1x Caesar Salad
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$9.50</Text>
                </View>
                {config.showItemModifiers && (
                  <Text
                    style={{ color: '#6b7280', fontSize: 8, marginLeft: 8 }}
                  >
                    + Grilled Chicken
                  </Text>
                )}
                <Text
                  style={{
                    color: '#6b7280',
                    fontSize: 8,
                    textAlign: 'center',
                    fontWeight: '700',
                    marginTop: 4
                  }}
                >
                  -- SHARED --
                </Text>
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#d1d5db',
                    marginVertical: 2
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    2x Iced Tea
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$5.98</Text>
                </View>
              </>
            ) : (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    1x Cheeseburger
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$12.99</Text>
                </View>
                {config.showItemModifiers && (
                  <Text
                    style={{ color: '#6b7280', fontSize: 8, marginLeft: 8 }}
                  >
                    + Extra Cheese, No Onions
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    1x Caesar Salad
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$9.50</Text>
                </View>
                {config.showItemModifiers && (
                  <Text
                    style={{ color: '#6b7280', fontSize: 8, marginLeft: 8 }}
                  >
                    + Grilled Chicken
                  </Text>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    2x Iced Tea
                  </Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>$5.98</Text>
                </View>
              </>
            )}
          </View>
          <DottedLine />
        </View>
      )
    case 'totals':
      return (
        <View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Subtotal</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>$28.47</Text>
          </View>
          {config.showTaxBreakdown && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 2
              }}
            >
              <Text style={{ color: '#6b7280', fontSize: 9 }}>Tax (8.25%)</Text>
              <Text style={{ color: '#6b7280', fontSize: 9 }}>$2.35</Text>
            </View>
          )}
          <DoubleLine />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 11, fontWeight: '700' }}>
              Total
            </Text>
            <Text style={{ color: '#111827', fontSize: 11, fontWeight: '700' }}>
              $30.82
            </Text>
          </View>
        </View>
      )
    case 'tipLine':
      return config.showTipLine ? (
        <View>
          <DottedLine />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Tip:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>________</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 3
            }}
          >
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              Total w/ Tip:
            </Text>
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              ________
            </Text>
          </View>
        </View>
      ) : null
    case 'payment':
      return (
        <View>
          <DottedLine />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Paid: Card</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>$30.82</Text>
          </View>
          <Text style={{ color: '#6b7280', fontSize: 8, marginTop: 1 }}>
            Visa ending in 4242
          </Text>
        </View>
      )
    case 'footer':
      return config.footerText ? (
        <View>
          <DottedLine />
          <Text style={{ color: '#111827', textAlign: 'center', fontSize: 9 }}>
            {config.footerText}
          </Text>
        </View>
      ) : null
    case 'barcode':
      return config.showBarcode || config.showQrCode ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            marginTop: 8
          }}
        >
          {config.showBarcode && (
            <Barcode size={28} color='#9ca3af' strokeWidth={1.5} />
          )}
          {config.showQrCode && (
            <QrCode size={28} color='#9ca3af' strokeWidth={1.5} />
          )}
        </View>
      ) : null
    default:
      return null
  }
}

function ReceiptPreview ({
  config,
  storeName,
  storeAddress,
  storePhone,
  sectionOrder,
  onReorder
}: {
  config: ReceiptTemplateConfig
  storeName: string
  storeAddress: string
  storePhone: string
  sectionOrder: ReceiptSectionId[]
  onReorder: (newOrder: ReceiptSectionId[]) => void
}) {
  const sections: ReceiptSection[] = sectionOrder.map(id => ({
    id,
    label: RECEIPT_SECTION_LABELS[id]
  }))

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ReceiptSection>) => {
      const content = renderReceiptSection(item.id, config, storeName, storeAddress, storePhone)
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isActive ? '#f0fdf4' : 'transparent',
              borderRadius: 4,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? '#86efac' : 'transparent',
              paddingLeft: 2
            }}
          >
            {/* Grip handle */}
            <View
              style={{
                width: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                flexShrink: 0
              }}
            >
              <GripVertical
                size={12}
                color={isActive ? '#4ade80' : '#d1d5db'}
              />
            </View>

            {/* Section content */}
            <View style={{ flex: 1 }}>
              {content !== null ? (
                content
              ) : (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    marginVertical: 1,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <Text
                    style={{
                      color: '#d1d5db',
                      fontSize: 8,
                      textAlign: 'center'
                    }}
                  >
                    {item.label} (hidden)
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      )
    },
    [config, storeName, storeAddress, storePhone]
  )

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map(s => s.id))}
        scrollEnabled={false}
        activationDistance={5}
      />
    </ReceiptPaper>
  )
}

// ============================================================================
// KITCHEN PREVIEW
// ============================================================================

const GRILL_ITEMS = [
  {
    qty: 2,
    name: 'Cheeseburger',
    mods: ['+ Extra Cheese', '- No Onions'],
    allergy: 'Dairy',
    seat: 1
  },
  { qty: 1, name: 'Veggie Wrap', mods: ['+ Avocado'], allergy: null, seat: 3 }
]
const SALAD_ITEMS = [
  {
    qty: 1,
    name: 'Caesar Salad',
    mods: ['+ Grilled Chicken'],
    allergy: null,
    seat: 2
  }
]

function renderKitchenSection (
  sectionId: KitchenSectionId,
  config: ReceiptTemplateConfig
): React.ReactNode {
  const itemFontSize = config.largeItemText ? 13 : 10
  const modFontSize = config.showModsLarge ? 12 : 9

  const renderOrderItem = (
    item: {
      qty: number
      name: string
      mods: string[]
      allergy: string | null
      seat: number
    },
    idx: number
  ) => (
    <View key={idx} style={{ marginTop: idx > 0 ? 6 : 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        {config.groupBySeat && (
          <Text
            style={{
              color: '#9ca3af',
              fontSize: 8,
              fontWeight: '600',
              marginRight: 3
            }}
          >
            S{item.seat}
          </Text>
        )}
        <Text
          style={{
            color: '#111827',
            fontWeight: '700',
            fontSize: itemFontSize
          }}
        >
          {item.qty}x {item.name}
        </Text>
      </View>
      {config.showItemModifiers &&
        item.mods.map((m, i) => {
          const modStyle = config.modifierStyle ?? 'inverted'
          const modTextStyle: any = {
            fontSize: modFontSize,
            marginLeft: 10,
            fontWeight: '700'
          }
          if (modStyle === 'inverted') {
            modTextStyle.backgroundColor = '#111827'
            modTextStyle.color = '#FFFFFF'
            modTextStyle.paddingHorizontal = 3
            modTextStyle.borderRadius = 2
            modTextStyle.alignSelf = 'flex-start'
          } else if (modStyle === 'red') {
            modTextStyle.color = '#dc2626'
          } else {
            modTextStyle.color = '#4b5563'
          }
          return (
            <Text key={i} style={modTextStyle}>
              {m}
            </Text>
          )
        })}
      {config.showAllergyAlert && item.allergy && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: 10,
            marginTop: 2
          }}
        >
          <TriangleAlert size={9} color='#dc2626' />
          <Text
            style={{
              color: '#dc2626',
              fontWeight: '700',
              fontSize: 8,
              marginLeft: 3
            }}
          >
            ALLERGY: {item.allergy}
          </Text>
        </View>
      )}
    </View>
  )

  const StationBanner = ({ label }: { label: string }) => (
    <View
      style={{
        backgroundColor: '#e5e7eb',
        marginHorizontal: -12,
        paddingHorizontal: 12,
        paddingVertical: 2,
        marginBottom: 5,
        marginTop: 2
      }}
    >
      <Text
        style={{
          textAlign: 'center',
          fontWeight: '900',
          fontSize: 8,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: '#111827'
        }}
      >
        ▶ {label}
      </Text>
    </View>
  )

  switch (sectionId) {
    case 'header':
      return (
        <View>
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '900',
              fontSize: 13,
              letterSpacing: 1
            }}
          >
            ORDER #1042
          </Text>
          {config.showOrderType && (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontWeight: '700',
                fontSize: 8,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginTop: 1
              }}
            >
              Dine In — Table 5
            </Text>
          )}
          {config.showServerName && (
            <Text
              style={{
                color: '#6b7280',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 1
              }}
            >
              Server: Sarah M.
            </Text>
          )}
          <Text
            style={{
              color: '#9ca3af',
              textAlign: 'center',
              fontSize: 8,
              marginTop: 1
            }}
          >
            01/15/2026 12:34 PM
          </Text>
          <DoubleLine />
        </View>
      )
    case 'readyBy':
      return config.showReadyByTime ? (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#111827',
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 3
            }}
          >
            <Clock size={8} color='#fff' />
            <Text
              style={{
                color: '#fff',
                fontSize: 9,
                fontWeight: '700',
                marginLeft: 4
              }}
            >
              Ready by: 12:49 PM
            </Text>
          </View>
        </View>
      ) : null
    case 'items':
      return (
        <View>
          {config.groupByStation ? (
            <View>
              <StationBanner label='Grill' />
              <View style={{ marginBottom: 6 }}>
                {GRILL_ITEMS.map(renderOrderItem)}
              </View>
              <DottedLine />
              <StationBanner label='Salad' />
              <View>{SALAD_ITEMS.map(renderOrderItem)}</View>
            </View>
          ) : (
            <View>{[...GRILL_ITEMS, ...SALAD_ITEMS].map(renderOrderItem)}</View>
          )}
          <DoubleLine />
        </View>
      )
    case 'footer':
      return (
        <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 8 }}>
          3 items total
        </Text>
      )
    default:
      return null
  }
}

function KitchenPreview ({
  config,
  sectionOrder,
  onReorder
}: {
  config: ReceiptTemplateConfig
  storeName: string
  sectionOrder: KitchenSectionId[]
  onReorder: (newOrder: KitchenSectionId[]) => void
}) {
  const sections: KitchenSection[] = sectionOrder.map(id => ({
    id,
    label: KITCHEN_SECTION_LABELS[id]
  }))

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<KitchenSection>) => {
      const content = renderKitchenSection(item.id, config)
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isActive ? '#f0fdf4' : 'transparent',
              borderRadius: 4,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? '#86efac' : 'transparent',
              paddingLeft: 2
            }}
          >
            <View
              style={{
                width: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                flexShrink: 0
              }}
            >
              <GripVertical
                size={12}
                color={isActive ? '#4ade80' : '#d1d5db'}
              />
            </View>
            <View style={{ flex: 1 }}>
              {content !== null ? (
                content
              ) : (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    marginVertical: 1,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <Text
                    style={{
                      color: '#d1d5db',
                      fontSize: 8,
                      textAlign: 'center'
                    }}
                  >
                    {item.label} (hidden)
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      )
    },
    [config]
  )

  // Sample data used for the preview
  const grillItems = [
    {
      qty: 2,
      name: 'Cheeseburger',
      mods: ['+ Extra Cheese', '- No Onions'],
      allergy: 'Dairy',
      seat: 1
    },
    { qty: 1, name: 'Veggie Wrap', mods: ['+ Avocado'], allergy: null, seat: 3 }
  ]
  const saladItems = [
    {
      qty: 1,
      name: 'Caesar Salad',
      mods: ['+ Grilled Chicken'],
      allergy: null,
      seat: 2
    }
  ]

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map(s => s.id))}
        scrollEnabled={false}
        activationDistance={5}
      />
    </ReceiptPaper>
  )
}

// ============================================================================
// NO SALE PREVIEW
// ============================================================================

function renderNoSaleSection (
  sectionId: NoSaleSectionId,
  config: ReceiptTemplateConfig,
  storeName: string,
  storeAddress: string,
  storePhone: string
): React.ReactNode {
  switch (sectionId) {
    case 'header':
      return (
        <View>
          {config.headerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginBottom: 2
              }}
            >
              {config.headerText}
            </Text>
          ) : null}
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '900',
              fontSize: 14,
              letterSpacing: 1
            }}
          >
            ** NO SALE **
          </Text>
          <DoubleLine />
        </View>
      )
    case 'storeInfo':
      return (
        <View>
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '700',
              fontSize: 11
            }}
          >
            {storeName || '—'}
          </Text>
          {storeAddress ? (
            <Text
              style={{
                color: '#6b7280',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 1
              }}
            >
              {storeAddress}
            </Text>
          ) : null}
          {storePhone ? (
            <Text
              style={{
                color: '#6b7280',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 1
              }}
            >
              {storePhone}
            </Text>
          ) : null}
          <DottedLine />
        </View>
      )
    case 'details':
      return (
        <View style={{ gap: 2 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Date:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>01/15/2026</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Time:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>12:34:56</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Employee:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>Sarah M.</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Drawer:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>Drawer 1</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Station:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>POS-01</Text>
          </View>
        </View>
      )
    case 'reason':
      return (
        <View style={{ marginTop: 4 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              Reason:
            </Text>
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              Making Change
            </Text>
          </View>
          {config.showApprovedBy && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 2
              }}
            >
              <Text style={{ color: '#111827', fontSize: 9 }}>
                Approved By:
              </Text>
              <Text style={{ color: '#111827', fontSize: 9 }}>
                Manager Jane
              </Text>
            </View>
          )}
        </View>
      )
    case 'footer':
      return (
        <View>
          <DoubleLine />
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontSize: 9,
              fontWeight: '700'
            }}
          >
            NOT A TRANSACTION
          </Text>
          {config.footerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 3
              }}
            >
              {config.footerText}
            </Text>
          ) : null}
        </View>
      )
    default:
      return null
  }
}

function NoSalePreview ({
  config,
  storeName,
  storeAddress,
  storePhone,
  sectionOrder,
  onReorder
}: {
  config: ReceiptTemplateConfig
  storeName: string
  storeAddress: string
  storePhone: string
  sectionOrder: NoSaleSectionId[]
  onReorder: (newOrder: NoSaleSectionId[]) => void
}) {
  const sections: NoSaleSection[] = sectionOrder.map(id => ({
    id,
    label: NO_SALE_SECTION_LABELS[id]
  }))

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<NoSaleSection>) => {
      const content = renderNoSaleSection(item.id, config, storeName, storeAddress, storePhone)
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isActive ? '#f0fdf4' : 'transparent',
              borderRadius: 4,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? '#86efac' : 'transparent',
              paddingLeft: 2
            }}
          >
            <View
              style={{
                width: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                flexShrink: 0
              }}
            >
              <GripVertical
                size={12}
                color={isActive ? '#4ade80' : '#d1d5db'}
              />
            </View>
            <View style={{ flex: 1 }}>
              {content !== null ? (
                content
              ) : (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    marginVertical: 1,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <Text
                    style={{
                      color: '#d1d5db',
                      fontSize: 8,
                      textAlign: 'center'
                    }}
                  >
                    {item.label} (hidden)
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      )
    },
    [config, storeName, storeAddress, storePhone]
  )

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map(s => s.id))}
        scrollEnabled={false}
        activationDistance={5}
      />
    </ReceiptPaper>
  )
}

// ============================================================================
// VOID ORDER PREVIEW
// ============================================================================

function renderVoidOrderSection (
  sectionId: VoidOrderSectionId,
  config: ReceiptTemplateConfig,
  storeName: string,
  storeAddress: string,
  storePhone: string
): React.ReactNode {
  switch (sectionId) {
    case 'header':
      return (
        <View>
          {config.headerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginBottom: 2
              }}
            >
              {config.headerText}
            </Text>
          ) : null}
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '900',
              fontSize: 14,
              letterSpacing: 1
            }}
          >
            ** VOID ORDER **
          </Text>
          <DoubleLine />
        </View>
      )
    case 'storeInfo':
      return (
        <View>
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '700',
              fontSize: 11
            }}
          >
            {storeName || '—'}
          </Text>
          {storeAddress ? (
            <Text
              style={{
                color: '#6b7280',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 1
              }}
            >
              {storeAddress}
            </Text>
          ) : null}
          {storePhone ? (
            <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 9 }}>
              {storePhone}
            </Text>
          ) : null}
          <DottedLine />
        </View>
      )
    case 'orderInfo':
      return (
        <View style={{ gap: 2 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Order:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>#1042</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Date:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>01/15/2026</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Time:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>12:34:56</Text>
          </View>
          {config.showServerName && (
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ color: '#111827', fontSize: 9 }}>Server:</Text>
              <Text style={{ color: '#111827', fontSize: 9 }}>Sarah M.</Text>
            </View>
          )}
          <DottedLine />
        </View>
      )
    case 'items':
      return (
        <View style={{ gap: 3 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>
              1x Cheeseburger
            </Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>$12.99</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>
              1x Caesar Salad
            </Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>$9.50</Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>2x Iced Tea</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>$5.98</Text>
          </View>
          <DottedLine />
        </View>
      )
    case 'totals':
      return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#111827', fontSize: 10, fontWeight: '700' }}>
            Subtotal:
          </Text>
          <Text style={{ color: '#111827', fontSize: 10, fontWeight: '700' }}>
            $28.47
          </Text>
        </View>
      )
    case 'voidReason':
      return (
        <View style={{ marginTop: 4 }}>
          {config.showVoidReason && (
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text
                style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}
              >
                Reason:
              </Text>
              <Text
                style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}
              >
                Guest left
              </Text>
            </View>
          )}
          {config.showApprovedBy && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 2
              }}
            >
              <Text style={{ color: '#111827', fontSize: 9 }}>
                Approved By:
              </Text>
              <Text style={{ color: '#111827', fontSize: 9 }}>
                Manager Jane
              </Text>
            </View>
          )}
        </View>
      )
    case 'footer':
      return (
        <View>
          <DoubleLine />
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontSize: 9,
              fontWeight: '700'
            }}
          >
            THIS ORDER HAS BEEN VOIDED
          </Text>
          {config.footerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 3
              }}
            >
              {config.footerText}
            </Text>
          ) : null}
        </View>
      )
    default:
      return null
  }
}

function VoidOrderPreview ({
  config,
  storeName,
  storeAddress,
  storePhone,
  sectionOrder,
  onReorder
}: {
  config: ReceiptTemplateConfig
  storeName: string
  storeAddress: string
  storePhone: string
  sectionOrder: VoidOrderSectionId[]
  onReorder: (newOrder: VoidOrderSectionId[]) => void
}) {
  const sections: VoidOrderSection[] = sectionOrder.map(id => ({
    id,
    label: VOID_ORDER_SECTION_LABELS[id]
  }))

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<VoidOrderSection>) => {
      const content = renderVoidOrderSection(item.id, config, storeName, storeAddress, storePhone)
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isActive ? '#f0fdf4' : 'transparent',
              borderRadius: 4,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? '#86efac' : 'transparent',
              paddingLeft: 2
            }}
          >
            <View
              style={{
                width: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                flexShrink: 0
              }}
            >
              <GripVertical
                size={12}
                color={isActive ? '#4ade80' : '#d1d5db'}
              />
            </View>
            <View style={{ flex: 1 }}>
              {content !== null ? (
                content
              ) : (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    marginVertical: 1,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <Text
                    style={{
                      color: '#d1d5db',
                      fontSize: 8,
                      textAlign: 'center'
                    }}
                  >
                    {item.label} (hidden)
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      )
    },
    [config, storeName, storeAddress, storePhone]
  )

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map(s => s.id))}
        scrollEnabled={false}
        activationDistance={5}
      />
    </ReceiptPaper>
  )
}

// ============================================================================
// TIME SHEET PREVIEW
// ============================================================================

const SAMPLE_SHIFTS = [
  {
    date: '01/13/2026',
    inT: '08:02 AM',
    outT: '04:08 PM',
    breakIn: '12:00 PM',
    breakOut: '12:30 PM',
    hours: 7.6
  },
  {
    date: '01/14/2026',
    inT: '08:00 AM',
    outT: '05:00 PM',
    breakIn: 'N/A',
    breakOut: 'N/A',
    hours: 9.0
  },
  {
    date: '01/15/2026',
    inT: '07:55 AM',
    outT: '03:45 PM',
    breakIn: '12:15 PM',
    breakOut: '12:45 PM',
    hours: 7.3
  }
]

function renderTimeSheetSection (
  sectionId: TimeSheetSectionId,
  config: ReceiptTemplateConfig,
  storeName: string
): React.ReactNode {
  switch (sectionId) {
    case 'header':
      return (
        <View>
          {config.headerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginBottom: 2
              }}
            >
              {config.headerText}
            </Text>
          ) : null}
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '900',
              fontSize: 14,
              letterSpacing: 1
            }}
          >
            ** TIME SHEET **
          </Text>
          <DoubleLine />
        </View>
      )
    case 'employeeInfo':
      return (
        <View>
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontWeight: '700',
              fontSize: 11
            }}
          >
            {storeName || '—'}
          </Text>
          <DottedLine />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              Employee:
            </Text>
            <Text style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}>
              Sarah M.
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 2
            }}
          >
            <Text style={{ color: '#111827', fontSize: 9 }}>Role:</Text>
            <Text style={{ color: '#111827', fontSize: 9 }}>Server</Text>
          </View>
        </View>
      )
    case 'dateRange':
      return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#111827', fontSize: 9 }}>Period:</Text>
          <Text style={{ color: '#111827', fontSize: 9 }}>01/13 – 01/15</Text>
        </View>
      )
    case 'shifts':
      return (
        <View>
          <DottedLine />
          {SAMPLE_SHIFTS.map((s, idx) => (
            <View key={idx} style={{ marginTop: idx > 0 ? 4 : 0 }}>
              <Text
                style={{ color: '#111827', fontSize: 9, fontWeight: '700' }}
              >
                {s.date}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between'
                }}
              >
                <Text style={{ color: '#6b7280', fontSize: 9 }}> In:</Text>
                <Text style={{ color: '#111827', fontSize: 9 }}>{s.inT}</Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between'
                }}
              >
                <Text style={{ color: '#6b7280', fontSize: 9 }}> Out:</Text>
                <Text style={{ color: '#111827', fontSize: 9 }}>{s.outT}</Text>
              </View>
              {config.showBreakDetails && s.breakIn !== 'N/A' && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between'
                  }}
                >
                  <Text style={{ color: '#6b7280', fontSize: 9 }}> Break:</Text>
                  <Text style={{ color: '#111827', fontSize: 9 }}>
                    {s.breakIn}-{s.breakOut}
                  </Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between'
                }}
              >
                <Text style={{ color: '#6b7280', fontSize: 9 }}> Total:</Text>
                <Text style={{ color: '#111827', fontSize: 9 }}>
                  {s.hours.toFixed(2)} h
                </Text>
              </View>
            </View>
          ))}
        </View>
      )
    case 'totals':
      return (
        <View>
          <DoubleLine />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#111827', fontSize: 12, fontWeight: '900' }}>
              TOTAL HOURS:
            </Text>
            <Text style={{ color: '#111827', fontSize: 12, fontWeight: '900' }}>
              23.90 h
            </Text>
          </View>
          <DoubleLine />
        </View>
      )
    case 'footer':
      return (
        <View style={{ marginTop: 2 }}>
          <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 8 }}>
            Printed: 01/15/2026 03:50 PM
          </Text>
          {config.footerText ? (
            <Text
              style={{
                color: '#111827',
                textAlign: 'center',
                fontSize: 9,
                marginTop: 3
              }}
            >
              {config.footerText}
            </Text>
          ) : null}
        </View>
      )
    default:
      return null
  }
}

function TimeSheetPreview ({
  config,
  storeName,
  sectionOrder,
  onReorder
}: {
  config: ReceiptTemplateConfig
  storeName: string
  sectionOrder: TimeSheetSectionId[]
  onReorder: (newOrder: TimeSheetSectionId[]) => void
}) {
  const sections: TimeSheetSection[] = sectionOrder.map(id => ({
    id,
    label: TIME_SHEET_SECTION_LABELS[id]
  }))

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<TimeSheetSection>) => {
      const content = renderTimeSheetSection(item.id, config, storeName)
      return (
        <ScaleDecorator activeScale={1.02}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isActive ? '#f0fdf4' : 'transparent',
              borderRadius: 4,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? '#86efac' : 'transparent',
              paddingLeft: 2
            }}
          >
            <View
              style={{
                width: 16,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                flexShrink: 0
              }}
            >
              <GripVertical
                size={12}
                color={isActive ? '#4ade80' : '#d1d5db'}
              />
            </View>
            <View style={{ flex: 1 }}>
              {content !== null ? (
                content
              ) : (
                <View
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 6,
                    marginVertical: 1,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <Text
                    style={{
                      color: '#d1d5db',
                      fontSize: 8,
                      textAlign: 'center'
                    }}
                  >
                    {item.label} (hidden)
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      )
    },
    [config, storeName]
  )

  return (
    <ReceiptPaper>
      <DraggableFlatList
        data={sections}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorder(data.map(s => s.id))}
        scrollEnabled={false}
        activationDistance={5}
      />
    </ReceiptPaper>
  )
}

// ============================================================================
// MAIN SCREEN
// ============================================================================

const ReceiptTemplatesScreen = () => {
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const organizationLogoUrl = useStoreSettingsStore(s => s.organizationLogoUrl)
  const storeName = selectedStore?.name ?? 'My Store'
  const storeAddress = selectedStore
    ? [
        selectedStore.address_line1,
        selectedStore.address_line2,
        [selectedStore.city, selectedStore.state, selectedStore.postal_code]
          .filter(Boolean)
          .join(' ')
          .trim()
      ]
        .filter(p => p && p.trim().length > 0)
        .join(', ')
    : ''
  const storePhone = selectedStore?.phone ?? ''
  const locationId = selectedStore?.id ?? ''
  const merchantId = selectedStore?.merchant_id ?? ''

  const templates = useReceiptTemplateStore(s => s.templates)
  const isSaving = useReceiptTemplateStore(s => s.isSaving)
  const saveTemplate = useReceiptTemplateStore(s => s.saveTemplate)
  const cacheLogoBase64 = useReceiptTemplateStore(s => s.cacheLogoBase64)

  const [activeTab, setActiveTab] = useState<TabType>('receipt')
  const [showTestPrint, setShowTestPrint] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showCopyFrom, setShowCopyFrom] = useState(false)
  const [sectionOrder, setSectionOrder] = useState<ReceiptSectionId[]>(
    DEFAULT_RECEIPT_SECTION_ORDER
  )
  const [kitchenSectionOrder, setKitchenSectionOrder] = useState<
    KitchenSectionId[]
  >(DEFAULT_KITCHEN_SECTION_ORDER)
  const [noSaleSectionOrder, setNoSaleSectionOrder] = useState<
    NoSaleSectionId[]
  >(DEFAULT_NO_SALE_SECTION_ORDER)
  const [voidOrderSectionOrder, setVoidOrderSectionOrder] = useState<
    VoidOrderSectionId[]
  >(DEFAULT_VOID_ORDER_SECTION_ORDER)
  const [timeSheetSectionOrder, setTimeSheetSectionOrder] = useState<
    TimeSheetSectionId[]
  >(DEFAULT_TIME_SHEET_SECTION_ORDER)

  const storedTemplate = useMemo(() => {
    const match = templates.find(
      t => t.locationId === locationId && t.templateType === activeTab
    )
    return match ?? { ...DEFAULT_RECEIPT_TEMPLATE, templateType: activeTab }
  }, [templates, locationId, activeTab])

  const [localConfig, setLocalConfig] =
    useState<ReceiptTemplateConfig>(storedTemplate)

  useEffect(() => {
    setLocalConfig(storedTemplate)
  }, [storedTemplate])

  useEffect(() => {
    if (organizationLogoUrl) {
      cacheLogoBase64(organizationLogoUrl)
    }
  }, [organizationLogoUrl, cacheLogoBase64])

  const hasChanges = useMemo(() => {
    return JSON.stringify(localConfig) !== JSON.stringify(storedTemplate)
  }, [localConfig, storedTemplate])

  const updateField = useCallback(
    <K extends keyof ReceiptTemplateConfig>(
      key: K,
      value: ReceiptTemplateConfig[K]
    ) => {
      setLocalConfig(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  const applyPreset = useCallback(
    (overrides: Partial<ReceiptTemplateConfig>) => {
      setLocalConfig(prev => ({ ...prev, ...overrides }))
      toastService.show({
        title: 'Preset applied',
        message: 'Review and save when ready.',
        type: 'info'
      })
    },
    []
  )

  const applyFromLocation = useCallback((config: ReceiptTemplateConfig) => {
    setLocalConfig(prev => ({
      ...config,
      id: prev.id,
      merchantId: prev.merchantId,
      locationId: prev.locationId,
      templateType: prev.templateType
    }))
    toastService.show({
      title: 'Copied',
      message: 'Settings copied. Save to apply.',
      type: 'info'
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!locationId || !merchantId) {
      toastService.show({
        title: 'Error',
        message: 'No store selected',
        type: 'error'
      })
      return
    }

    const result = await saveTemplate(localConfig, merchantId, locationId)
    if (result.success) {
      toastService.show({
        title: 'Saved',
        message: 'Receipt template saved successfully',
        type: 'success'
      })
    } else {
      toastService.show({
        title: 'Error',
        message: result.error ?? 'Failed to save template',
        type: 'error'
      })
    }
  }, [localConfig, merchantId, locationId, saveTemplate])

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Tab Bar — underline style */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingTop: 12,
          gap: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        {(
          [
            'receipt',
            'kitchen',
            'no_sale',
            'void_order',
            'time_sheet'
          ] as TabType[]
        ).map(tab => {
          const active = activeTab === tab
          const label =
            tab === 'receipt'
              ? 'Sale Receipt'
              : tab === 'kitchen'
              ? 'Kitchen Ticket'
              : tab === 'no_sale'
              ? 'No Sale'
              : tab === 'void_order'
              ? 'Void Order'
              : 'Time Sheet'
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                setActiveTab(tab)
                if (tab === 'receipt')
                  setSectionOrder(DEFAULT_RECEIPT_SECTION_ORDER)
                if (tab === 'kitchen')
                  setKitchenSectionOrder(DEFAULT_KITCHEN_SECTION_ORDER)
                if (tab === 'no_sale')
                  setNoSaleSectionOrder(DEFAULT_NO_SALE_SECTION_ORDER)
                if (tab === 'void_order')
                  setVoidOrderSectionOrder(DEFAULT_VOID_ORDER_SECTION_ORDER)
                if (tab === 'time_sheet')
                  setTimeSheetSectionOrder(DEFAULT_TIME_SHEET_SECTION_ORDER)
              }}
              style={{
                paddingHorizontal: 14,
                paddingBottom: 10,
                paddingTop: 2,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.teal : 'transparent'
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: active ? colors.teal : colors.label
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Main Content: Preview + Settings side by side */}
      <View style={{ flex: 1, flexDirection: 'row', padding: 14, gap: 12 }}>
        {/* Preview Panel */}
        <View
          style={{
            flex: 4,
            backgroundColor: colors.screen,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: colors.label,
                textTransform: 'uppercase',
                letterSpacing: 0.8
              }}
            >
              Live Preview
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.screen,
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <GripVertical size={10} color={colors.muted} />
              <Text style={{ fontSize: 9, color: colors.muted, marginLeft: 3 }}>
                Long-press to reorder
              </Text>
            </View>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {activeTab === 'receipt' ? (
              <ReceiptPreview
                config={localConfig}
                storeName={storeName}
                storeAddress={storeAddress}
                storePhone={storePhone}
                sectionOrder={sectionOrder}
                onReorder={setSectionOrder}
              />
            ) : activeTab === 'kitchen' ? (
              <KitchenPreview
                config={localConfig}
                storeName={storeName}
                sectionOrder={kitchenSectionOrder}
                onReorder={setKitchenSectionOrder}
              />
            ) : activeTab === 'no_sale' ? (
              <NoSalePreview
                config={localConfig}
                storeName={storeName}
                storeAddress={storeAddress}
                storePhone={storePhone}
                sectionOrder={noSaleSectionOrder}
                onReorder={setNoSaleSectionOrder}
              />
            ) : activeTab === 'void_order' ? (
              <VoidOrderPreview
                config={localConfig}
                storeName={storeName}
                storeAddress={storeAddress}
                storePhone={storePhone}
                sectionOrder={voidOrderSectionOrder}
                onReorder={setVoidOrderSectionOrder}
              />
            ) : (
              <TimeSheetPreview
                config={localConfig}
                storeName={storeName}
                sectionOrder={timeSheetSectionOrder}
                onReorder={setTimeSheetSectionOrder}
              />
            )}
          </ScrollView>
        </View>

        {/* Settings Panel */}
        <View
          style={{
            flex: 6,
            backgroundColor: colors.screen,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          {/* Toolbar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.heading,
                flex: 1
              }}
              numberOfLines={1}
            >
              Settings
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0
              }}
            >
              <TouchableOpacity
                onPress={() => setShowCopyFrom(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: 'transparent',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Copy size={11} color={colors.muted} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.label,
                    fontWeight: '500',
                    marginLeft: 5
                  }}
                >
                  Copy from Location
                </Text>
              </TouchableOpacity>

              {(activeTab === 'receipt' || activeTab === 'kitchen') && (
                <TouchableOpacity
                  onPress={() => setShowPresets(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: colors.teal + '20',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.teal + '50'
                  }}
                >
                  <Layers size={11} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.teal,
                      fontWeight: '600',
                      marginLeft: 5
                    }}
                  >
                    Presets
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            style={{ flex: 1 }}
          >
            {activeTab === 'receipt' ? (
              <ReceiptSettings config={localConfig} updateField={updateField} />
            ) : activeTab === 'kitchen' ? (
              <KitchenSettings config={localConfig} updateField={updateField} />
            ) : activeTab === 'no_sale' ? (
              <NoSaleSettings config={localConfig} updateField={updateField} />
            ) : activeTab === 'void_order' ? (
              <VoidOrderSettings
                config={localConfig}
                updateField={updateField}
              />
            ) : (
              <TimeSheetSettings
                config={localConfig}
                updateField={updateField}
              />
            )}
          </ScrollView>

          {/* Save + Test Print */}
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              flexDirection: 'row',
              gap: 8
            }}
          >
            <TouchableOpacity
              onPress={() => setShowTestPrint(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: colors.border,
                gap: 5
              }}
            >
              <Printer size={13} color={colors.teal} />
              <Text
                style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}
              >
                Test Print
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  hasChanges && !isSaving ? colors.teal + '20' : 'transparent',
                borderWidth: 1,
                borderColor:
                  hasChanges && !isSaving ? colors.teal + '50' : colors.border
              }}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.teal} size='small' />
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    color: hasChanges && !isSaving ? colors.teal : colors.muted,
                    fontWeight: '600'
                  }}
                >
                  {hasChanges ? 'Save Changes' : 'Saved'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TestPrintModal
        visible={showTestPrint}
        onClose={() => setShowTestPrint(false)}
        initialPrintType={activeTab === 'kitchen' ? 'kitchen' : 'receipt'}
      />

      <PresetPickerModal
        visible={showPresets}
        presets={activeTab === 'receipt' ? RECEIPT_PRESETS : KITCHEN_PRESETS}
        onApply={applyPreset}
        onClose={() => setShowPresets(false)}
      />

      <CopyFromLocationModal
        visible={showCopyFrom}
        currentLocationId={locationId}
        templateType={activeTab}
        onApply={applyFromLocation}
        onClose={() => setShowCopyFrom(false)}
      />
    </View>
  )
}

// ============================================================================
// RECEIPT SETTINGS
// ============================================================================

function ReceiptSettings ({
  config,
  updateField
}: {
  config: ReceiptTemplateConfig
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K]
  ) => void
}) {
  return (
    <>
      <CollapsibleSection
        title='Branding'
        subtitle='Logo, header, and footer text'
        defaultOpen
      >
        <ToggleRow
          label='Show Logo'
          subtitle='Print your business logo at the top (network thermal printers only — built-in Landi printer cannot render images)'
          value={config.showLogo}
          onToggle={v => updateField('showLogo', v)}
        />
        <TextRow
          label='Header Text'
          value={config.headerText ?? ''}
          onChangeText={v => updateField('headerText', v || null)}
          placeholder='e.g. Welcome to Our Restaurant!'
        />
        <TextRow
          label='Footer Text'
          value={config.footerText ?? ''}
          onChangeText={v => updateField('footerText', v || null)}
          placeholder='e.g. Thank you, see you again!'
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Content'
        subtitle='What information prints on the receipt'
        defaultOpen
      >
        <ToggleRow
          label='Show Item Modifiers'
          subtitle='Print add-ons and customizations under each item'
          value={config.showItemModifiers}
          onToggle={v => updateField('showItemModifiers', v)}
        />
        <ToggleRow
          label='Show Tax Breakdown'
          subtitle='Print tax rate and amount as a separate line'
          value={config.showTaxBreakdown}
          onToggle={v => updateField('showTaxBreakdown', v)}
        />
        <ToggleRow
          label='Show Tip Line'
          subtitle='Add a blank tip line for card transactions'
          value={config.showTipLine}
          onToggle={v => updateField('showTipLine', v)}
        />
        <ToggleRow
          label='Show Server Name'
          subtitle='Print the name of the staff member who took the order'
          value={config.showServerName}
          onToggle={v => updateField('showServerName', v)}
        />
        <ToggleRow
          label='Show Order Type'
          subtitle='Print Dine In / Takeaway / Delivery'
          value={config.showOrderType}
          onToggle={v => updateField('showOrderType', v)}
        />
        <ToggleRow
          label='Show Customer Phone'
          subtitle='Print the customer phone number when one is on the order'
          value={config.showCustomerPhone}
          onToggle={v => updateField('showCustomerPhone', v)}
        />
      </CollapsibleSection>
      {/* 
      <CollapsibleSection title="Extras" subtitle="Barcodes and QR codes" defaultOpen={false}>
        <ToggleRow
          label="Show Barcode"
          subtitle="Print an order barcode at the bottom"
          value={config.showBarcode}
          onToggle={(v) => updateField("showBarcode", v)}
        />
        <ToggleRow
          label="Show QR Code"
          subtitle="Print a QR code (e.g. for digital menu or feedback)"
          value={config.showQrCode}
          onToggle={(v) => updateField("showQrCode", v)}
        />
      </CollapsibleSection> */}

      <CollapsibleSection
        title='Organisation'
        subtitle='Group items by seat for table orders'
        defaultOpen={false}
      >
        <ToggleRow
          label='Group by Seat'
          subtitle='Print items grouped under seat numbers — great for table service'
          value={config.groupBySeat}
          onToggle={v => updateField('groupBySeat', v)}
        />
      </CollapsibleSection>
    </>
  )
}

// ============================================================================
// KITCHEN SETTINGS
// ============================================================================

function KitchenSettings ({
  config,
  updateField
}: {
  config: ReceiptTemplateConfig
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K]
  ) => void
}) {
  return (
    <>
      <CollapsibleSection
        title='Header'
        subtitle='Order number, table, server, timing'
        defaultOpen
      >
        <ToggleRow
          label='Show Order Type'
          subtitle='Print Dine In / Takeaway / Delivery at the top'
          value={config.showOrderType}
          onToggle={v => updateField('showOrderType', v)}
        />
        <ToggleRow
          label='Show Server Name'
          subtitle='Print the staff member who placed the order'
          value={config.showServerName}
          onToggle={v => updateField('showServerName', v)}
        />
        <ToggleRow
          label='Show Ready-By Time'
          subtitle='Print the target ready time — useful for timed pickup orders'
          value={config.showReadyByTime}
          onToggle={v => updateField('showReadyByTime', v)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Items & Modifiers'
        subtitle='What detail prints per line item'
        defaultOpen
      >
        <ToggleRow
          label='Show Modifiers'
          subtitle='Print add-ons and customizations under each item'
          value={config.showItemModifiers}
          onToggle={v => updateField('showItemModifiers', v)}
        />
        <ToggleRow
          label='Show Allergy Alerts'
          subtitle='Highlight allergy warnings in red — never miss a dietary flag'
          value={config.showAllergyAlert}
          onToggle={v => updateField('showAllergyAlert', v)}
        />
        {config.showItemModifiers && (
          <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
            <Text
              style={{
                color: colors.label,
                fontSize: 13,
                fontWeight: '600',
                marginBottom: 6
              }}
            >
              Modifier Style
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['inverted', 'red', 'bold'] as ModifierStyle[]).map(opt => {
                const isSelected = config.modifierStyle === opt
                const label =
                  opt === 'inverted'
                    ? 'Inverted'
                    : opt === 'red'
                    ? 'Red Text'
                    : 'Bold Only'
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => updateField('modifierStyle', opt)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected
                        ? colors.primary + '15'
                        : colors.card,
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? '700' : '500',
                        color: isSelected ? colors.primary : colors.label
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title='Readability'
        subtitle='Text size — tune for your kitchen distance'
        defaultOpen
      >
        {/* Visual size preview strip */}
        <View
          style={{
            backgroundColor: colors.screen,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 10,
            marginBottom: 6,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 5
            }}
          >
            Preview
          </Text>
          <Text
            style={{
              color: colors.heading,
              fontWeight: '700',
              fontSize: config.largeItemText ? 15 : 11
            }}
          >
            2x Cheeseburger
          </Text>
          {config.showItemModifiers &&
            (() => {
              const ms = config.modifierStyle ?? 'inverted'
              const s: any = {
                marginLeft: 10,
                fontSize: config.showModsLarge ? 13 : 9,
                fontWeight: '700'
              }
              if (ms === 'inverted') {
                s.backgroundColor = '#111827'
                s.color = '#FFFFFF'
                s.paddingHorizontal = 3
                s.borderRadius = 2
                s.alignSelf = 'flex-start'
              } else if (ms === 'red') {
                s.color = '#dc2626'
              } else {
                s.color = colors.label
              }
              return <Text style={s}>+ Extra Cheese</Text>
            })()}
        </View>
        <ToggleRow
          label='Large Item Text'
          subtitle='Bigger, bolder item names — ideal for noisy kitchens'
          value={config.largeItemText}
          onToggle={v => updateField('largeItemText', v)}
        />
        <ToggleRow
          label='Large Modifier Text'
          subtitle='Scale modifiers up to match large item text'
          value={config.showModsLarge}
          onToggle={v => updateField('showModsLarge', v)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Organisation'
        subtitle='Grouping by station or seat'
        defaultOpen={false}
      >
        <ToggleRow
          label='Group by Station'
          subtitle='Divide the ticket into sections per kitchen station (Grill, Salad…)'
          value={config.groupByStation}
          onToggle={v => updateField('groupByStation', v)}
        />
        <ToggleRow
          label='Group by Seat'
          subtitle='Label each item with its seat number for easy runner service'
          value={config.groupBySeat}
          onToggle={v => updateField('groupBySeat', v)}
        />
      </CollapsibleSection>
    </>
  )
}

// ============================================================================
// NO SALE SETTINGS
// ============================================================================

function NoSaleSettings ({
  config,
  updateField
}: {
  config: ReceiptTemplateConfig
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K]
  ) => void
}) {
  return (
    <>
      <CollapsibleSection
        title='Branding'
        subtitle='Header and footer text'
        defaultOpen
      >
        <TextRow
          label='Header Text'
          value={config.headerText ?? ''}
          onChangeText={v => updateField('headerText', v || null)}
          placeholder='e.g. No-sale audit copy'
        />
        <TextRow
          label='Footer Text'
          value={config.footerText ?? ''}
          onChangeText={v => updateField('footerText', v || null)}
          placeholder='Optional note at the bottom'
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Content'
        subtitle='What prints on the no-sale slip'
        defaultOpen
      >
        <ToggleRow
          label='Show Approved By'
          subtitle='Print the manager name who approved the no-sale'
          value={config.showApprovedBy}
          onToggle={v => updateField('showApprovedBy', v)}
        />
      </CollapsibleSection>
    </>
  )
}

// ============================================================================
// VOID ORDER SETTINGS
// ============================================================================

function VoidOrderSettings ({
  config,
  updateField
}: {
  config: ReceiptTemplateConfig
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K]
  ) => void
}) {
  return (
    <>
      <CollapsibleSection
        title='Branding'
        subtitle='Header and footer text'
        defaultOpen
      >
        <TextRow
          label='Header Text'
          value={config.headerText ?? ''}
          onChangeText={v => updateField('headerText', v || null)}
          placeholder='e.g. Customer copy — void'
        />
        <TextRow
          label='Footer Text'
          value={config.footerText ?? ''}
          onChangeText={v => updateField('footerText', v || null)}
          placeholder='Optional note at the bottom'
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Content'
        subtitle='What prints on the void receipt'
        defaultOpen
      >
        <ToggleRow
          label='Show Server Name'
          subtitle='Print the server who placed the voided order'
          value={config.showServerName}
          onToggle={v => updateField('showServerName', v)}
        />
        <ToggleRow
          label='Show Void Reason'
          subtitle='Print the reason the order was voided'
          value={config.showVoidReason}
          onToggle={v => updateField('showVoidReason', v)}
        />
        <ToggleRow
          label='Show Approved By'
          subtitle='Print the manager who authorized the void'
          value={config.showApprovedBy}
          onToggle={v => updateField('showApprovedBy', v)}
        />
      </CollapsibleSection>
    </>
  )
}

// ============================================================================
// TIME SHEET SETTINGS
// ============================================================================

function TimeSheetSettings ({
  config,
  updateField
}: {
  config: ReceiptTemplateConfig
  updateField: <K extends keyof ReceiptTemplateConfig>(
    key: K,
    value: ReceiptTemplateConfig[K]
  ) => void
}) {
  return (
    <>
      <CollapsibleSection
        title='Branding'
        subtitle='Header and footer text'
        defaultOpen
      >
        <TextRow
          label='Header Text'
          value={config.headerText ?? ''}
          onChangeText={v => updateField('headerText', v || null)}
          placeholder='e.g. Payroll — employee copy'
        />
        <TextRow
          label='Footer Text'
          value={config.footerText ?? ''}
          onChangeText={v => updateField('footerText', v || null)}
          placeholder='Optional signature line'
        />
      </CollapsibleSection>

      <CollapsibleSection
        title='Content'
        subtitle='What prints per shift'
        defaultOpen
      >
        <ToggleRow
          label='Show Break Details'
          subtitle='Print break start/end times under each shift'
          value={config.showBreakDetails}
          onToggle={v => updateField('showBreakDetails', v)}
        />
      </CollapsibleSection>
    </>
  )
}

export default ReceiptTemplatesScreen
