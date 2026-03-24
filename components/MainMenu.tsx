import { colors } from '@/lib/theme'
import { useRouter } from 'expo-router'
import {
  BarChart3,
  CalendarClock,
  ChefHat,
  History,
  Home,
  Lock,
  Package,
  Settings,
  Shield,
  ShoppingBag,
  Table,
  UtensilsCrossed,
} from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import PinDisplay from './auth/PinDisplay'
import PinNumpad from './auth/PinNumpad'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface MenuCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  onPress: () => void
  isLocked?: boolean
  onLockPress?: () => void
}

const MenuCard: React.FC<MenuCardProps> = ({
  icon,
  title,
  onPress,
  isLocked = false,
  onLockPress,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
      }}
    >
      {isLocked && (
        <TouchableOpacity
          onPress={onLockPress}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
          }}
        >
          <Lock color={colors.muted} size={11} />
        </TouchableOpacity>
      )}

      {/* Icon */}
      <View
        style={{
          width: 43,
          height: 43,
          borderRadius: 10,
          backgroundColor: colors.teal + '18',
          borderWidth: 1,
          borderColor: colors.teal + '30',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        {icon}
      </View>

      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: colors.heading,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
    </TouchableOpacity>
  )
}

const MainMenu: React.FC = () => {
  const router = useRouter()
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [targetRoute, setTargetRoute] = useState<string | null>(null)

  const handleLockedAccess = (route: string) => {
    setTargetRoute(route)
    setPinDialogOpen(true)
    setCurrentPin('')
  }

  const handlePinSubmit = () => {
    if (currentPin.length === 4) {
      setPinDialogOpen(false)
      if (targetRoute) router.push(targetRoute as any)
      setCurrentPin('')
      setTargetRoute(null)
    }
  }

  const menuItems = [
    {
      id: 'home',
      icon: <Home color={colors.teal} size={20} />,
      title: 'Sales',
      subtitle: 'Process Orders',
      route: '/order-processing',
    },
    {
      id: 'tables',
      icon: <Table color={colors.teal} size={20} />,
      title: 'Tables',
      subtitle: 'Manage Seating',
      route: '/tables',
    },
    {
      id: 'previous-orders',
      icon: <History color={colors.teal} size={20} />,
      title: 'Previous Orders',
      subtitle: 'Order History',
      route: '/previous-orders',
    },
    {
      id: 'online-orders',
      icon: <ShoppingBag color={colors.teal} size={20} />,
      title: 'Online Orders',
      subtitle: 'Web & App Orders',
      route: '/online-orders',
    },
    {
      id: 'kds',
      icon: <ChefHat color={colors.teal} size={20} />,
      title: 'Kitchen Display',
      subtitle: 'Manage Orders',
      route: '/kds',
    },
    {
      id: 'scheduling',
      icon: <CalendarClock color={colors.teal} size={20} />,
      title: 'Scheduling',
      subtitle: 'Time Management',
      route: '/scheduling',
      isLocked: true,
    },
    {
      id: 'menu-management',
      icon: <UtensilsCrossed color={colors.teal} size={20} />,
      title: 'Menu Management',
      subtitle: 'Edit Menu Items',
      route: '/menu',
      isLocked: true,
    },
    {
      id: 'inventory',
      icon: <Package color={colors.teal} size={20} />,
      title: 'Inventory',
      subtitle: 'Stock Management',
      route: '/inventory',
      isLocked: true,
    },
    {
      id: 'analytics',
      icon: <BarChart3 color={colors.teal} size={20} />,
      title: 'Analytics',
      subtitle: 'Sales Reports',
      route: '/analytics',
      isLocked: true,
    },
    {
      id: 'settings',
      icon: <Settings color={colors.teal} size={20} />,
      title: 'Settings',
      subtitle: 'System Config',
      route: '/settings',
      isLocked: true,
    },
    {
      id: 'castlestest',
      icon: <Shield color={colors.teal} size={20} />,
      title: 'Castles Test',
      subtitle: 'Castles device test',
      route: '/castlestest',
    },
  ]

  const regularItems = menuItems.filter((item) => !item.isLocked)
  const managementItems = menuItems.filter((item) => item.isLocked)

  const renderRow = (items: typeof menuItems) => (
    <View style={{ flexDirection: 'row', gap: 20, justifyContent: 'center' }}>
      {items.map((item) => (
        <View key={item.id} style={{ width: 150, height: 150 }}>
          <MenuCard
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => {
              if (item.isLocked) {
                handleLockedAccess(item.route)
              } else {
                router.push(item.route as any)
              }
            }}
            isLocked={item.isLocked}
            onLockPress={() => handleLockedAccess(item.route)}
          />
        </View>
      ))}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          gap: 50,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 10, color: colors.heading, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', padding: 10 }}>
            Operations
          </Text>
          {renderRow(regularItems)}
        </View>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 10, color: colors.heading, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', padding: 10 }}>
            Management
          </Text>
          {renderRow(managementItems)}
        </View>
      </ScrollView>

      {/* Manager PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="w-fit h-fit p-0">
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 24,
              minWidth: 320,
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading, textAlign: 'center' }}>
                  Manager Access Required
                </Text>
              </DialogTitle>
            </DialogHeader>

            <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
              Enter your manager PIN to continue
            </Text>

            <PinDisplay pinLength={currentPin.length} maxLength={4} />

            <View style={{ marginTop: 10 }}>
              <PinNumpad
                onKeyPress={(input) => {
                  if (typeof input === 'number') {
                    if (currentPin.length < 4) {
                      const newPin = currentPin + input.toString()
                      setCurrentPin(newPin)
                      if (newPin.length === 4) setTimeout(handlePinSubmit, 100)
                    }
                  } else if (input === 'clear') {
                    setCurrentPin('')
                  } else if (input === 'backspace') {
                    setCurrentPin(currentPin.slice(0, -1))
                  }
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handlePinSubmit}
              disabled={currentPin.length < 4}
              style={{
                marginTop: 14,
                paddingVertical: 11,
                backgroundColor: currentPin.length === 4 ? colors.teal : colors.teal + '30',
                borderRadius: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '700',
                color: currentPin.length === 4 ? colors.onSolid : colors.muted,
              }}>
                Enter
              </Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  )
}

export default MainMenu
