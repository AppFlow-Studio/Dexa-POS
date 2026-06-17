import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useAnalyticsStore } from '@/stores/useAnalyticsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import {
  AlertCircle,
  ArrowDownLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Hash,
  
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingBag,
  
  Table2,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { BarChart, PieChart } from '@/components/charts/LazyGiftedCharts'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (v: number) => {
  const trim = (n: string) => n.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')

  if (v >= 1_000_000_000) return `$${trim((v / 1_000_000_000).toFixed(1))}b`
  if (v >= 1_000_000) return `$${trim((v / 1_000_000).toFixed(1))}m`
  if (v >= 10_000) return `$${trim((v / 1_000).toFixed(1))}k`
  if (v >= 1_000) return `$${trim((v / 1_000).toFixed(2))}k`
  return `$${v.toFixed(2)}`
}

const fmtFull$ = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// Chart colors — varied palette for pie slices
const CHART_COLORS = [
  '#2DD4BF', // teal
  '#60A5FA', // blue
  '#34D399', // green
  '#FBBF24', // amber
  '#F87171', // red
  '#A78BFA', // purple
  '#FB923C', // orange
]

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'overview' | 'items' | 'customers' | 'loyalty' | 'staff' | 'payments'

type TabIconComponent = React.FC<{ size: number; color: string }>

const TABS: { id: TabId; label: string; Icon: TabIconComponent }[] = [
  { id: 'overview', label: 'Overview', Icon: ({ size, color }) => <LayoutDashboard size={size} color={color} /> },
  { id: 'items', label: 'Items', Icon: ({ size, color }) => <Package size={size} color={color} /> },
  { id: 'customers', label: 'Customers', Icon: ({ size, color }) => <User size={size} color={color} /> },
  
  { id: 'staff', label: 'Staff', Icon: ({ size, color }) => <Users size={size} color={color} /> },
  { id: 'payments', label: 'Payments', Icon: ({ size, color }) => <CreditCard size={size} color={color} /> },
]

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}
const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub }) => (
  <View style={{
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    borderTopWidth: 2,
    borderTopColor: colors.teal,
    overflow: 'hidden',
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{label}</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading, lineHeight: 24 }} numberOfLines={1}>{value}</Text>
        {sub ? <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.teal + '15', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
        {icon}
      </View>
    </View>
  </View>
)

// ─── Section card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <View style={{
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  }}>
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.panel,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: colors.teal + '18', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{title}</Text>
    </View>
    <View style={{ padding: 12 }}>{children}</View>
  </View>
)

// ─── Inner panel (sub-box inside a section) ───────────────────────────────────

const Panel: React.FC<{ label?: string; children: React.ReactNode; style?: any }> = ({ label, children, style }) => (
  <View style={[{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 }, style]}>
    {label ? (
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{label}</Text>
    ) : null}
    {children}
  </View>
)

// ─── Donut chart box ──────────────────────────────────────────────────────────

interface DonutBoxProps {
  pieData: { value: number; color: string; label: string; sub: string }[]
  centerValue: string
  centerLabel: string
  bgColor: string
}
const DonutBox: React.FC<DonutBoxProps> = ({ pieData, centerValue, centerLabel, bgColor }) => (
  <View style={{
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  }}>
    <PieChart
      data={pieData}
      donut
      radius={80}
      innerRadius={54}
      innerCircleColor={bgColor}
      strokeColor={bgColor}
      strokeWidth={3}
      centerLabelComponent={() => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.heading }}>{centerValue}</Text>
          <Text style={{ fontSize: 10, color: colors.muted }}>{centerLabel}</Text>
        </View>
      )}
    />
    {/* Legend below */}
    <View style={{ marginTop: 12, width: '100%', gap: 6 }}>
      {pieData.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
            <Text style={{ fontSize: 11, color: colors.label }}>{item.label}</Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.heading }}>{item.sub}</Text>
        </View>
      ))}
    </View>
  </View>
)

// ─── Date presets ─────────────────────────────────────────────────────────────

const makePresets = () => {
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
  const eod = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d }
  return [
    { label: 'Today', getRange: () => ({ start: today(), end: eod() }) },
    { label: 'Yesterday', getRange: () => { const s = today(); s.setDate(s.getDate() - 1); const e = new Date(s); e.setHours(23, 59, 59, 999); return { start: s, end: e } } },
    { label: 'This Week', getRange: () => { const s = today(); s.setDate(s.getDate() - s.getDay()); return { start: s, end: eod() } } },
    { label: 'Last 7 Days', getRange: () => { const s = today(); s.setDate(s.getDate() - 6); return { start: s, end: eod() } } },
    { label: 'This Month', getRange: () => { const s = today(); s.setDate(1); return { start: s, end: eod() } } },
    { label: 'Last 30 Days', getRange: () => { const s = today(); s.setDate(s.getDate() - 29); return { start: s, end: eod() } } },
  ]
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface MiniCalendarProps {
  value: Date
  onChange: (d: Date) => void
  minDate?: Date
  maxDate?: Date
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ value, onChange, minDate, maxDate }) => {
  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1))

  // Keep cursor in sync when value changes (e.g. modal reopens with different date)
  useEffect(() => {
    setCursor(new Date(value.getFullYear(), value.getMonth(), 1))
  }, [value.getFullYear(), value.getMonth()])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prev = () => setCursor(new Date(year, month - 1, 1))
  const next = () => setCursor(new Date(year, month + 1, 1))

  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <View style={{ backgroundColor: colors.screen, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
      {/* Month nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <TouchableOpacity onPress={prev} style={{ padding: 4 }} activeOpacity={0.7}>
          <ChevronLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={next} style={{ padding: 4 }} activeOpacity={0.7}>
          <ChevronRight size={16} color={colors.teal} />
        </TouchableOpacity>
      </View>
      {/* Day headers */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAYS.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', color: colors.muted }}>{d}</Text>
        ))}
      </View>
      {/* Grid */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} style={{ flex: 1, height: 32 }} />
            const cellDate = new Date(year, month, day)
            const isSelected = value.getDate() === day && value.getMonth() === month && value.getFullYear() === year
            const isDisabled =
              (minDate ? cellDate < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : false) ||
              (maxDate ? cellDate > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()) : false)
            return (
              <TouchableOpacity
                key={col}
                onPress={() => !isDisabled && onChange(cellDate)}
                activeOpacity={isDisabled ? 1 : 0.7}
                style={{ flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: isSelected ? colors.teal : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontSize: 12,
                    fontWeight: isSelected ? '700' : '400',
                    color: isSelected ? colors.onSolid : isDisabled ? colors.muted : colors.heading,
                  }}>{day}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ icon: React.ReactNode; message: string }> = ({ icon, message }) => (
  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
    {icon}
    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10 }}>{message}</Text>
  </View>
)

// ─── Tab: Overview ────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ data: any }> = ({ data }) => (
  <>
    {/* Orders summary */}
    <SectionCard title="Orders" icon={<ShoppingBag size={14} color={colors.teal} />}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatCard icon={<Hash size={14} color={colors.teal} />} label="Total Orders" value={String(data.orders.totalOrders)} sub={`${data.orders.completedOrders} paid`} />
            <StatCard icon={<DollarSign size={14} color={colors.teal} />} label="Revenue" value={fmt$(data.orders.totalRevenue)} sub={fmtFull$(data.orders.totalRevenue)} />
            <StatCard icon={<TrendingUp size={14} color={colors.teal} />} label="Avg Order" value={fmt$(data.orders.averageOrderValue)} />
            <StatCard icon={<ArrowDownLeft size={14} color={colors.teal} />} label="Discounts" value={fmt$(data.orders.totalDiscounts)} />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Panel style={{ flex: 1, flexDirection: undefined }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Status</Text>
              <View style={{ gap: 6 }}>
                {[
                  { label: 'Paid', count: data.orders.completedOrders, color: colors.teal },
                  { label: 'Voided', count: data.orders.voidedOrders, color: colors.danger },
                  { label: 'Cancelled', count: data.orders.cancelledOrders, color: colors.warning },
                ].map((item) => {
                  const total = data.orders.totalOrders || 1
                  const pct = Math.round((item.count / total) * 100)
                  return (
                    <View key={item.label}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} />
                          <Text style={{ fontSize: 11, color: colors.label }}>{item.label}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>{item.count}</Text>
                          <Text style={{ fontSize: 10, color: colors.muted }}>{pct}%</Text>
                        </View>
                      </View>
                      <View style={{ height: 3, backgroundColor: colors.card, borderRadius: 3 }}>
                        <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: item.color, borderRadius: 3, opacity: 0.8 }} />
                      </View>
                    </View>
                  )
                })}
              </View>
            </Panel>

            <Panel style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Collected</Text>
              <View style={{ gap: 4 }}>
                {[
                  { label: 'Tax', value: fmtFull$(data.orders.totalTax) },
                  { label: 'Tips', value: fmtFull$(data.orders.totalTips) },
                ].map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: colors.label }}>{item.label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </Panel>
          </View>
        </View>

        {data.orders.ordersByType.length > 0 && (() => {
          const pieData = data.orders.ordersByType.map((row: any, i: number) => ({
            value: row.count,
            color: CHART_COLORS[i % CHART_COLORS.length],
            label: fmtLabel(row.type),
            sub: `${row.count} · ${fmtFull$(row.revenue)}`,
          }))
          return (
            <DonutBox
              pieData={pieData}
              centerValue={String(data.orders.totalOrders)}
              centerLabel="orders"
              bgColor={colors.panel}
            />
          )
        })()}
      </View>
    </SectionCard>

    {/* Table sessions */}
    <SectionCard title="Table Sessions" icon={<Table2 size={14} color={colors.teal} />}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatCard icon={<Hash size={14} color={colors.teal} />} label="Sessions" value={String(data.sessions.totalSessions)} sub={`${data.sessions.totalCovers} covers`} />
        <StatCard icon={<Users size={14} color={colors.teal} />} label="Avg Party" value={data.sessions.averagePartySize.toFixed(1)} sub="guests / session" />
        <StatCard icon={<Clock size={14} color={colors.teal} />} label="Avg Duration" value={data.sessions.averageDurationMinutes > 0 ? `${Math.round(data.sessions.averageDurationMinutes)}m` : '—'} />
      </View>
    </SectionCard>

  </>
)

// ─── Tab: Items ───────────────────────────────────────────────────────────────

const ItemsTab: React.FC<{ data: any }> = ({ data }) => {
  if (data.topItems.length === 0) {
    return <EmptyState icon={<Package size={32} color={colors.muted} />} message="No item data for this period" />
  }

  return (
    <SectionCard title="Top Selling Items" icon={<Package size={14} color={colors.teal} />}>
      <View style={{ gap: 8 }}>
        {data.topItems.map((item: any, i: number) => (
          <View key={item.itemName} style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.teal, borderRadius: 10, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }} numberOfLines={1}>{item.itemName}</Text>
                  {item.categoryName ? <Text style={{ fontSize: 10, color: colors.muted }}>{item.categoryName}</Text> : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-end' }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>{item.quantity}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>sold</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>{fmtFull$(item.revenue)}</Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>revenue</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </SectionCard>
  )
}

// ─── Tab: Customers ───────────────────────────────────────────────────────────

const CustomersTab: React.FC<{ data: any }> = ({ data }) => {
  if (data.topCustomers.length === 0) {
    return <EmptyState icon={<User size={32} color={colors.muted} />} message="No customer data for this period" />
  }

  return (
    <SectionCard title="Top Customers" icon={<User size={14} color={colors.teal} />}>
      <View style={{ gap: 8 }}>
        {data.topCustomers.map((customer: any) => {
          const initial = (customer.name || '?').charAt(0).toUpperCase()
          return (
            <View key={customer.customerId || customer.name} style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.teal, borderRadius: 10, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }} numberOfLines={1}>{customer.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>{customer.orderCount} {customer.orderCount === 1 ? 'visit' : 'visits'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-end' }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}>{fmtFull$(customer.totalSpend)}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>total spent</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>{fmtFull$(customer.avgSpend)}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>avg order</Text>
                  </View>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </SectionCard>
  )
}


// ─── Tab: Staff ───────────────────────────────────────────────────────────────

const StaffTab: React.FC<{ data: any }> = ({ data }) => {
  if (data.staff.length === 0) {
    return <EmptyState icon={<Users size={32} color={colors.muted} />} message="No staff data for this period" />
  }

  const maxRev = Math.max(...data.staff.map((s: any) => s.revenue), 1)
  const barData = data.staff.map((row: any) => ({
    value: row.revenue,
    label: row.name.split(' ')[0],
    frontColor: colors.teal,
    topLabelComponent: () => (
      <View style={{ width: 44, alignItems: 'center', marginBottom: 3 }}>
        <Text
          style={{ fontSize: 9, color: colors.label, fontWeight: '600' }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {fmt$(row.revenue)}
        </Text>
      </View>
    ),
  }))

  return (
    <>
      <SectionCard title="Staff Performance" icon={<Users size={14} color={colors.teal} />}>
        <Panel label="Revenue by Staff" style={{ marginBottom: 12 }}>
          <BarChart
            data={barData}
            barWidth={28}
            spacing={16}
            roundedTop
            hideRules={false}
            rulesColor={colors.border}
            rulesType="dashed"
            dashWidth={4}
            dashGap={6}
            xAxisColor={colors.border}
            yAxisColor="transparent"
            yAxisThickness={0}
            yAxisTextStyle={{ color: colors.label, fontSize: 9 }}
            xAxisLabelTextStyle={{ color: colors.label, fontSize: 10 }}
            noOfSections={3}
            maxValue={maxRev * 1.25}
            isAnimated
            animationDuration={500}
            barBorderRadius={4}
            backgroundColor={colors.panel}
            formatYLabel={(v) => fmt$(Number(v))}
          />
        </Panel>

        <View style={{ gap: 8 }}>
          {data.staff.map((row: any) => (
            <View
              key={row.staffId}
              style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.teal, borderRadius: 10, padding: 12 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.teal + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal }}>{row.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{row.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>{fmtFull$(row.revenue)}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>revenue</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>{row.orderCount}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>orders</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.label }}>{fmtFull$(row.averageOrderValue)}</Text>
                    <Text style={{ fontSize: 10, color: colors.muted }}>avg order</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </SectionCard>
    </>
  )
}

// ─── Tab: Payments ────────────────────────────────────────────────────────────

const PaymentsTab: React.FC<{ data: any }> = ({ data }) => (
  <SectionCard title="Payments" icon={<CreditCard size={14} color={colors.teal} />}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatCard icon={<DollarSign size={14} color={colors.teal} />} label="Collected" value={fmt$(data.payments.totalAmount)} sub={`${data.payments.totalPayments} txns`} />
          <StatCard icon={<ArrowDownLeft size={14} color={colors.teal} />} label="Refunds" value={String(data.payments.refundCount)} sub={data.payments.refundCount > 0 ? fmtFull$(data.payments.refundAmount) : 'None'} />
        </View>

        {data.payments.byMethod.length > 0 && (
          <Panel label="Breakdown">
            {data.payments.byMethod.map((row: any, i: number) => {
              const total = data.payments.totalAmount || 1
              const pct = Math.round((row.amount / total) * 100)
              return (
                <View key={row.method} style={{ marginBottom: i < data.payments.byMethod.length - 1 ? 8 : 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: colors.heading }}>{fmtLabel(row.method)}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{fmtFull$(row.amount)}</Text>
                  </View>
                  <View style={{ height: 3, backgroundColor: colors.card, borderRadius: 3 }}>
                    <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 3 }} />
                  </View>
                </View>
              )
            })}
          </Panel>
        )}
      </View>

      {data.payments.byMethod.length > 0 && (() => {
        const pieData = data.payments.byMethod.map((row: any, i: number) => ({
          value: row.amount,
          color: CHART_COLORS[i % CHART_COLORS.length],
          label: fmtLabel(row.method),
          sub: fmtFull$(row.amount),
        }))
        return (
          <DonutBox
            pieData={pieData}
            centerValue={String(data.payments.totalPayments)}
            centerLabel="txns"
            bgColor={colors.panel}
          />
        )
      })()}
    </View>
  </SectionCard>
)

// ─── Main screen ──────────────────────────────────────────────────────────────

const AnalyticsDashboardScreen = () => {
  const supabase = useSupabaseClient()
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore)
  const locationId = selectedStore?.id || ''
  const merchantId = selectedStore?.merchant_id || ''
  const { filters, activePresetLabel, data, isLoading, error, setDateRange, fetchData } = useAnalyticsStore()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [showDateModal, setShowDateModal] = useState(false)
  const [tempStart, setTempStart] = useState(filters.dateRange.start)
  const [tempEnd, setTempEnd] = useState(filters.dateRange.end)
  const [activePicker, setActivePicker] = useState<'from' | 'to' | null>(null)

  const presets = makePresets()

  const load = useCallback(() => { fetchData(supabase, locationId, merchantId) }, [supabase, locationId, merchantId, filters.dateRange])
  useEffect(() => { load() }, [filters.dateRange, locationId, merchantId])

  const applyCustomRange = () => {
    const start = new Date(tempStart); start.setHours(0, 0, 0, 0)
    const end = new Date(tempEnd); end.setHours(23, 59, 59, 999)
    setDateRange({ start, end })
    setActivePicker(null)
    setShowDateModal(false)
  }

  const fmtDateRange = () => {
    const s = filters.dateRange.start
    const e = filters.dateRange.end
    if (s.toDateString() === e.toDateString())
      return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Analytics</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{selectedStore?.name || 'All Locations'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => { setTempStart(new Date(filters.dateRange.start)); setTempEnd(new Date(filters.dateRange.end)); setActivePicker(null); setShowDateModal(true) }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '40', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}
              activeOpacity={0.8}
            >
              <Calendar size={13} color={colors.teal} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{fmtDateRange()}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={load} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 7 }} activeOpacity={0.8}>
              {isLoading ? <ActivityIndicator size={14} color={colors.teal} /> : <RefreshCw size={14} color={colors.label} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tab bar ──────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 0 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const iconColor = isActive ? colors.teal : colors.muted
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? colors.teal : 'transparent',
                  marginRight: 2,
                }}
              >
                <tab.Icon size={12} color={iconColor} />
                <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500', color: iconColor }}>{tab.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>

        {error && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30', borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <AlertCircle size={14} color={colors.danger} />
            <Text style={{ fontSize: 12, color: colors.danger, flex: 1 }}>{error}</Text>
          </View>
        )}

        {isLoading && !data && (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>Loading analytics...</Text>
          </View>
        )}

        {data && (
          <>
            {activeTab === 'overview' && <OverviewTab data={data} />}
            {activeTab === 'items' && <ItemsTab data={data} />}
            {activeTab === 'customers' && <CustomersTab data={data} />}
            
            {activeTab === 'staff' && <StaffTab data={data} />}
            {activeTab === 'payments' && <PaymentsTab data={data} />}
          </>
        )}

        {!isLoading && !data && !error && (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>No data available for the selected period.</Text>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Date Range Modal ──────────────────────────────────────── */}
      <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, width: 360, maxWidth: '92%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setShowDateModal(false)} style={{ padding: 4 }}>
                <X size={16} color={colors.label} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {presets.map((p) => {
                const isActive = activePresetLabel === p.label
                return (
                  <TouchableOpacity
                    key={p.label}
                    onPress={() => { setDateRange(p.getRange(), p.label); setActivePicker(null); setShowDateModal(false) }}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: isActive ? colors.teal : colors.screen, borderWidth: 1, borderColor: isActive ? colors.teal : colors.border }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colors.onSolid : colors.label }}>{p.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 14 }} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Custom Range</Text>

            {/* From / To toggle tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(['from', 'to'] as const).map((side) => {
                const isActive = activePicker === side
                const date = side === 'from' ? tempStart : tempEnd
                return (
                  <TouchableOpacity
                    key={side}
                    onPress={() => setActivePicker(isActive ? null : side)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isActive ? colors.teal + '15' : colors.screen, borderWidth: 1, borderColor: isActive ? colors.teal : colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
                    activeOpacity={0.8}
                  >
                    <View>
                      <Text style={{ fontSize: 9, color: isActive ? colors.teal : colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{side === 'from' ? 'From' : 'To'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isActive ? colors.teal : colors.heading }}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    </View>
                    <Calendar size={13} color={isActive ? colors.teal : colors.label} />
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Calendar grid */}
            {activePicker === 'from' && (
              <View style={{ marginBottom: 10 }}>
                <MiniCalendar
                  value={tempStart}
                  maxDate={tempEnd}
                  onChange={(d) => { setTempStart(d); setActivePicker(null) }}
                />
              </View>
            )}
            {activePicker === 'to' && (
              <View style={{ marginBottom: 10 }}>
                <MiniCalendar
                  value={tempEnd}
                  minDate={tempStart}
                  onChange={(d) => { setTempEnd(d); setActivePicker(null) }}
                />
              </View>
            )}

            <TouchableOpacity onPress={applyCustomRange} style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }} activeOpacity={0.8}>
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Apply Range</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

export default AnalyticsDashboardScreen
