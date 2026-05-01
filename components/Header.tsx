import { colors } from '@/lib/theme'
import {
  getActiveVendorSidebarId,
  requestVendorSidebarClose,
  subscribeActiveVendorSidebarId
} from '@/lib/vendorSidebarControl'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useInventoryStore } from '@/stores/useInventoryStore'
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import {
  Href,
  useGlobalSearchParams,
  usePathname,
  useRouter
} from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import React, { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { NetworkStatusBadge } from './NetworkStatusBadge'
import SessionDock from './SessionDock'

const Header = () => {
  const pathname = usePathname()
  const router = useRouter()
  const tablesById = useFloorPlanStore(s => s.tablesById)
  const vendors = useInventoryStore(s => s.vendors)
  const globalParams = useGlobalSearchParams()
  const instantVendorId = useSyncExternalStore(
    subscribeActiveVendorSidebarId,
    getActiveVendorSidebarId
  )
  const activeVendorId = useMemo(() => {
    if (instantVendorId) return instantVendorId
    const raw = globalParams.vendorId
    if (Array.isArray(raw)) return raw[0]
    return typeof raw === 'string' ? raw : undefined
  }, [globalParams.vendorId, instantVendorId])

  const showBackButton =
    pathname === '/open-shifts' ||
    pathname === '/pto' ||
    pathname === '/requests' ||
    pathname == '/menu' ||
    pathname === '/scheduling' ||
    (pathname.startsWith('/scheduling/') && pathname.split('/').length === 3) ||
    (pathname.startsWith('/scheduling/templates/') &&
      pathname.split('/').length === 4) ||
    pathname === '/tables' ||
    pathname === '/tables/edit-layout' ||
    pathname === '/inventory' ||
    pathname === '/analytics' ||
    pathname === '/previous-orders' ||
    pathname === '/order-processing' ||
    pathname === '/kds' ||
    pathname === '/online-orders' ||
    pathname === '/customers-list' ||
    pathname === '/host-station' ||
    pathname === '/loyalty' ||
    pathname.startsWith('/loyalty/') ||
    pathname.startsWith('/settings') ||
    pathname === '/settings/floor-plan' ||
    pathname.startsWith('/analytics') ||
    (pathname.startsWith('/analytics-dashboard') &&
      pathname.split('/').length > 2) ||
    (pathname.startsWith('/menu/') && pathname.split('/').length > 2) ||
    (pathname.startsWith('/inventory/') && pathname.split('/').length > 2) ||
    (pathname.startsWith('/online-orders/') &&
      pathname.split('/').length > 2) ||
    (pathname.startsWith('/previous-orders/') &&
      pathname.split('/').length > 2) ||
    (pathname.startsWith('/tables/') && pathname.split('/').length === 3) ||
    (pathname.startsWith('/tables/clean-table/') &&
      pathname.split('/').length === 4)
  const cancelAndRemoveDraft = useModifierSidebarStore(
    state => state.cancelAndRemoveDraft
  )
  const closeModifierSidebar = useModifierSidebarStore(state => state.close)
  const title = useMemo(() => {
    if (pathname === '/loyalty') return 'Loyalty'
    if (pathname === '/loyalty/program-form') return 'Loyalty Program'
    if (pathname === '/loyalty/enroll-customer') return 'Enroll Customer'
    if (pathname === '/' || pathname === '/home') return 'Menu'
    if (pathname === '/host-station') return 'Host Station'
    if (pathname === '/scheduling/reports') return 'Reports'
    if (pathname === '/scheduling/templates') return 'Schdule Templates'
    if (pathname === '/scheduling/templates/create')
      return 'Create New Template'
    if (pathname.startsWith('/scheduling/templates/')) return 'Edit Template'
    if (pathname.startsWith('/scheduling/') && pathname.split('/').length === 3)
      return 'Scheduling Dashboard'
    if (pathname === '/pto') return 'PTO'
    if (pathname === '/order-processing') return 'Back to Menu'
    if (pathname === '/kds') return 'Kitchen Display'
    if (pathname.startsWith('/previous-orders')) return 'Back to Menu'
    if (pathname === '/inventory/vendors' && activeVendorId) {
      const vendor = vendors.find(v => v.id === activeVendorId)
      return `Vendors / ${vendor?.name ?? 'Vendor'}`
    }
    if (pathname.startsWith('/inventory/vendors/')) {
      const vendorId = pathname.split('/').filter(Boolean)[2]
      const vendor = vendors.find(v => v.id === vendorId)
      return `Vendors / ${vendor?.name ?? 'Vendor'}`
    }
    if (pathname.startsWith('/inventory/vendors')) return 'Vendors'
    if (pathname.startsWith('/inventory/purchase-orders'))
      return 'Purchase Orders'
    if (pathname.startsWith('/inventory')) return 'Inventory'

    if (
      pathname.startsWith('/online-orders/') &&
      pathname.split('/').length > 2
    ) {
      return 'Online Order Details'
    } else if (
      pathname.startsWith('/previous-orders/') &&
      pathname.split('/').length > 2
    ) {
      return 'Previous Order Details'
    } else if (pathname.startsWith('/tables/floor-plan')) {
      return 'Floor Plan'
    } else if (
      pathname.startsWith('/tables/edit-layout') &&
      pathname.split('/').length === 3
    ) {
      return 'Edit Layout'
    } else if (
      pathname.startsWith('/tables/') &&
      pathname.split('/').length === 3
    ) {
      const tableId = pathname.split('/')[2]
      const table = tablesById[tableId]
      if (table) {
        return `Tables / ${table.name}`
      }
      return 'Table Details'
    } else if (
      pathname.startsWith('/tables/clean-table/') &&
      pathname.split('/').length === 4
    ) {
      const tableId = pathname.split('/')[3]
      const table = tablesById[tableId]
      if (table) {
        return `Clean / ${table.name}`
      }
      return 'Clean Table'
    }

    const pathParts = pathname.split('/').filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1]

    if (!lastPart) return 'Order Line'
    const title = lastPart
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())

    return title
  }, [pathname, activeVendorId, tablesById, vendors])

  const handleBackPress = useCallback(() => {
    if (pathname === '/inventory/vendors' && activeVendorId) {
      requestVendorSidebarClose()
      return
    }

    if (
      pathname.startsWith('/inventory/vendors/') &&
      pathname.split('/').filter(Boolean).length >= 3
    ) {
      router.replace('/inventory/vendors' as Href)
      return
    }

    // Check for explicit returnTo parameter first
    if (globalParams.returnTo && typeof globalParams.returnTo === 'string') {
      router.push(globalParams.returnTo as Href)
      return
    }
    cancelAndRemoveDraft()
    closeModifierSidebar()

    const pathParts = pathname.split('/').filter(Boolean)

    if (
      pathname.startsWith('/inventory') &&
      !pathname.includes('/purchase-orders/')
    ) {
      router.replace('/home')
      return
    }

    if (pathname.startsWith('/settings')) {
      if (pathParts.length > 2) {
        // router.push("/settings");
      } else {
        router.replace('/home')
      }
      return
    }

    // Handle table detail pages (/tables/[tableId]) -> always go to /tables
    // Uses replace to avoid navigation loop issues
    if (
      pathname.startsWith('/tables/') &&
      pathname.split('/').length === 3 &&
      !pathname.includes('edit-layout')
    ) {
      router.replace('/tables' as Href)
      return
    }

    // Handle clean-table pages (/tables/clean-table/[tableId]) -> always go to /tables
    if (
      pathname.startsWith('/tables/clean-table/') &&
      pathname.split('/').length === 4
    ) {
      router.replace('/tables' as Href)
      return
    }

    // /tables back button -> always go to /home to avoid loop with table details
    if (pathname === '/tables') {
      router.replace('/home')
      return
    }

    router.back()
  }, [
    activeVendorId,
    globalParams.returnTo,
    cancelAndRemoveDraft,
    closeModifierSidebar,
    pathname,
    router
  ])

  return (
    <View className='flex-row justify-between items-center py-1'>
      {/* Left Section */}
      <View className='flex-row items-center flex-shrink-0 gap-2'>
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBackPress}
            className='p-2 rounded-lg'
            style={{ backgroundColor: `${colors.teal}18` }}
          >
            <ArrowLeft color={colors.teal} size={19} />
          </TouchableOpacity>
        )}
        <Text
          className='text-base font-semibold tracking-wide'
          style={{ color: colors.heading }}
        >
          {title}
        </Text>
      </View>

      {/* Center Section - Network Status Badge */}
      <View
        className='absolute left-0 right-0 items-center justify-center'
        pointerEvents='box-none'
      >
        <View pointerEvents='auto'>
          <NetworkStatusBadge />
        </View>
      </View>

      {/* Right Section */}
      <View className='flex-shrink-0 mr-4'>
        <SessionDock />
      </View>
    </View>
  )
}

export default React.memo(Header)
