import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { SupabaseClient } from '@supabase/supabase-js'
import { Clock, TrendingDown, TrendingUp } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

interface WaitTimeAccuracyMetrics {
  avgDelta: number // Average difference (actual - quoted), in minutes
  avgAbsoluteDelta: number // Average absolute difference |actual - quoted|
  accurateCount: number // Count where actual was within ±5 mins of quoted
  optimisticCount: number // Count where actual was faster than quoted
  pessimisticCount: number // Count where actual was slower than quoted
  totalSamples: number // Total entries with both quoted and actual wait times
  seatedRowsSeen: number
  usedAllTimeFallback: boolean
  dataSource: 'table' | 'rpc'
  lastUpdated: string
}

interface WaitTimeAccuracyCardProps {
  client: SupabaseClient
  locationId?: string
  dateRangeStart?: string
  dateRangeEnd?: string
}

export const WaitTimeAccuracyCard: React.FC<WaitTimeAccuracyCardProps> = ({
  client,
  locationId,
  dateRangeStart,
  dateRangeEnd
}) => {
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const [metrics, setMetrics] = useState<WaitTimeAccuracyMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const effectiveLocationId = locationId || selectedStore?.id || ''

  useEffect(() => {
    if (!effectiveLocationId) {
      setLoading(false)
      setMetrics(null)
      return
    }

    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)
      try {
        // Prefer direct table read so we can include historical seated rows.
        const { data: tableRows, error: tableError } = await client
          .from('waitlist')
          .select(
            'quoted_wait_minutes, actual_wait_minutes, created_at, seated_at, status, seated_session_id'
          )
          .eq('location_id', effectiveLocationId)
          .not('quoted_wait_minutes', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2000)

        let rows: any[] = []
        let dataSource: 'table' | 'rpc' = 'table'

        if (!tableError && Array.isArray(tableRows) && tableRows.length > 0) {
          rows = tableRows
        } else {
          // Fallback to RPC if direct table read is unavailable in current role policies.
          const { data, error: queryError } = await client.rpc('get_waitlist', {
            p_location_id: effectiveLocationId,
            p_include_completed: true
          })

          if (queryError) throw queryError
          rows = Array.isArray(data?.waitlist) ? data.waitlist : []
          dataSource = 'rpc'
        }

        const startMs = dateRangeStart
          ? new Date(dateRangeStart).getTime()
          : null
        const endMs = dateRangeEnd ? new Date(dateRangeEnd).getTime() : null

        const toSeatedRows = (entries: any[], applyDateFilter: boolean) =>
          entries.filter((entry: any) => {
            const isSeated =
              !!entry.actual_wait_minutes ||
              !!entry.seated_at ||
              !!entry.seated_session_id ||
              entry.status === 'seated'
            if (!isSeated) return false

            if (!applyDateFilter || (startMs === null && endMs === null))
              return true

            const seatTs = entry.seated_at
              ? new Date(entry.seated_at).getTime()
              : entry.created_at
              ? new Date(entry.created_at).getTime()
              : NaN

            if (Number.isNaN(seatTs)) return false
            if (startMs !== null && seatTs < startMs) return false
            if (endMs !== null && seatTs > endMs) return false
            return true
          })

        let usedAllTimeFallback = false
        let seatedRows = toSeatedRows(rows, true)

        if (
          seatedRows.length === 0 &&
          (dateRangeStart !== undefined || dateRangeEnd !== undefined)
        ) {
          seatedRows = toSeatedRows(rows, false)
          usedAllTimeFallback = seatedRows.length > 0
        }

        if (seatedRows.length === 0) {
          setMetrics({
            avgDelta: 0,
            avgAbsoluteDelta: 0,
            accurateCount: 0,
            optimisticCount: 0,
            pessimisticCount: 0,
            totalSamples: 0,
            seatedRowsSeen: 0,
            usedAllTimeFallback: false,
            dataSource,
            lastUpdated: new Date().toISOString()
          })
          return
        }

        // Calculate metrics
        let totalDelta = 0
        let totalAbsoluteDelta = 0
        let accurateCount = 0
        let optimisticCount = 0
        let pessimisticCount = 0
        let validSamples = 0

        for (const entry of seatedRows) {
          const quoted = entry.quoted_wait_minutes || 0
          const derivedActual =
            entry.seated_at && entry.created_at
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date(entry.seated_at).getTime() -
                      new Date(entry.created_at).getTime()) /
                      60000
                  )
                )
              : null

          const actual =
            entry.actual_wait_minutes ??
            (typeof derivedActual === 'number' ? derivedActual : null)

          if (actual === null) continue

          const delta = actual - quoted
          validSamples++

          totalDelta += delta
          totalAbsoluteDelta += Math.abs(delta)

          if (delta >= -5 && delta <= 5) {
            accurateCount++
          } else if (delta < -5) {
            optimisticCount++ // We estimated longer than actual
          } else {
            pessimisticCount++ // We estimated shorter than actual (bad!)
          }
        }

        if (validSamples === 0) {
          setMetrics({
            avgDelta: 0,
            avgAbsoluteDelta: 0,
            accurateCount: 0,
            optimisticCount: 0,
            pessimisticCount: 0,
            totalSamples: 0,
            seatedRowsSeen: seatedRows.length,
            usedAllTimeFallback,
            dataSource,
            lastUpdated: new Date().toISOString()
          })
          return
        }

        const avgDelta = Math.round(totalDelta / validSamples)
        const avgAbsoluteDelta = Math.round(totalAbsoluteDelta / validSamples)

        setMetrics({
          avgDelta,
          avgAbsoluteDelta,
          accurateCount,
          optimisticCount,
          pessimisticCount,
          totalSamples: validSamples,
          seatedRowsSeen: seatedRows.length,
          usedAllTimeFallback,
          dataSource,
          lastUpdated: new Date().toISOString()
        })
      } catch (err: any) {
        console.error('Failed to fetch wait accuracy metrics:', err)
        setError(err.message || 'Failed to load metrics')
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const intervalId = setInterval(fetchMetrics, 15000)

    return () => {
      clearInterval(intervalId)
    }
  }, [client, effectiveLocationId, dateRangeStart, dateRangeEnd])

  if (loading) {
    return (
      <View className='bg-panel p-6 rounded-2xl border border-border mb-4 items-center justify-center h-48'>
        <ActivityIndicator color={colors.info} size={32} />
      </View>
    )
  }

  if (!effectiveLocationId) {
    return (
      <View className='bg-panel p-6 rounded-2xl border border-border mb-4'>
        <Text className='text-gray-300 text-sm'>
          Select a store location to view wait time accuracy metrics.
        </Text>
      </View>
    )
  }

  if (error || !metrics) {
    return (
      <View className='bg-panel p-6 rounded-2xl border border-border mb-4'>
        <Text className='text-red-400'>
          {error || 'Failed to load metrics'}
        </Text>
      </View>
    )
  }

  const accuracyPercentage =
    metrics.totalSamples > 0
      ? Math.round((metrics.accurateCount / metrics.totalSamples) * 100)
      : 0

  const isUnderestimating = metrics.pessimisticCount > metrics.optimisticCount
  const trendIcon = isUnderestimating ? (
    <TrendingDown color='#ef4444' size={20} />
  ) : (
    <TrendingUp color='#10b981' size={20} />
  )

  return (
    <View className='bg-panel p-6 rounded-2xl border border-border mb-4'>
      {/* Header */}
      <View className='flex-row items-center mb-4'>
        <View className='w-12 h-12 bg-purple-900/30 rounded-xl items-center justify-center mr-4'>
          <Clock color='#a78bfa' size={24} />
        </View>
        <View className='flex-1'>
          <Text className='text-xl font-bold text-white'>
            Wait Time Accuracy
          </Text>
          <Text className='text-xs text-gray-400 mt-1'>
            Based on {metrics.totalSamples} seating
            {metrics.totalSamples !== 1 ? 's' : ''}
          </Text>
          <Text className='text-[10px] text-gray-500 mt-1'>
            Seated rows seen: {metrics.seatedRowsSeen}
          </Text>
          <Text className='text-[10px] text-gray-500 mt-1'>
            Source: {metrics.dataSource}
          </Text>
          {metrics.usedAllTimeFallback && (
            <Text className='text-[10px] text-amber-400 mt-1'>
              Showing all-time data (current date filter had no seated rows)
            </Text>
          )}
        </View>
      </View>

      {/* Main Metric */}
      <View className='bg-screen/50 p-4 rounded-xl mb-4'>
        <View className='flex-row items-baseline gap-2 mb-2'>
          <Text className='text-4xl font-bold text-white'>
            {metrics.avgAbsoluteDelta}
          </Text>
          <Text className='text-gray-400'>minutes avg error</Text>
          {metrics.avgDelta !== 0 && trendIcon}
        </View>
        <Text className='text-sm text-gray-400'>
          {metrics.avgAbsoluteDelta <= 2
            ? 'Excellent estimate accuracy'
            : metrics.avgAbsoluteDelta <= 5
            ? 'Good estimate accuracy'
            : metrics.avgAbsoluteDelta <= 10
            ? 'Fair estimate accuracy'
            : 'Estimates need improvement'}
        </Text>
        <Text className='text-xs text-gray-500 mt-1'>
          Bias:{' '}
          {metrics.avgDelta === 0
            ? 'on target'
            : metrics.avgDelta > 0
            ? `${metrics.avgDelta} min slower than quoted`
            : `${Math.abs(metrics.avgDelta)} min faster than quoted`}
        </Text>
      </View>

      {/* Accuracy Breakdown */}
      <View className='gap-2'>
        {/* Accurate */}
        <View className='flex-row items-center justify-between p-3 rounded-lg bg-green-900/20'>
          <Text className='text-green-300 text-sm font-medium'>
            Within ±5 min (Accurate)
          </Text>
          <View className='flex-row items-center gap-2'>
            <View className='w-12 h-6 bg-green-600/40 rounded items-center justify-center'>
              <Text className='text-green-300 text-xs font-bold'>
                {metrics.totalSamples > 0
                  ? Math.round(
                      (metrics.accurateCount / metrics.totalSamples) * 100
                    )
                  : 0}
                %
              </Text>
            </View>
            <Text className='text-green-300 text-xs'>
              {metrics.accurateCount}/{metrics.totalSamples}
            </Text>
          </View>
        </View>

        {/* Overestimated (good) */}
        <View className='flex-row items-center justify-between p-3 rounded-lg bg-blue-900/20'>
          <Text className='text-blue-300 text-sm font-medium'>
            Faster than quoted (Optimistic)
          </Text>
          <View className='flex-row items-center gap-2'>
            <View className='w-12 h-6 bg-blue-600/40 rounded items-center justify-center'>
              <Text className='text-blue-300 text-xs font-bold'>
                {metrics.totalSamples > 0
                  ? Math.round(
                      (metrics.optimisticCount / metrics.totalSamples) * 100
                    )
                  : 0}
                %
              </Text>
            </View>
            <Text className='text-blue-300 text-xs'>
              {metrics.optimisticCount}/{metrics.totalSamples}
            </Text>
          </View>
        </View>

        {/* Underestimated (bad) */}
        <View className='flex-row items-center justify-between p-3 rounded-lg bg-red-900/20'>
          <Text className='text-red-300 text-sm font-medium'>
            Slower than quoted (Pessimistic)
          </Text>
          <View className='flex-row items-center gap-2'>
            <View className='w-12 h-6 bg-red-600/40 rounded items-center justify-center'>
              <Text className='text-red-300 text-xs font-bold'>
                {metrics.totalSamples > 0
                  ? Math.round(
                      (metrics.pessimisticCount / metrics.totalSamples) * 100
                    )
                  : 0}
                %
              </Text>
            </View>
            <Text className='text-red-300 text-xs'>
              {metrics.pessimisticCount}/{metrics.totalSamples}
            </Text>
          </View>
        </View>
      </View>

      {/* Interpretation */}
      <View className='mt-4 pt-4 border-t border-border'>
        <Text className='text-xs text-gray-400'>
          {metrics.avgDelta > 0
            ? '🔴 Guests are waiting longer than quoted. Consider adjusting turn time estimates.'
            : metrics.avgDelta < 0
            ? '🟢 Guests are getting seated faster than expected. Great efficiency!'
            : '🟡 Wait estimates are well-calibrated.'}
        </Text>
      </View>
    </View>
  )
}

export default WaitTimeAccuracyCard
