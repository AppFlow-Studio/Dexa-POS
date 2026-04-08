import { colors } from '@/lib/theme'
import { router } from 'expo-router'
import { ArrowLeft, Globe } from 'lucide-react-native'
import { Text, TouchableOpacity, View } from 'react-native'

interface GlobalItemScreenProps {
  type: 'Menu' | 'Category' | 'Item' | 'Modifier'
}

export function GlobalItemScreen({ type }: GlobalItemScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      {/* Content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        {/* Icon */}
        <View style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          backgroundColor: colors.teal + '15',
          borderWidth: 1,
          borderColor: colors.teal + '30',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20
        }}>
          <Globe size={28} color={colors.teal} />
        </View>

        {/* Badge */}
        <View style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: colors.teal + '18',
          borderWidth: 1,
          borderColor: colors.teal + '35',
          marginBottom: 12
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Global {type}
          </Text>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.heading, marginBottom: 10 }}>
          Read-Only {type}
        </Text>

        {/* Description */}
        <Text style={{
          fontSize: 13,
          color: colors.muted,
          textAlign: 'center',
          lineHeight: 21,
          marginBottom: 28,
          maxWidth: 320
        }}>
          This {type.toLowerCase()} is managed globally across all locations and cannot be edited here. Contact your administrator to make changes.
        </Text>

        {/* Info card */}
        <View style={{
          backgroundColor: colors.card + 'cc',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 14,
          gap: 8,
          width: '100%',
          maxWidth: 320,
          marginBottom: 24
        }}>
          {[
            'Name and details are locked',
            'Pricing cannot be modified',
            'Availability is globally managed'
          ].map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted }} />
              <Text style={{ fontSize: 12, color: colors.muted, flex: 1 }}>{line}</Text>
            </View>
          ))}
        </View>

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.teal + '18',
            borderWidth: 1,
            borderColor: colors.teal + '35'
          }}
        >
          <ArrowLeft size={14} color={colors.teal} />
          <Text style={{ fontSize: 13, color: colors.teal, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
