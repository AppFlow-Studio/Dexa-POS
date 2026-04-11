import { colors } from '@/lib/theme'
import { downloadAndInstallApk, type VersionManifest } from '@/services/appUpdater'
import { ArrowDownToLine, RefreshCw } from 'lucide-react-native'
import React, { useState } from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'

interface AppUpdateModalProps {
  visible: boolean
  manifest: VersionManifest
  onSkip: () => void
  onInstallComplete: () => void
}

type DownloadState = 'idle' | 'downloading' | 'error'

const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  visible,
  manifest,
  onSkip,
  onInstallComplete,
}) => {
  const [downloadState, setDownloadState] = useState<DownloadState>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleInstall = async () => {
    setDownloadState('downloading')
    setProgress(0)
    setErrorMsg(null)
    try {
      await downloadAndInstallApk(manifest.apkUrl, (p) => setProgress(p))
      onInstallComplete()
    } catch (e: unknown) {
      setDownloadState('error')
      setErrorMsg(e instanceof Error ? e.message : 'Download failed. Please try again.')
    }
  }

  const handleRetry = () => {
    setDownloadState('idle')
    setErrorMsg(null)
  }

  const progressPct = Math.round(progress * 100)

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={manifest.forceUpdate ? undefined : onSkip}>
      <Pressable
        onPress={manifest.forceUpdate ? undefined : onSkip}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: 380,
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 16,
          }}
        >
          {/* Accent top bar */}
          <View style={{ height: 3, backgroundColor: colors.teal }} />

          <View style={{ padding: 20 }}>
            {/* Icon + Title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: colors.teal + '18',
                borderWidth: 1, borderColor: colors.teal + '40',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <ArrowDownToLine size={18} color={colors.teal} />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>Update Available</Text>
                <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>Version {manifest.version}</Text>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />

            {/* Release notes */}
            <Text style={{ fontSize: 12, color: colors.label, lineHeight: 18, marginBottom: 16 }}>
              {manifest.releaseNotes}
            </Text>

            {/* Progress bar — only shown while downloading */}
            {downloadState === 'downloading' && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      backgroundColor: colors.teal,
                      borderRadius: 3,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4, textAlign: 'right' }}>
                  {progressPct}%
                </Text>
              </View>
            )}

            {/* Error message */}
            {downloadState === 'error' && errorMsg && (
              <Text style={{ fontSize: 11, color: colors.danger, marginBottom: 14 }}>{errorMsg}</Text>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Skip — hidden for forceUpdate or while downloading */}
              {!manifest.forceUpdate && downloadState !== 'downloading' && (
                <TouchableOpacity
                  onPress={onSkip}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: colors.card,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Skip</Text>
                </TouchableOpacity>
              )}

              {/* Install / Retry */}
              {downloadState === 'error' ? (
                <TouchableOpacity
                  onPress={handleRetry}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'row', gap: 6,
                    backgroundColor: colors.teal + '20',
                    borderWidth: 1, borderColor: colors.teal + '50',
                  }}
                >
                  <RefreshCw size={14} color={colors.teal} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>Retry</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={downloadState === 'idle' ? handleInstall : undefined}
                  disabled={downloadState === 'downloading'}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: downloadState === 'downloading' ? colors.teal + '10' : colors.teal + '20',
                    borderWidth: 1, borderColor: colors.teal + '50',
                    opacity: downloadState === 'downloading' ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
                    {downloadState === 'downloading' ? 'Downloading…' : 'Install'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default AppUpdateModal
