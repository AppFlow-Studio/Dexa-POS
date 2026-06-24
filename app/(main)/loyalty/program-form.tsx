/**
 * Add / Edit Loyalty Program
 * Handles all 3 program types: points | visits | punch
 */
import { useToast } from '@/contexts/ToastContext'
import type { Database } from '@/database.types'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useLoyaltyDataStore } from '@/stores/useLoyaltyDataStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Award,
  ChevronLeft,
  Info,
  Star,
  Trash2,
  TrendingUp,
  Zap
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

type LoyaltyProgram = Database['public']['Tables']['loyalty_programs']['Row']
type ProgramType = 'points' | 'visits' | 'punch'
type RewardType =
  | 'discount_percent'
  | 'discount_fixed'
  | 'free_item'
  | 'free_category'

// ─── Constants ────────────────────────────────────────────────────────────────

const PROGRAM_TYPES: {
  id: ProgramType
  label: string
  desc: string
  Icon: React.FC<any>
}[] = [
  {
    id: 'points',
    label: 'Points',
    desc: 'Earn points per dollar spent',
    Icon: Star
  },
  {
    id: 'visits',
    label: 'Visits',
    desc: 'Reward after X qualifying visits',
    Icon: TrendingUp
  },
  {
    id: 'punch',
    label: 'Punch Card',
    desc: 'Punch for specific items/category',
    Icon: Zap
  }
]

const REWARD_TYPES: { id: RewardType; label: string }[] = [
  { id: 'discount_percent', label: 'Percent Discount (e.g. 10% off)' },
  { id: 'discount_fixed', label: 'Fixed Amount Off (e.g. $5 off)' },
  { id: 'free_item', label: 'Free Menu Item' },
  { id: 'free_category', label: 'Free Item from Category' }
]

const ACCENT_COLORS = [
  '#2DD4BF',
  '#60A5FA',
  '#34D399',
  '#FBBF24',
  '#F87171',
  '#A78BFA',
  '#FB923C',
  '#E879F9'
]

// ─── Atoms ────────────────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}> = ({ label, hint, required, children }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View style={{ gap: s(6) }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(4) }}>
      <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {hint ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(3) }}>
          <Info size={s(11)} color={colors.muted} />
          <Text style={{ fontSize: s(10), color: colors.muted }}>{hint}</Text>
        </View>
      ) : null}
    </View>
    {children}
  </View>
  )
}

const Input: React.FC<{
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: any
  multiline?: boolean
  rows?: number
}> = ({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  rows = 3
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={colors.muted}
    keyboardType={keyboardType ?? 'default'}
    multiline={multiline}
    numberOfLines={multiline ? rows : 1}
    style={{
      backgroundColor: colors.screen,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(9),
      paddingHorizontal: s(12),
      paddingVertical: multiline ? s(10) : s(10),
      color: colors.heading,
      fontSize: s(13),
      textAlignVertical: multiline ? 'top' : 'center',
      minHeight: multiline ? rows * s(22) : undefined
    }}
  />
  )
}

const ToggleRow: React.FC<{
  label: string
  desc?: string
  value: boolean
  onChange: (v: boolean) => void
}> = ({ label, desc, value, onChange }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: s(6)
    }}
  >
    <View style={{ flex: 1, marginRight: s(12) }}>
      <Text style={{ fontSize: s(13), color: colors.heading, fontWeight: '500' }}>
        {label}
      </Text>
      {desc ? (
        <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}>
          {desc}
        </Text>
      ) : null}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.border, true: colors.teal + '80' }}
      thumbColor={value ? colors.teal : colors.muted}
    />
  </View>
  )
}

const SectionBox: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View
    style={{
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(12),
      overflow: 'hidden',
      marginBottom: s(4)
    }}
  >
    <View
      style={{
        paddingHorizontal: s(14),
        paddingVertical: s(9),
        backgroundColor: colors.panel,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}
    >
      <Text
        style={{
          fontSize: s(11),
          fontWeight: '700',
          color: colors.label,
          textTransform: 'uppercase',
          letterSpacing: 0.8
        }}
      >
        {title}
      </Text>
    </View>
    <View style={{ padding: s(14), gap: s(14) }}>{children}</View>
  </View>
  )
}

const SelectPill: React.FC<{
  options: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
}> = ({ options, value, onChange }) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
  <View style={{ flexDirection: 'row', gap: s(8), flexWrap: 'wrap' }}>
    {options.map(opt => {
      const active = value === opt.id
      return (
        <TouchableOpacity
          key={opt.id}
          onPress={() => onChange(opt.id)}
          style={{
            paddingHorizontal: s(12),
            paddingVertical: s(6),
            borderRadius: 999,
            backgroundColor: active ? colors.teal : colors.screen,
            borderWidth: 1,
            borderColor: active ? colors.teal : colors.border
          }}
        >
          <Text
            style={{
              fontSize: s(12),
              fontWeight: '600',
              color: active ? colors.onSolid : colors.label
            }}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      )
    })}
  </View>
  )
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export default function ProgramFormScreen () {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const router = useRouter()
  const { show } = useToast()
  const selectedStore = useStoreSettingsStore(storeState => storeState.selectedStore)
  const merchantId = selectedStore?.merchant_id ?? ''
  const saveProgram = useLoyaltyDataStore(storeState => storeState.saveProgram)
  const deleteProgram = useLoyaltyDataStore(storeState => storeState.deleteProgram)
  const params = useLocalSearchParams<{ id?: string }>()
  const editId = params.id
  const isEdit = !!editId

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [programType, setProgramType] = useState<ProgramType>('points')
  const [rewardType, setRewardType] = useState<RewardType>('discount_percent')
  const [rewardDesc, setRewardDesc] = useState('')
  const [rewardValue, setRewardValue] = useState('')
  const [rewardMaxVal, setRewardMaxVal] = useState('')
  const [expiryDays, setExpiryDays] = useState('')
  const [maxActive, setMaxActive] = useState('')
  const [cooldown, setCooldown] = useState('')
  const [minOrder, setMinOrder] = useState('')

  // Points-specific
  const [pointsPerDollar, setPointsPerDollar] = useState('')
  const [redeemThreshold, setRedeemThreshold] = useState('')
  const [redeemValue, setRedeemValue] = useState('')

  // Visits-specific
  const [visitsRequired, setVisitsRequired] = useState('')

  // Punch-specific
  const [punchesRequired, setPunchesRequired] = useState('')

  // Toggles
  const [isActive, setIsActive] = useState(true)
  const [autoEnroll, setAutoEnroll] = useState(false)
  const [isStackable, setIsStackable] = useState(false)
  const [earnOnDiscount, setEarnOnDiscount] = useState(true)

  // Display
  const [displayColor, setDisplayColor] = useState(ACCENT_COLORS[0])

  // UI state
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // ── Load existing program ───────────────────────────────────────────────────
  const loadProgram = useCallback(async () => {
    if (!editId) return
    const { getOrderStoreSupabaseClient } = await import(
      '@/stores/useOrderStore'
    )
    const supabase = getOrderStoreSupabaseClient()
    if (!supabase) {
      show({ title: 'Error', message: 'No client', type: 'error' })
      return
    }
    const { data, error } = await supabase
      .from('loyalty_programs')
      .select('*')
      .eq('id', editId)
      .single()

    if (error || !data) {
      show({ title: 'Error', message: 'Failed to load program', type: 'error' })
      router.back()
      return
    }

    const p = data as LoyaltyProgram
    setName(p.name)
    setDescription(p.description ?? '')
    setProgramType(p.program_type as ProgramType)
    setRewardType(p.reward_type as RewardType)
    setRewardDesc(p.reward_description)
    setRewardValue(p.reward_value?.toString() ?? '')
    setRewardMaxVal(p.reward_max_value?.toString() ?? '')
    setExpiryDays(p.reward_expiry_days?.toString() ?? '')
    setMaxActive(p.max_active_rewards?.toString() ?? '')
    setCooldown(p.cooldown_minutes?.toString() ?? '')
    setMinOrder(p.min_order_amount?.toString() ?? '')
    setPointsPerDollar(p.points_per_dollar?.toString() ?? '')
    setRedeemThreshold(p.points_redemption_threshold?.toString() ?? '')
    setRedeemValue(p.points_redemption_value?.toString() ?? '')
    setVisitsRequired(p.visits_required?.toString() ?? '')
    setPunchesRequired(p.punches_required?.toString() ?? '')
    setIsActive(p.is_active ?? true)
    setAutoEnroll(p.auto_enroll ?? false)
    setIsStackable(p.is_stackable ?? false)
    setEarnOnDiscount(p.earn_on_discounted ?? true)
    setDisplayColor(p.display_color ?? ACCENT_COLORS[0])
    setLoading(false)
  }, [editId, router, show])

  useEffect(() => {
    if (isEdit) loadProgram()
  }, [isEdit, loadProgram])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      show({
        title: 'Validation',
        message: 'Program name is required',
        type: 'error'
      })
      return
    }
    if (!rewardDesc.trim()) {
      show({
        title: 'Validation',
        message: 'Reward description is required',
        type: 'error'
      })
      return
    }
    if (!rewardValue || isNaN(Number(rewardValue))) {
      show({
        title: 'Validation',
        message: 'Reward value is required',
        type: 'error'
      })
      return
    }
    if (
      programType === 'points' &&
      (!pointsPerDollar || isNaN(Number(pointsPerDollar)))
    ) {
      show({
        title: 'Validation',
        message: 'Points per dollar is required',
        type: 'error'
      })
      return
    }
    if (
      programType === 'visits' &&
      (!visitsRequired || isNaN(Number(visitsRequired)))
    ) {
      show({
        title: 'Validation',
        message: 'Visits required is required',
        type: 'error'
      })
      return
    }
    if (
      programType === 'punch' &&
      (!punchesRequired || isNaN(Number(punchesRequired)))
    ) {
      show({
        title: 'Validation',
        message: 'Punches required is required',
        type: 'error'
      })
      return
    }

    setSaving(true)
    try {
      const payload: Database['public']['Tables']['loyalty_programs']['Insert'] =
        {
          merchant_id: merchantId,
          name: name.trim(),
          description: description.trim() || null,
          program_type: programType,
          reward_type: rewardType,
          reward_description: rewardDesc.trim(),
          reward_value: Number(rewardValue),
          reward_max_value: rewardMaxVal ? Number(rewardMaxVal) : null,
          reward_expiry_days: expiryDays ? Number(expiryDays) : null,
          max_active_rewards: maxActive ? Number(maxActive) : null,
          cooldown_minutes: cooldown ? Number(cooldown) : null,
          min_order_amount: minOrder ? Number(minOrder) : null,
          points_per_dollar:
            programType === 'points' && pointsPerDollar
              ? Number(pointsPerDollar)
              : null,
          points_redemption_threshold:
            programType === 'points' && redeemThreshold
              ? Number(redeemThreshold)
              : null,
          points_redemption_value:
            programType === 'points' && redeemValue
              ? Number(redeemValue)
              : null,
          visits_required:
            programType === 'visits' && visitsRequired
              ? Number(visitsRequired)
              : null,
          punches_required:
            programType === 'punch' && punchesRequired
              ? Number(punchesRequired)
              : null,
          is_active: isActive,
          auto_enroll: autoEnroll,
          is_stackable: isStackable,
          earn_on_discounted: earnOnDiscount,
          display_color: displayColor,
          display_icon: 'star'
        }

      const result = await saveProgram(payload, {
        isEdit,
        editId: editId ?? undefined,
        isActive,
        merchantId,
        locationId: selectedStore?.id ?? null
      })

      if (!result.success) {
        show({
          title: 'Error',
          message: result.error ?? 'Failed to save program',
          type: 'error'
        })
        return
      }

      show({
        title: 'Success',
        message: isEdit ? 'Program updated' : 'Program created',
        type: 'success'
      })
      router.back()
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!editId) return
    setDeleting(true)
    try {
      const result = await deleteProgram(editId)
      if (!result.success) {
        show({
          title: 'Error',
          message: result.error ?? 'Failed to delete',
          type: 'error'
        })
        return
      }
      setShowDeleteModal(false)
      show({ title: 'Deleted', message: 'Program deleted', type: 'success' })
      router.back()
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <ActivityIndicator color={colors.teal} size='large' />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(10),
          paddingHorizontal: s(14),
          paddingVertical: s(8),
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            padding: s(7),
            backgroundColor: colors.teal + '10',
            borderRadius: s(10)
          }}
        >
          <ChevronLeft size={s(16)} color={colors.teal} />
        </TouchableOpacity>
        <View
          style={{
            width: s(28),
            height: s(28),
            borderRadius: s(8),
            backgroundColor: colors.teal + '18',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Award size={s(14)} color={colors.teal} />
        </View>
        <Text
          style={{
            fontSize: s(16),
            fontWeight: '700',
            color: colors.heading,
            flex: 1
          }}
        >
          {isEdit ? 'Edit Program' : 'New Program'}
        </Text>
        {isEdit && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || deleting}
              style={{
                height: s(32),
                paddingHorizontal: s(12),
                borderRadius: s(10),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: saving ? colors.teal + '50' : colors.teal
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.onSolid} size='small' />
              ) : (
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting || saving}
              style={{
                padding: s(7),
                backgroundColor: colors.danger + '15',
                borderRadius: s(10)
              }}
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} size='small' />
              ) : (
                <Trash2 size={s(14)} color={colors.danger} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: s(14), gap: s(12) }}
          showsVerticalScrollIndicator={false}
        >
          {/* Basics */}
          <SectionBox title='Program Details'>
            <Field label='Program Name' required>
              <Input
                value={name}
                onChangeText={setName}
                placeholder='e.g. Points Rewards'
              />
            </Field>
            <Field label='Description'>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder='Optional description shown to staff'
                multiline
                rows={2}
              />
            </Field>
            <Field label='Program Type' required>
              <View style={{ gap: s(8) }}>
                {PROGRAM_TYPES.map(pt => {
                  const active = programType === pt.id
                  return (
                    <TouchableOpacity
                      key={pt.id}
                      onPress={() => setProgramType(pt.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(12),
                        padding: s(12),
                        borderRadius: s(10),
                        backgroundColor: active
                          ? colors.teal + '15'
                          : colors.screen,
                        borderWidth: 1,
                        borderColor: active ? colors.teal + '60' : colors.border
                      }}
                    >
                      <View
                        style={{
                          width: s(32),
                          height: s(32),
                          borderRadius: s(8),
                          backgroundColor: active
                            ? colors.teal + '30'
                            : colors.border,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <pt.Icon
                          size={s(15)}
                          color={active ? colors.teal : colors.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: '600',
                            color: active ? colors.teal : colors.heading
                          }}
                        >
                          {pt.label}
                        </Text>
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          {pt.desc}
                        </Text>
                      </View>
                      {active && (
                        <View
                          style={{
                            width: s(18),
                            height: s(18),
                            borderRadius: s(9),
                            backgroundColor: colors.teal,
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text
                            style={{
                              fontSize: s(10),
                              color: colors.onSolid,
                              fontWeight: '700'
                            }}
                          >
                            ✓
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            </Field>
          </SectionBox>

          {/* Program-type-specific earning rules */}
          {programType === 'points' && (
            <SectionBox title='Earning Rules — Points'>
              <Field
                label='Points per $1 Spent'
                required
                hint='e.g. 10 = earn 10 pts per dollar'
              >
                <Input
                  value={pointsPerDollar}
                  onChangeText={setPointsPerDollar}
                  placeholder='10'
                  keyboardType='numeric'
                />
              </Field>
              <Field
                label='Redemption Threshold'
                hint='Points needed to earn 1 reward'
              >
                <Input
                  value={redeemThreshold}
                  onChangeText={setRedeemThreshold}
                  placeholder='e.g. 100'
                  keyboardType='numeric'
                />
              </Field>
              <Field
                label='Redemption Value ($)'
                hint='Dollar value when threshold is reached'
              >
                <Input
                  value={redeemValue}
                  onChangeText={setRedeemValue}
                  placeholder='e.g. 1.00'
                  keyboardType='decimal-pad'
                />
              </Field>
            </SectionBox>
          )}

          {programType === 'visits' && (
            <SectionBox title='Earning Rules — Visits'>
              <Field
                label='Visits Required'
                required
                hint='Number of qualifying visits to earn reward'
              >
                <Input
                  value={visitsRequired}
                  onChangeText={setVisitsRequired}
                  placeholder='e.g. 10'
                  keyboardType='numeric'
                />
              </Field>
            </SectionBox>
          )}

          {programType === 'punch' && (
            <SectionBox title='Earning Rules — Punch Card'>
              <Field
                label='Punches Required'
                required
                hint='Number of qualifying purchases to earn reward'
              >
                <Input
                  value={punchesRequired}
                  onChangeText={setPunchesRequired}
                  placeholder='e.g. 10'
                  keyboardType='numeric'
                />
              </Field>
            </SectionBox>
          )}

          {/* Reward */}
          <SectionBox title='Reward'>
            <Field label='Reward Type' required>
              <View style={{ gap: s(6) }}>
                {REWARD_TYPES.map(rt => {
                  const active = rewardType === rt.id
                  return (
                    <TouchableOpacity
                      key={rt.id}
                      onPress={() => setRewardType(rt.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: s(10),
                        padding: s(10),
                        borderRadius: s(9),
                        backgroundColor: active
                          ? colors.teal + '15'
                          : colors.screen,
                        borderWidth: 1,
                        borderColor: active ? colors.teal + '50' : colors.border
                      }}
                    >
                      <View
                        style={{
                          width: s(16),
                          height: s(16),
                          borderRadius: s(8),
                          borderWidth: 2,
                          borderColor: active ? colors.teal : colors.border,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {active && (
                          <View
                            style={{
                              width: s(8),
                              height: s(8),
                              borderRadius: s(4),
                              backgroundColor: colors.teal
                            }}
                          />
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: s(13),
                          color: active ? colors.teal : colors.heading,
                          fontWeight: active ? '600' : '400'
                        }}
                      >
                        {rt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </Field>

            <Field
              label='Reward Description'
              required
              hint="Shown on reward (e.g. '10% off your order')"
            >
              <Input
                value={rewardDesc}
                onChangeText={setRewardDesc}
                placeholder='e.g. 10% off your next order'
              />
            </Field>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={
                    rewardType === 'discount_percent'
                      ? 'Discount %'
                      : 'Discount $'
                  }
                  required
                >
                  <Input
                    value={rewardValue}
                    onChangeText={setRewardValue}
                    placeholder={
                      rewardType === 'discount_percent' ? '10' : '5.00'
                    }
                    keyboardType='decimal-pad'
                  />
                </Field>
              </View>
              {rewardType === 'discount_percent' && (
                <View style={{ flex: 1 }}>
                  <Field
                    label='Max Discount ($)'
                    hint='Cap the discount amount'
                  >
                    <Input
                      value={rewardMaxVal}
                      onChangeText={setRewardMaxVal}
                      placeholder='e.g. 20.00'
                      keyboardType='decimal-pad'
                    />
                  </Field>
                </View>
              )}
            </View>

            <Field
              label='Reward Expiry (days)'
              hint='Days after earning before reward expires'
            >
              <Input
                value={expiryDays}
                onChangeText={setExpiryDays}
                placeholder='e.g. 30'
                keyboardType='numeric'
              />
            </Field>
          </SectionBox>

          {/* Restrictions */}
          <SectionBox title='Restrictions'>
            <Field
              label='Minimum Order Amount ($)'
              hint='Minimum order to qualify for earning'
            >
              <Input
                value={minOrder}
                onChangeText={setMinOrder}
                placeholder='e.g. 10.00'
                keyboardType='decimal-pad'
              />
            </Field>
            <Field
              label='Max Active Rewards per Customer'
              hint='Prevent stacking unlimited rewards'
            >
              <Input
                value={maxActive}
                onChangeText={setMaxActive}
                placeholder='e.g. 5'
                keyboardType='numeric'
              />
            </Field>
            <Field
              label='Cooldown Between Earnings (minutes)'
              hint='Minimum time between earning events'
            >
              <Input
                value={cooldown}
                onChangeText={setCooldown}
                placeholder='e.g. 60'
                keyboardType='numeric'
              />
            </Field>
          </SectionBox>

          {/* Settings */}
          <SectionBox title='Settings'>
            <ToggleRow
              label='Active'
              desc='Only one program can be active at a time — enabling this will deactivate the current one'
              value={isActive}
              onChange={setIsActive}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <ToggleRow
              label='Auto-Enroll'
              desc='Automatically enroll customers on first qualifying order'
              value={autoEnroll}
              onChange={setAutoEnroll}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <ToggleRow
              label='Stackable'
              desc='Can be combined with other programs'
              value={isStackable}
              onChange={setIsStackable}
            />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <ToggleRow
              label='Earn on Discounted Orders'
              desc='Points/visits count even when a discount is applied'
              value={earnOnDiscount}
              onChange={setEarnOnDiscount}
            />
          </SectionBox>

          {/* Display color */}
          <SectionBox title='Display Color'>
            <View style={{ flexDirection: 'row', gap: s(10), flexWrap: 'wrap' }}>
              {ACCENT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setDisplayColor(c)}
                  style={{
                    width: s(36),
                    height: s(36),
                    borderRadius: s(18),
                    backgroundColor: c,
                    borderWidth: displayColor === c ? 3 : 1,
                    borderColor:
                      displayColor === c ? colors.heading : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {displayColor === c && (
                    <Text
                      style={{ fontSize: s(14), color: '#fff', fontWeight: '700' }}
                    >
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </SectionBox>

          {/* Save button (create mode only) */}
          {!isEdit && (
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                paddingVertical: s(13),
                backgroundColor: saving ? colors.teal + '50' : colors.teal,
                borderRadius: s(10),
                alignItems: 'center',
                marginTop: s(4)
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.onSolid} size='small' />
              ) : (
                <Text
                  style={{
                    fontSize: s(14),
                    fontWeight: '700',
                    color: colors.onSolid
                  }}
                >
                  Create Program
                </Text>
              )}
            </TouchableOpacity>
          )}

          <View style={{ height: s(20) }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        transparent
        visible={showDeleteModal}
        animationType='fade'
        onRequestClose={() => {
          if (deleting) return
          setShowDeleteModal(false)
        }}
      >
        <Pressable
          onPress={() => {
            if (deleting) return
            setShowDeleteModal(false)
          }}
          style={{
            flex: 1,
            backgroundColor: '#00000099',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 460,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              overflow: 'hidden'
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: colors.danger + '20',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Trash2 size={14} color={colors.danger} />
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Delete Program
              </Text>
            </View>

            <View
              style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 6 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: colors.heading,
                  fontWeight: '600'
                }}
              >
                {name || 'This program'} will be permanently deleted.
              </Text>
              <Text style={{ fontSize: 12, color: colors.label }}>
                This action cannot be undone.
              </Text>
            </View>

            <View
              style={{
                padding: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.panel,
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8
              }}
            >
              <TouchableOpacity
                disabled={deleting}
                onPress={() => setShowDeleteModal(false)}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.screen,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: colors.label
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={deleting}
                onPress={handleConfirmDelete}
                style={{
                  height: 36,
                  minWidth: 94,
                  paddingHorizontal: 14,
                  borderRadius: 9,
                  backgroundColor: deleting
                    ? colors.danger + '66'
                    : colors.danger,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.onSolid} size='small' />
                ) : (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: colors.onSolid
                    }}
                  >
                    Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
