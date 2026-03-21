import FilterControls from '@/components/analytics/FilterControls'
import GiftedChartsSalesTrendChart from '@/components/analytics/GiftedChartsSalesTrendChart'
import KpiTooltip from '@/components/analytics/KpiTooltip'
import WaitTimeAccuracyCard from '@/components/analytics/WaitTimeAccuracyCard'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import { useAnalyticsStore } from '@/stores/useAnalyticsStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useRouter } from 'expo-router'
import {
  BarChart3,
  Calendar,
  DollarSign,
  Hash,
  Package,
  PieChart,
  Plus,
  ShoppingCart,
  ShoppingBag,
  TrendingUp,
  Users
} from 'lucide-react-native'
import React, { useEffect } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'

interface ReportCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onPress: () => void
}

const ReportCard: React.FC<ReportCardProps> = ({
  title,
  description,
  icon,
  onPress
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      width: '48.5%'
    }}
    activeOpacity={0.8}
  >
    <View className='flex-row items-center mb-2'>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: colors.teal + '15',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10
        }}
      >
        {icon}
      </View>
      <View className='flex-1'>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
          {description}
        </Text>
      </View>
    </View>
  </TouchableOpacity>
)

const AnalyticsDashboardScreen = () => {
  const router = useRouter()
  const supabaseClient = useSupabaseClient()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const {
    savedCustomReports,
    currentReportData,
    isLoading,
    error,
    fetchReportData,
    filters,
    forceRefresh
  } = useAnalyticsStore()

  const currentLocationId = selectedStore?.id || ''

  const dateRangeStartIso = filters?.dateRange?.start
    ? new Date(filters.dateRange.start).toISOString()
    : undefined
  const dateRangeEndIso = filters?.dateRange?.end
    ? new Date(filters.dateRange.end).toISOString()
    : undefined

  // Helper function to generate smart date range titles
  const getDateRangeTitle = (baseTitle: string) => {
    if (
      !currentReportData?.salesTrends ||
      currentReportData.salesTrends.length === 0
    ) {
      return baseTitle
    }

    const dates = currentReportData.salesTrends.map(
      trend => new Date(trend.date)
    )
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())))

    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()

    if (startYear === endYear) {
      return `${baseTitle} - ${startYear}`
    } else {
      return `${baseTitle} - ${startYear} - ${endYear}`
    }
  }

  useEffect(() => {
    // Load overview data on mount
    fetchReportData({ type: 'overview' })
  }, [])

  const preBuiltReports = [
    {
      id: 'sales-summary',
      title: 'Sales Summary',
      description: 'Overview of total sales, orders, and key metrics',
      icon: <TrendingUp color={colors.teal} size={16} />,
      chartType: 'line'
    },
    {
      id: 'item-sales',
      title: 'Item Sales',
      description: 'Best selling items and sales performance',
      icon: <ShoppingCart color={colors.teal} size={16} />,
      chartType: 'pie'
    },
    {
      id: 'sales-by-hour',
      title: 'Sales by Hour',
      description: 'Peak hours and hourly sales patterns',
      icon: <Calendar color={colors.teal} size={16} />,
      chartType: 'line'
    },
    {
      id: 'sales-by-employee',
      title: 'Sales by Employee',
      description: 'Individual employee performance metrics',
      icon: <Users color={colors.teal} size={16} />,
      chartType: 'pie'
    },
    {
      id: 'discounts',
      title: 'Discounts',
      description: 'Discount usage and impact on revenue',
      icon: <PieChart color={colors.teal} size={16} />,
      chartType: 'line'
    },
    {
      id: 'payments',
      title: 'Payments',
      description: 'Payment methods and transaction analysis',
      icon: <Package color={colors.teal} size={16} />,
      chartType: 'pie'
    },
    {
      id: 'revenue-by-category',
      title: 'Revenue by Category',
      description: 'Revenue breakdown by menu categories',
      icon: <PieChart color={colors.teal} size={16} />,
      chartType: 'pie'
    },
    {
      id: 'items-sold-by-category',
      title: 'Items Sold by Category',
      description: 'Number of items sold per menu category',
      icon: <BarChart3 color={colors.teal} size={16} />,
      chartType: 'pie'
    },
    {
      id: 'category-performance',
      title: 'Category Performance',
      description: 'Comprehensive category analysis with revenue and volume',
      icon: <TrendingUp color={colors.teal} size={16} />,
      chartType: 'bar'
    }
  ]

  const handleReportPress = (reportId: string, chartType?: string) => {
    router.push({
      pathname: '/analytics/report-view',
      params: {
        reportType: reportId,
        chartType: chartType || 'bar'
      }
    })
  }

  const handleCustomReportPress = (report: any) => {
    router.push({
      pathname: '/analytics/report-view',
      params: {
        customReport: JSON.stringify(report)
      }
    })
  }

  const handleCreateCustomReport = () => {
    router.push('/analytics/custom-report-builder')
  }

  return (
    <View className='flex-1 bg-screen'>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {/* Header */}
        <View className='mb-4'>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.heading, marginBottom: 2 }}>
            Analytics & Reports
          </Text>
          <Text style={{ fontSize: 12, color: colors.label }}>
            Analyze your business performance with detailed reports
          </Text>
        </View>

        {/* Filter Controls */}
        <FilterControls />

        {/* Debug Button */}
        <TouchableOpacity
          onPress={() => {
            console.log('🔄 Debug: Force refreshing analytics...')
            forceRefresh()
          }}
          style={{
            marginTop: 8,
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            alignSelf: 'flex-start'
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Force Refresh
          </Text>
        </TouchableOpacity>

        {/* KPI Cards */}
        {isLoading && !currentReportData && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Key Performance Indicators
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, height: 90 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.card, marginBottom: 10 }} />
                  <View style={{ width: '60%', height: 14, borderRadius: 6, backgroundColor: colors.card, marginBottom: 6 }} />
                  <View style={{ width: '40%', height: 10, borderRadius: 4, backgroundColor: colors.card }} />
                </View>
              ))}
            </View>
          </View>
        )}
        {currentReportData && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Key Performance Indicators
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Gross Margin */}
              <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.teal + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={14} color={colors.teal} />
                  </View>
                  <KpiTooltip definition='Percentage of revenue remaining after subtracting cost of goods sold' />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>{currentReportData.kpis.grossMargin.toFixed(1)}%</Text>
                <Text style={{ fontSize: 11, color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Gross Margin</Text>
              </View>

              {/* Total Revenue */}
              <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.success + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={14} color={colors.success} />
                  </View>
                  <KpiTooltip definition='Total sales revenue for the selected period' />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>${currentReportData.kpis.totalRevenue.toFixed(0)}</Text>
                <Text style={{ fontSize: 11, color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Total Revenue</Text>
              </View>

              {/* Avg Order Value */}
              <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.info + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag size={14} color={colors.info} />
                  </View>
                  <KpiTooltip definition='Average value per order' />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>${currentReportData.kpis.averageOrderValue.toFixed(2)}</Text>
                <Text style={{ fontSize: 11, color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Avg Order Value</Text>
              </View>

              {/* Total Orders */}
              <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.warning + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Hash size={14} color={colors.warning} />
                  </View>
                  <KpiTooltip definition='Total number of orders placed' />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>{currentReportData.kpis.totalOrders}</Text>
                <Text style={{ fontSize: 11, color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Total Orders</Text>
              </View>
            </View>
          </View>
        )}

        {/* Sales Trend Chart */}
        {isLoading && !currentReportData && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>Sales Trend</Text>
            <View style={{ height: 220, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.teal} size="small" />
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>Loading chart...</Text>
            </View>
          </View>
        )}
        {currentReportData && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Sales Trend
            </Text>
            {/* <ReportChart
              data={currentReportData.chartData}
              chartType="line"
              title={getDateRangeTitle("Revenue Over Time")}
            /> */}
            <GiftedChartsSalesTrendChart />
          </View>
        )}

        {/* Fast & Slow Movers */}
        {currentReportData && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
              Inventory Analysis
            </Text>
            <View className='flex-row gap-3'>
              <View className='flex-1'>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Top 5 Fast Movers
                </Text>
                <View
                  style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 12
                  }}
                >
                  {currentReportData.inventoryAnalysis.fastMovers.map(
                    (item, index) => (
                      <View
                        key={index}
                        className='flex-row justify-between items-center py-2 border-b border-border last:border-b-0'
                      >
                        <Text style={{ fontSize: 12, color: colors.heading, flex: 1 }}>
                          {item.itemName}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
                          {item.totalSold}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </View>

              <View className='flex-1'>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Top 5 Slow Movers
                </Text>
                <View
                  style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 12
                  }}
                >
                  {currentReportData.inventoryAnalysis.slowMovers.map(
                    (item, index) => (
                      <View
                        key={index}
                        className='flex-row justify-between items-center py-2 border-b border-border last:border-b-0'
                      >
                        <Text style={{ fontSize: 12, color: colors.heading, flex: 1 }}>
                          {item.itemName}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>
                          {item.totalSold}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Wait Time Accuracy Metrics */}
        <View style={{ marginTop: 16 }}>
          <WaitTimeAccuracyCard
            client={supabaseClient}
            locationId={currentLocationId}
            dateRangeStart={dateRangeStartIso}
            dateRangeEnd={dateRangeEndIso}
          />
        </View>

        {/* Pre-built Reports Section */}
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading, marginBottom: 8 }}>
            Pre-built Reports
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {preBuiltReports.map(report => (
              <ReportCard
                key={report.id}
                title={report.title}
                description={report.description}
                icon={report.icon}
                onPress={() => handleReportPress(report.id, report.chartType)}
              />
            ))}
          </View>
        </View>

        {/* Custom Reports Section */}
        <View style={{ marginTop: 16 }}>
          <View className='flex-row items-center justify-between mb-3'>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
              Custom Reports
            </Text>
            <TouchableOpacity
              onPress={handleCreateCustomReport}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5
              }}
              activeOpacity={0.8}
            >
              <Plus color={colors.teal} size={14} />
              <Text style={{ color: colors.teal, fontWeight: '600', fontSize: 12, marginLeft: 4 }}>Create</Text>
            </TouchableOpacity>
          </View>

          {savedCustomReports.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {savedCustomReports.map(report => (
                <ReportCard
                  key={report.id}
                  title={report.name}
                  description={`Metrics: ${report.metrics.join(
                    ', '
                  )} | Breakdown: ${report.breakdown}`}
                  icon={<BarChart3 color={colors.teal} size={16} />}
                  onPress={() => handleCustomReportPress(report)}
                />
              ))}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 24,
                alignItems: 'center'
              }}
            >
              <BarChart3 color={colors.muted} size={36} />
              <Text style={{ fontSize: 13, color: colors.label, marginTop: 10, textAlign: 'center' }}>
                No custom reports yet
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4, textAlign: 'center' }}>
                Create your first custom report to get started
              </Text>
              <TouchableOpacity
                onPress={handleCreateCustomReport}
                style={{
                  marginTop: 12,
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50',
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 7
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: colors.teal, fontWeight: '600', fontSize: 12 }}>Create Report</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default AnalyticsDashboardScreen
