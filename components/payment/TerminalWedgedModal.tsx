/**
 * TerminalWedgedModal
 *
 * Renders when the connection supervisor has flagged the Castles terminal
 * as wedged (TCP up, but CastlesPay app isn't reading from any socket — the
 * empty-buffer signature). Tells staff exactly what to do (power-cycle) and
 * auto-dismisses the moment the supervisor's background probe confirms the
 * terminal is responsive again. Staff can also press "Try Now" to skip the
 * 15s probe interval.
 *
 * Visibility is driven purely by `useTerminalConnectionStore.quality`. There
 * are no local "dismissed" flags — when the supervisor calls `clearWedge()`,
 * the modal disappears; when something marks wedged again, it reappears.
 */

import { colors } from '@/lib/theme';
import { getCastlesConnectionSupervisor } from '@/services/terminals/castlesConnectionSupervisor';
import { useTerminalConnectionStore } from '@/stores/useTerminalConnectionStore';
import { AlertTriangle, RefreshCcw, Loader2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

export function TerminalWedgedModal () {
  const quality = useTerminalConnectionStore(s => s.quality);
  const wedgedSince = useTerminalConnectionStore(s => s.wedgedSince);
  const [checking, setChecking] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drive a ticking elapsed-seconds counter so staff can see how long the
  // terminal has been down. Only runs while visible.
  useEffect(() => {
    if (quality !== 'wedged' || !wedgedSince) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setElapsedSec(0);
      return;
    }
    const update = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - wedgedSince) / 1000)));
    update();
    tickRef.current = setInterval(update, 1_000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [quality, wedgedSince]);

  const visible = quality === 'wedged';

  const onTryNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await getCastlesConnectionSupervisor().triggerImmediateProbe();
    } finally {
      // Keep "checking" visible at least 600ms so the spinner doesn't strobe.
      setTimeout(() => setChecking(false), 600);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.78)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 460,
            borderWidth: 1,
            borderColor: colors.warning + '60'
          }}
        >
          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.warning + '20',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={28} color={colors.warning} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.warning,
              textAlign: 'center',
              marginBottom: 6
            }}
          >
            Terminal is Frozen
          </Text>

          {/* Elapsed */}
          {elapsedSec > 0 && (
            <Text
              style={{
                fontSize: 12,
                color: colors.muted,
                textAlign: 'center',
                marginBottom: 14
              }}
            >
              Unresponsive for {formatElapsed(elapsedSec)}
            </Text>
          )}

          {/* Body */}
          <Text
            style={{
              fontSize: 14,
              color: colors.label,
              textAlign: 'center',
              marginBottom: 16,
              lineHeight: 21
            }}
          >
            The terminal accepted the network connection but its payment app
            has stopped responding. This needs a power-cycle on the terminal —
            no action you take here will recover it.
          </Text>

          {/* Steps */}
          <View
            style={{
              padding: 14,
              borderRadius: 10,
              backgroundColor: colors.screen,
              marginBottom: 16,
              gap: 6
            }}
          >
            <Step n='1' text='Unplug the terminal’s power cable.' />
            <Step n='2' text='Wait about 10 seconds.' />
            <Step n='3' text='Plug it back in and wait for the home screen.' />
            <Step n='4' text='This screen will close automatically once the terminal is back.' />
          </View>

          {/* CTAs */}
          <TouchableOpacity
            onPress={onTryNow}
            disabled={checking}
            style={{
              paddingVertical: 14,
              borderRadius: 10,
              backgroundColor: checking ? colors.warning + '60' : colors.warning,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {checking ? (
              <Loader2 size={16} color='#fff' />
            ) : (
              <RefreshCcw size={16} color='#fff' />
            )}
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {checking ? 'Checking terminal…' : 'Try Now'}
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: 'center',
              marginTop: 10
            }}
          >
            Auto-checks every 15 seconds while this screen is open.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function Step ({ n, text }: { n: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.warning + '30',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>
          {n}
        </Text>
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: colors.heading,
          lineHeight: 19
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function formatElapsed (sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
