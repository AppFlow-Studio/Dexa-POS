// src/components/cfd/CFDPairingQR.tsx
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import QRCode from 'react-native-qrcode-svg' // npm install react-native-qrcode-svg react-native-svg
import { useCFD } from '@/hooks/useCFD'
import { X } from 'lucide-react-native'

interface CFDPairingQRProps {
  onClose?: () => void
}

export function CFDPairingQR({ onClose }: CFDPairingQRProps) {
  const { serverStatus, isServerReady, isConnected, pairingData } = useCFD()
  // Quick checks
  if (serverStatus === 'disabled') {
    // No station selected - CFD not available
  }
  
  if (serverStatus === 'initializing') {
    // Server starting up...
  }
  
  if (serverStatus === 'error') {
    // Failed to start server
  }
  
  if (isServerReady && !isConnected) {
    // Server running, waiting for CFD to connect
  }
  
  if (isConnected) {
    // CFD is connected and receiving updates!
  }

  if (!pairingData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>CFD server not ready</Text>
      </View>
    )
  }

  // Encode pairing data as JSON in QR
  const qrValue = JSON.stringify(pairingData)

  return (
    <View style={styles.container}>
      {onClose && (
        <Pressable onPress={onClose} style={styles.closeButton}>
          <X size={24} color="#9ca3af" />
        </Pressable>
      )}

      <Text style={styles.title}>Connect Customer Display</Text>
      
      <View style={styles.qrContainer}>
        <QRCode
          value={qrValue}
          size={200}
          backgroundColor="#1f1f1f"
          color="#ffffff"
        />
      </View>

      <Text style={styles.instructions}>
        Scan this QR code with the DEXA CFD app
      </Text>

      <View style={styles.manualSection}>
        <Text style={styles.manualLabel}>Or connect manually:</Text>
        <View style={styles.manualInfo}>
          <Text style={styles.manualValue}>{pairingData.ip}:{pairingData.port}</Text>
        </View>
      </View>

      <View style={styles.statusSection}>
        <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
        <Text style={[styles.statusText, isConnected && styles.statusTextConnected]}>
          {isConnected ? `Connected (${clientCount} display${clientCount > 1 ? 's' : ''})` : 'Waiting for connection...'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 300,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 24,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    marginBottom: 16,
  },
  instructions: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
  manualSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  manualLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  manualInfo: {
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  manualValue: {
    fontSize: 16,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6b7280',
  },
  statusDotConnected: {
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusTextConnected: {
    color: '#10b981',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
})