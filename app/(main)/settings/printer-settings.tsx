import DevicesConnectionsScreen from './devices-connections'
import { colors } from '@/lib/theme'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import React, { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { Switch } from '~/components/ui/switch'

interface ReceiptSettings {
  showTaxBreakdown: boolean
  showItemizedList: boolean
  showTips: boolean
  footerMessage: string
}

function SectionHeader ({ title }: { title: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 6,
        paddingHorizontal: 2
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.6
        }}
      >
        {title}
      </Text>
    </View>
  )
}

function ToggleRow ({
  label,
  subtitle,
  value,
  onToggle
}: {
  label: string
  subtitle?: string
  value: boolean
  onToggle: (val: boolean) => void
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: colors.card,
        borderRadius: 8,
        marginBottom: 4
      }}
    >
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text
          style={{
            fontSize: 13,
            color: colors.heading,
            marginBottom: subtitle ? 2 : 0
          }}
        >
          {label}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: 11, color: colors.muted }}>{subtitle}</Text>
        )}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  )
}

function ReceiptAndOrderSettings () {
  const printingConfig = useLocationConfigStore(s => s.config.printing)
  const updateConfig = useLocationConfigStore(s => s.updateConfig)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    showTaxBreakdown: true,
    showItemizedList: true,
    showTips: true,
    footerMessage: 'Thank you for your visit!'
  })

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 10
      }}
    >
      <SectionHeader title='Receipt Settings' />
      <ToggleRow
        label='Print Merchant Copy'
        subtitle='Retains a copy for your records'
        value={printingConfig.printMerchantCopy}
        onToggle={v => updateConfig('printing', { printMerchantCopy: v })}
      />
      <ToggleRow
        label='Print Customer Copy'
        subtitle='Gives a copy to the guest'
        value={printingConfig.printCustomerCopy}
        onToggle={v => updateConfig('printing', { printCustomerCopy: v })}
      />
      <ToggleRow
        label='Show Tax Breakdown'
        value={receiptSettings.showTaxBreakdown}
        onToggle={() =>
          setReceiptSettings(prev => ({
            ...prev,
            showTaxBreakdown: !prev.showTaxBreakdown
          }))
        }
      />
      <ToggleRow
        label='Show Itemized List'
        value={receiptSettings.showItemizedList}
        onToggle={() =>
          setReceiptSettings(prev => ({
            ...prev,
            showItemizedList: !prev.showItemizedList
          }))
        }
      />
      <ToggleRow
        label='Show Tip Options'
        value={receiptSettings.showTips}
        onToggle={() =>
          setReceiptSettings(prev => ({ ...prev, showTips: !prev.showTips }))
        }
      />
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginTop: 4
        }}
      >
        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>
          Footer Message
        </Text>
        <TextInput
          value={receiptSettings.footerMessage}
          onChangeText={footerMessage =>
            setReceiptSettings(prev => ({ ...prev, footerMessage }))
          }
          style={{ fontSize: 13, color: colors.heading, paddingVertical: 2 }}
          placeholder='Thank you message'
          placeholderTextColor={colors.muted}
        />
      </View>

      <SectionHeader title='Order Settings' />
      <ToggleRow
        label='Auto-Print Kitchen Tickets'
        value={printingConfig.autoPrintKitchenTickets}
        onToggle={v => updateConfig('printing', { autoPrintKitchenTickets: v })}
      />
      <ToggleRow
        label='Auto-Print Receipt After Payment'
        value={printingConfig.autoPrintReceipt}
        onToggle={v => updateConfig('printing', { autoPrintReceipt: v })}
      />
    </View>
  )
}

export default function PrinterSettingsScreen () {
  return (
    <DevicesConnectionsScreen
      mode='printers'
      afterPrinters={<ReceiptAndOrderSettings />}
    />
  )
}
