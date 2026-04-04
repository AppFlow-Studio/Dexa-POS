import { colors } from '@/lib/theme'
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
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        padding: 12,
        gap: 10
      }}
    >
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 14,
          gap: 10
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <View style={{ flex: 1, gap: 6, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 10,
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
                fontSize: 17,
                fontWeight: '800',
                color: colors.heading,
                lineHeight: 21
              }}
            >
              {title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, lineHeight: 17 }}>
              {subtitle}
            </Text>
          </View>
          <View
            style={{
              minWidth: 52,
              height: 52,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.teal + '12',
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: colors.teal,
                textTransform: 'uppercase'
              }}
            >
              Step
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: colors.heading,
                lineHeight: 20
              }}
            >
              {currentStep + 1}
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 8,
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
          gap: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 10
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={onBack}
            disabled={!canGoBack}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canGoBack ? 1 : 0.4
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={14} color={colors.label} />
              <Text
                style={{ fontWeight: '700', fontSize: 12, color: colors.label }}
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
              minHeight: 44,
              borderRadius: 12,
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text
                  style={{
                    fontWeight: '800',
                    fontSize: 12,
                    color: colors.onSolid
                  }}
                >
                  {nextLabel}
                </Text>
                <ArrowRight size={14} color={colors.onSolid} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        {!canGoNext && hasBlockingItems && onContinueWithIssues ? (
          <TouchableOpacity
            onPress={onContinueWithIssues}
            style={{
              minHeight: 44,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.warning + '50',
              backgroundColor: colors.warning + '15',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{
                fontSize: 12.5,
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
