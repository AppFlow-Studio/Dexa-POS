import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { ChecklistItem, ChecklistItemId, DrawerBreakdownItem } from '@/stores/useEndOfDayStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { formatCurrency } from '@/utils/currency'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

interface EodStepCashProps {
  checklist: ChecklistItem[]
  drawerBreakdown?: DrawerBreakdownItem[]
  onOpenCashDrawer: () => void
  onRefresh: () => Promise<void> | void
}

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find(i => i.id === id)

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return iso
  }
}

export default function EodStepCash ({
  checklist,
  drawerBreakdown: externalBreakdown,
  onOpenCashDrawer,
  onRefresh
}: EodStepCashProps) {
  const supabase = useSupabaseClient()
  const locationId = useStoreSettingsStore(s => s.selectedStore?.id)
  const drawerItem = resolveItem(checklist, 'cash_drawer_closed')
  const isPassed = drawerItem?.status === 'passed'
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null)

  // Self-fetch drawer breakdown if not provided by parent
  const [localBreakdown, setLocalBreakdown] = useState<DrawerBreakdownItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchBreakdown = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    try {
      const businessDate = new Date().toISOString().split('T')[0]
      const { data: sessions } = await supabase
        .from('cash_drawer_sessions')
        .select('id, cash_drawer_id, opening_amount, closing_amount, expected_cash, variance, status')
        .eq('location_id', locationId)
        .eq('business_date', businessDate)

      if (!sessions?.length) {
        setLocalBreakdown([])
        return
      }

      const drawerIds = [...new Set(sessions.map((s: any) => s.cash_drawer_id))]
      const { data: drawers } = await supabase
        .from('cash_drawers')
        .select('id, name')
        .in('id', drawerIds)

      const drawerNameMap: Record<string, string> = {}
      for (const d of drawers || []) {
        drawerNameMap[d.id] = d.name
      }

      const sessionIds = sessions.map((s: any) => s.id)
      const { data: allOps } = await supabase
        .from('cash_drawer_operations')
        .select('id, session_id, operation_type, amount, performed_at, performed_by, reason, approved_by, performer:staff_profiles!cash_drawer_operations_performed_by_fkey(display_name)')
        .in('session_id', sessionIds)

      const opsBySession: Record<string, any[]> = {}
      for (const op of allOps || []) {
        if (!opsBySession[op.session_id]) opsBySession[op.session_id] = []
        opsBySession[op.session_id].push(op)
      }

      const breakdown: DrawerBreakdownItem[] = sessions.map((s: any) => {
        const ops = opsBySession[s.id] || []
        const sumType = (type: string) =>
          ops.filter((o: any) => o.operation_type === type)
            .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0)
        const countType = (type: string) =>
          ops.filter((o: any) => o.operation_type === type).length

        const noSaleOps = ops.filter((o: any) => o.operation_type === 'no_sale')

        return {
          drawerName: drawerNameMap[s.cash_drawer_id] || 'Unknown',
          sessionId: s.id,
          opening: Number(s.opening_amount || 0),
          closing: Number(s.closing_amount || 0),
          expected: Number(s.expected_cash || 0),
          variance: Number(s.variance || 0),
          cashSales: sumType('cash_sale'),
          refunds: sumType('cash_refund'),
          payIns: sumType('pay_in'),
          payOuts: sumType('pay_out'),
          cashDrops: sumType('cash_drop'),
          noSaleCount: countType('no_sale'),
          noSaleEvents: noSaleOps.map((o: any) => ({
            id: o.id,
            performedAt: o.performed_at,
            performedBy: o.performed_by,
            performedByName: o.performer?.display_name || undefined,
            reason: o.reason || null,
            approvedBy: o.approved_by || null,
          })),
          status: s.status,
        }
      })

      setLocalBreakdown(breakdown)
    } catch (err) {
      console.warn('[EodStepCash] Failed to fetch breakdown:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, locationId])

  useEffect(() => {
    if (!externalBreakdown) {
      fetchBreakdown()
    }
  }, [externalBreakdown, fetchBreakdown])

  const drawerBreakdown = externalBreakdown || localBreakdown

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 10 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
          gap: 10
        }}
      >
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 10,
            gap: 4
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: colors.teal,
              textTransform: 'uppercase',
              letterSpacing: 0.6
            }}
          >
            Cash drawer status
          </Text>
          <Text
            style={{ fontSize: 20, fontWeight: '800', color: colors.heading }}
          >
            {isPassed ? 'Closed' : 'Needs review'}
          </Text>
          <Text
            style={{ fontSize: 10.5, color: colors.label }}
            numberOfLines={1}
          >
            {drawerItem?.detail ||
              'Run reconciliation and close remaining drawers'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenCashDrawer}
            style={{
              flexGrow: 1,
              flexBasis: 220,
              minHeight: 42,
              borderRadius: 12,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              paddingHorizontal: 10,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11.5, fontWeight: '700', color: colors.teal }}
            >
              Open Cash Drawer Sheet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              void onRefresh()
              fetchBreakdown()
            }}
            style={{
              flexGrow: 1,
              flexBasis: 160,
              minHeight: 42,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11.5, fontWeight: '600', color: colors.label }}
            >
              Refresh status
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Per-drawer breakdown cards */}
      {loading && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.teal} />
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Loading drawer sessions...</Text>
        </View>
      )}

      {drawerBreakdown && drawerBreakdown.length > 0 && (
        <ScrollView
          style={{ flex: 1, marginTop: 4 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {drawerBreakdown.map((drawer, idx) => {
            const hasVariance = Math.abs(drawer.variance) > 0
            const isExpanded = expandedDrawer === (drawer.sessionId || String(idx))
            const hasFlags = (drawer.suspiciousPatterns?.length || 0) > 0

            return (
              <View
                key={drawer.sessionId || idx}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: hasFlags
                    ? colors.danger + '50'
                    : hasVariance
                      ? '#fbbf2450'
                      : colors.border,
                  backgroundColor: colors.panel,
                  padding: 10,
                }}
              >
                {/* Drawer header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                      {drawer.drawerName}
                    </Text>
                    <View style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: (drawer as any).status === 'closed' ? colors.teal + '20' : '#fbbf2420',
                    }}>
                      <Text style={{
                        fontSize: 9,
                        fontWeight: '700',
                        color: (drawer as any).status === 'closed' ? colors.teal : '#fbbf24',
                      }}>
                        {(drawer as any).status === 'closed' ? 'Closed' : 'Open'}
                      </Text>
                    </View>
                  </View>
                  {hasVariance && (
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: drawer.variance < 0 ? colors.danger : colors.teal,
                    }}>
                      {drawer.variance > 0 ? '+' : ''}{formatCurrency(drawer.variance)}
                    </Text>
                  )}
                </View>

                {/* Key numbers */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: colors.muted }}>Expected</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.heading }}>{formatCurrency(drawer.expected)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: colors.muted }}>Actual</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.heading }}>{formatCurrency(drawer.closing)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: colors.muted }}>No-Sales</Text>
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: drawer.noSaleCount > 0 ? '#fbbf24' : colors.heading,
                    }}>
                      {drawer.noSaleCount}
                    </Text>
                  </View>
                </View>

                {/* Suspicious patterns */}
                {hasFlags && (
                  <View style={{
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    backgroundColor: colors.danger + '10',
                    borderWidth: 1,
                    borderColor: colors.danger + '30',
                    borderRadius: 8,
                    marginBottom: 6,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger, marginBottom: 2 }}>
                      {drawer.suspiciousPatterns!.length} suspicious pattern(s) detected
                    </Text>
                    {drawer.suspiciousPatterns!.map((sp, i) => (
                      <Text key={i} style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>
                        {sp.description}
                      </Text>
                    ))}
                  </View>
                )}

                {/* Expandable no-sale events */}
                {drawer.noSaleCount > 0 && (
                  <TouchableOpacity
                    onPress={() => setExpandedDrawer(
                      isExpanded ? null : (drawer.sessionId || String(idx))
                    )}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 6,
                      backgroundColor: '#fbbf2410',
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#fbbf24' }}>
                      {isExpanded ? 'Hide' : 'Show'} No-Sale Details ({drawer.noSaleCount})
                    </Text>
                  </TouchableOpacity>
                )}

                {isExpanded && drawer.noSaleEvents && (
                  <View style={{ marginTop: 6, gap: 3 }}>
                    {drawer.noSaleEvents.map((ev) => (
                      <View key={ev.id} style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        backgroundColor: '#fbbf2408',
                        borderRadius: 6,
                      }}>
                        <Text style={{ fontSize: 10, color: '#fbbf24', fontWeight: '600' }}>
                          {formatTime(ev.performedAt)} — {ev.performedByName || 'Staff'}
                        </Text>
                        <Text style={{ fontSize: 10, color: colors.muted }}>
                          {ev.reason || 'No reason'}
                          {ev.approvedBy ? ' (approved)' : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {!loading && drawerBreakdown && drawerBreakdown.length === 0 && (
        <View style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>No drawer sessions found for today</Text>
        </View>
      )}

      <View style={{ height: 92 }}>
        <EodChecklistRow
          title='Cash drawer close'
          description={drawerItem?.description}
          status={drawerItem?.status || 'pending'}
          detail={drawerItem?.detail}
          centerContent
          containerStyle={{ flex: 1, paddingVertical: 6 }}
        />
      </View>

      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.teal + '50',
          backgroundColor: colors.teal + '15',
          paddingHorizontal: 12,
          paddingVertical: 10
        }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.teal }}>
          {isPassed
            ? 'Cash drawer checks are complete.'
            : 'This step resolves when drawers are reconciled and closed.'}
        </Text>
      </View>
    </View>
  )
}
