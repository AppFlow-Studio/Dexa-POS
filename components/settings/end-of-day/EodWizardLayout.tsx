import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { ArrowLeft, ArrowRight } from 'lucide-react-native'
import React from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

interface EodWizardLayoutProps {
  title: string
  subtitle: string
  currentStep: number
  totalSteps: number
  canGoBack: boolean
  canGoNext: boolean
  isNextLoading?: boolean
  nextLabel?: string
  hasBlockingItems?: boolean
  onBack: () => void
  onNext: () => void
  onContinueWithIssues?: () => void
}

export default function EodWizardLayout ({
  title,
  subtitle,
  currentStep,
  totalSteps,
  canGoBack,
  canGoNext,
  isNextLoading = false,
  nextLabel = 'Next',
  hasBlockingItems = false,
  onBack,
  onNext,
  onContinueWithIssues,
  children
}: React.PropsWithChildren<EodWizardLayoutProps>) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <View
      style={{
        flex: 1,
        borderRadius: s(20),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        padding: s(12),
        gap: s(10)
      }}
    >
      <View
        style={{
          borderRadius: s(16),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: s(14),
          gap: s(10)
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: s(12)
          }}
        >
          <View style={{ flex: 1, gap: s(6), paddingRight: s(12) }}>
            <Text
              style={{
                fontSize: s(10),
                fontWeight: '700',
                color: colors.teal,
                textTransform: 'uppercase',
                letterSpacing: 0.8
              }}
            >
              Step {currentStep + 1} / {totalSteps}
            </Text>
            <Text
              style={{
                fontSize: s(17),
                fontWeight: '800',
                color: colors.heading,
                lineHeight: s(21)
              }}
            >
              {title}
            </Text>
            <Text style={{ fontSize: s(12), color: colors.label, lineHeight: s(17) }}>
              {subtitle}
            </Text>
          </View>
          <View
            style={{
              minWidth: s(52),
              height: s(52),
              borderRadius: s(16),
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.teal + '12',
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                fontWeight: '700',
                color: colors.teal,
                textTransform: 'uppercase'
              }}
            >
              Step
            </Text>
            <Text
              style={{
                fontSize: s(18),
                fontWeight: '800',
                color: colors.heading,
                lineHeight: s(20)
              }}
            >
              {currentStep + 1}
            </Text>
          </View>
        </View>

        <View
          style={{
            height: s(8),
            borderRadius: 999,
            backgroundColor: colors.border,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: `${Math.max(
                8,
                Math.min(100, ((currentStep + 1) / totalSteps) * 100)
              )}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: colors.teal
            }}
          />
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>

      <View
        style={{
          gap: s(10),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: s(10)
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <TouchableOpacity
            onPress={onBack}
            disabled={!canGoBack}
            style={{
              flex: 1,
              minHeight: s(44),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canGoBack ? 1 : 0.4
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
            >
              <ArrowLeft size={s(14)} color={colors.label} />
              <Text
                style={{ fontWeight: '700', fontSize: s(12), color: colors.label }}
              >
                Back
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            disabled={!canGoNext || isNextLoading}
            style={{
              flex: 2,
              minHeight: s(44),
              borderRadius: s(12),
              backgroundColor: canGoNext ? colors.teal : colors.teal + '66',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canGoNext ? 1 : 0.4
            }}
          >
            {isNextLoading ? (
              <ActivityIndicator color={colors.onSolid} />
            ) : (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: s(12),
                    color: colors.onSolid
                  }}
                >
                  {nextLabel}
                </Text>
                <ArrowRight size={s(14)} color={colors.onSolid} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        {!canGoNext && hasBlockingItems && onContinueWithIssues ? (
          <TouchableOpacity
            onPress={onContinueWithIssues}
            style={{
              minHeight: s(44),
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.warning + '50',
              backgroundColor: colors.warning + '15',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{
                fontSize: s(12.5),
                fontWeight: '700',
                color: colors.warning
              }}
            >
              Continue with issues
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}
