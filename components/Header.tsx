import { colors } from '@/lib/theme'
import {
  getActiveVendorSidebarId,
  requestVendorSidebarClose,
  subscribeActiveVendorSidebarId
} from '@/lib/vendorSidebarControl'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useInventoryStore } from '@/stores/useInventoryStore'
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
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
import { TerminalConnectionBadge } from './TerminalConnectionBadge'

const Header = () => {
  const pathname = usePathname()
  const router = useRouter()
  const overlayTableId = usePendingTableOverlay(s => s.openTableId)
  const closeTableOverlay = usePendingTableOverlay(s => s.closeTable)
  const vendors = useInventoryStore(s => s.vendors)
  // Header is mounted app-wide and never unmounts, so subscribing to the whole
  // tablesById map re-rendered it on every table mutation across all screens.
  // The title only ever needs the ONE table referenced by the current route or
  // overlay — resolve that id, then subscribe to just its name string.
  const relevantTableId = useMemo(() => {
    if (overlayTableId) return overlayTableId
    const parts = pathname.split('/')
    if (pathname.startsWith('/tables/clean-table/') && parts.length === 4)
      return parts[3]
    if (
      pathname.startsWith('/tables/') &&
      parts.length === 3 &&
      !pathname.startsWith('/tables/edit-layout') &&
      !pathname.startsWith('/tables/floor-plan')
    )
      return parts[2]
    return null
  }, [pathname, overlayTableId])
  const relevantTableName = useFloorPlanStore(s =>
    relevantTableId ? s.tablesById[relevantTableId]?.name ?? null : null
  )
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
    // Table order overlay (rendered on top of the /tables floor plan)
    if (overlayTableId) {
      return relevantTableName
        ? `Tables / ${relevantTableName}`
        : 'Table Details'
    }
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
      if (relevantTableName) {
        return `Tables / ${relevantTableName}`
      }
      return 'Table Details'
    } else if (
      pathname.startsWith('/tables/clean-table/') &&
      pathname.split('/').length === 4
    ) {
      if (relevantTableName) {
        return `Clean / ${relevantTableName}`
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
  }, [pathname, activeVendorId, relevantTableName, vendors, overlayTableId])

  const handleBackPress = useCallback(() => {
    // Close the table order overlay instead of navigating away from /tables.
    if (overlayTableId) {
      closeTableOverlay()
      return
    }

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

    // Table detail is normally pushed over the already-mounted floor screen.
    // Pop immediately so the preserved grid can paint before unmount cleanup.
    if (
      pathname.startsWith('/tables/') &&
      pathname.split('/').length === 3 &&
      !pathname.includes('edit-layout')
    ) {
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace('/tables' as Href)
      }
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

    // Top-level sections have no back stack (navigated via replace) — go home
    const TOP_LEVEL_SECTIONS = [
      '/order-processing',
      '/previous-orders',
      '/kds',
      '/online-orders',
      '/loyalty',
      '/scheduling',
      '/analytics',
      '/menu',
      '/host-station',
      '/customers-list',
    ]
    if (TOP_LEVEL_SECTIONS.includes(pathname) || TOP_LEVEL_SECTIONS.some(s => pathname.startsWith(s + '/'))) {
      if (router.canGoBack()) {
        router.back()
      } else {
        router.replace('/home')
      }
      return
    }

    router.back()
  }, [
    activeVendorId,
    globalParams.returnTo,
    cancelAndRemoveDraft,
    closeModifierSidebar,
    pathname,
    router,
    overlayTableId,
    closeTableOverlay
  ])

  return (
    <View className='flex-row justify-between items-center py-1'>
      {/* Left Section */}
      <View className='flex-row items-center flex-shrink-0 gap-2'>
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBackPress}
            className='rounded-lg items-center justify-center'
            style={{
              width: 35,
              height: 35,
              backgroundColor: `${colors.teal}18`
            }}
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

      {/* Center Section - Network + Terminal Connection Badges */}
      <View
        className='absolute left-0 right-0 items-center justify-center'
        pointerEvents='box-none'
      >
        <View pointerEvents='auto' className='flex-row items-center gap-2'>
          <NetworkStatusBadge />
          <TerminalConnectionBadge />
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
