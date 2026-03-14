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
  UtensilsCrossed
} from 'lucide-react-native'
import React, { useState } from 'react'
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
  isHighlighted?: boolean
}

const MenuCard: React.FC<MenuCardProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  isLocked = false,
  onLockPress,
  isHighlighted = false
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`w-full h-full rounded-2xl border border-gray-700 p-6 ${
        isHighlighted ? 'bg-blue-50' : 'bg-surface'
      }`}
      style={{ minHeight: 140 }}
    >
      <View className='justify-center h-full w-full flex'>
        <View className='flex-row justify-center items-center w-full h-full relative'>
          <View className=' w-full h-full flex items-center justify-center'>
            <View className='mb-3'>{icon}</View>
            <Text className='text-3xl font-bold text-white mb-1 text-center'>
              {title}
            </Text>
            <Text className='text-xl text-gray-200 text-center'>
              {subtitle}
            </Text>
          </View>
          {isLocked && (
            <TouchableOpacity
              onPress={onLockPress}
              className='p-3 bg-gray-800 rounded-lg absolute top-0 right-0'
            >
              <Lock color='white' size={24} />
            </TouchableOpacity>
          )}
        </View>
      </View>
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
    // TODO: Implement actual PIN validation logic
    // For now, we'll accept any 4-digit PIN
    if (currentPin.length === 4) {
      setPinDialogOpen(false)
      if (targetRoute) {
        router.push(targetRoute as any)
      }
      setCurrentPin('')
      setTargetRoute(null)
    }
  }

  const menuItems = [
    {
      id: 'home',
      icon: <Home color={colors.info} size={48} />,
      title: 'Sales',
      subtitle: 'Process Orders',
      route: '/order-processing',
      isHighlighted: false
    },
    {
      id: 'tables',
      icon: <Table color={colors.info} size={48} />,
      title: 'Tables',
      subtitle: 'Manage Seating',
      route: '/tables',
      isHighlighted: false
    },
    {
      id: 'previous-orders',
      icon: <History color={colors.info} size={48} />,
      title: 'Previous Orders',
      subtitle: 'Order History',
      route: '/previous-orders',
      isHighlighted: false
    },
    {
      id: 'online-orders',
      icon: <ShoppingBag color={colors.info} size={48} />,
      title: 'Online Orders',
      subtitle: 'Web & App Orders',
      route: '/online-orders',
      isHighlighted: false
    },
    {
      id: 'kds',
      icon: <ChefHat color={colors.info} size={48} />,
      title: 'Kitchen Display',
      subtitle: 'Manage Orders',
      route: '/kds',
      isHighlighted: false
    },
    // {
    //   id: "order-test",
    //   icon: <FlaskConical color="#10b981" size={48} />,
    //   title: "Order Test",
    //   subtitle: "Test Order Flow",
    //   route: "/order-test",
    //   isHighlighted: false,
    // },
    // {
    //   id: "order-store-test",
    //   icon: <TestTube color="#10b981" size={48} />,
    //   title: "Order Store Test",
    //   subtitle: "Debug Order Store",
    //   route: "/order-store-test",
    //   isHighlighted: false,
    // },
    {
      id: 'scheduling',
      icon: <CalendarClock color={colors.info} size={48} />,
      title: 'Scheduling',
      subtitle: 'Time Management',
      route: '/scheduling',
      isLocked: true,
      isHighlighted: false
    },
    // {
    //   id: "floorplan-test",
    //   icon: <Table2 color="#10b981" size={48} />,
    //   title: "Floor Plan Test",
    //   subtitle: "Test Floor Plan",
    //   route: "/floor-plan-test",
    //   isLocked: false,
    //   isHighlighted: false,
    // },

    // {
    //     id: "customers",
    //     icon: <Users color={colors.info} size={48} />,
    //     title: "Customers",
    //     subtitle: "Customer Database",
    //     route: "/customers-list",
    //     isHighlighted: false,
    // },
    {
      id: 'menu-management',
      icon: <UtensilsCrossed color={colors.info} size={48} />,
      title: 'Menu Management',
      subtitle: 'Edit Menu Items',
      route: '/menu',
      isLocked: true,
      isHighlighted: false
    },
    {
      id: 'inventory',
      icon: <Package color={colors.info} size={48} />,
      title: 'Inventory',
      subtitle: 'Stock Management',
      route: '/inventory',
      isLocked: true,
      isHighlighted: false
    },
    {
      id: 'analytics',
      icon: <BarChart3 color={colors.info} size={48} />,
      title: 'Analytics',
      subtitle: 'Sales Reports',
      route: '/analytics',
      isLocked: true,
      isHighlighted: false
    },
    {
      id: 'settings',
      icon: <Settings color={colors.info} size={48} />,
      title: 'Settings',
      subtitle: 'System Config',
      route: '/settings',
      isLocked: true,
      isHighlighted: false
    },
    {
      id: 'castlestest',
      icon: <Shield />,
      title: 'Castles Test',
      subtitle: 'Castles device test',
      route: '/castlestest',
      isLocked: false,
      isHighlighted: false
    }
  ]

  return (
    <View className='w-full h-full flex-1 bg-panel'>
      <ScrollView
        className='w-full flex-1'
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className='flex-row flex-wrap gap-4 w-full items-center justify-center'>
          {menuItems.map((item, index) => (
            <View
              key={item.id}
              className='w-1/4 h-48'
              style={{ marginBottom: 16 }}
            >
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
                isHighlighted={item.isHighlighted}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Manager PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className='w-fit h-fit bg-surface border-gray-600 p-8'>
          <DialogHeader>
            <DialogTitle className='text-center text-3xl font-semibold text-white'>
              Manager Access Required
            </DialogTitle>
          </DialogHeader>
          <View className='py-4'>
            <Text className='text-center text-2xl text-gray-300 mb-6'>
              Enter your manager PIN to access this feature
            </Text>
            <PinDisplay pinLength={currentPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={input => {
                if (typeof input === 'number') {
                  if (currentPin.length < 4) {
                    const newPin = currentPin + input.toString()
                    setCurrentPin(newPin)
                    if (newPin.length === 4) {
                      setTimeout(() => {
                        handlePinSubmit()
                      }, 100)
                    }
                  }
                } else if (input === 'clear') {
                  setCurrentPin('')
                } else if (input === 'backspace') {
                  setCurrentPin(currentPin.slice(0, -1))
                }
              }}
            />

            <TouchableOpacity
              onPress={handlePinSubmit}
              className='p-4 bg-blue-600 rounded-lg w-full self-center mt-6'
            >
              <Text className='text-center text-2xl font-bold text-white'>
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
