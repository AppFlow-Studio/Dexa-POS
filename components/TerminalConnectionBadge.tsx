/**
 * TerminalConnectionBadge
 *
 * Header pill that's visible ONLY when the Castles terminal singleton's
 * connection quality is `lost` (two consecutive watchdog misses, or a sale
 * errored with a connection error). Renders nothing otherwise — mirroring
 * the offline-only pattern of NetworkStatusBadge so the header stays quiet
 * during normal operation.
 *
 * Tap-to-recover: dispatches a graceful disconnect on the singleton so the
 * next sale starts on a fresh socket. Avoids a forced reconnect here because
 * an in-flight sale could be queued; disconnect() inside the singleton
 * mutex order keeps things safe.
 */

import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { colors } from '@/lib/theme';
import { WifiOff } from 'lucide-react-native';
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

export function TerminalConnectionBadge (): React.ReactElement | null {
  const quality = useTerminalConnectionStore(s => s.quality);

  if (quality !== 'lost') return null;

  const onPress = () => {
    try {
      getSharedCastlesService().disconnect();
    } catch {
      /* ignore — disconnect is best-effort */
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className='flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-900/30'
    >
      <WifiOff size={11} color={colors.warning} />
      <Text className='text-xs font-medium' style={{ color: colors.warning }}>
        Terminal disconnected
      </Text>
    </TouchableOpacity>
  );
}

export default TerminalConnectionBadge;
