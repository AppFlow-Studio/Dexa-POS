// src/components/cfd/CFDStatusBadge.tsx
import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Monitor, MonitorOff } from 'lucide-react-native'
import { useCFD } from '@/hooks/useCFD'

interface CFDStatusBadgeProps {
  onPress?: () => void
}

export function CFDStatusBadge({ onPress }: CFDStatusBadgeProps) {
  const { isConnected, clientCount, serverInfo } = useCFD()

  return (
    <Pressable onPress={onPress} style={styles.container}>
      {isConnected ? (
        <Monitor size={16} color="#10b981" />
      ) : (
        <MonitorOff size={16} color="#6b7280" />
      )}
      <Text style={[styles.text, isConnected && styles.textConnected]}>
        {isConnected ? `CFD (${clientCount})` : 'CFD'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  text: {
    fontSize: 12,
    color: '#6b7280',
  },
  textConnected: {
    color: '#10b981',
  },
})