import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";
import { RefreshCw } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";

const AUTO_RESET_MS = 6000;
// After this many crashes in one mounted session, stop trying to soft-reset and
// do a full app reload — a repeating crash won't be fixed by returning to idle.
const RELOAD_THRESHOLD = 3;

interface Props {
  children: React.ReactNode;
  /** Return the kiosk to a safe state (clear cart + go idle). */
  onReset?: () => void;
  /** Themed to the active kiosk profile so the fallback isn't a jarring blank. */
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

/**
 * Crash guard for the customer-facing kiosk. A self-service terminal has no
 * staff standing by, so a render error must self-heal rather than sit on a red
 * screen. On error it shows a calm, branded "one moment" screen and, after a
 * short delay, resets itself + returns the kiosk to idle (clearing the cart) so
 * the next customer starts fresh. If it keeps crashing (RELOAD_THRESHOLD), it
 * escalates to a full app reload as the last resort.
 */
export class KioskErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorCount: 0 };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface for on-device debugging + the Sentry dashboard.
    console.error("[KioskErrorBoundary] caught:", error, info?.componentStack);
    try {
      Sentry.captureException(error, {
        tags: { surface: "kiosk" },
        extra: { componentStack: info?.componentStack },
      });
    } catch {
      /* Sentry unavailable — non-fatal */
    }
    this.setState((s) => ({ errorCount: s.errorCount + 1 }));
  }

  componentDidUpdate(_prev: Props, prevState: State) {
    if (!prevState.hasError && this.state.hasError) {
      if (this.state.errorCount >= RELOAD_THRESHOLD) {
        // Repeating crash — a soft reset won't help. Reload the whole app.
        this.timer = setTimeout(() => {
          Updates.reloadAsync().catch(() => {
            // Dev / Expo Go — reload isn't available; soft-reset instead.
            this.handleReset();
          });
        }, AUTO_RESET_MS);
      } else {
        this.timer = setTimeout(this.handleReset, AUTO_RESET_MS);
      }
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  private handleReset = () => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.props.onReset?.();
    } catch {
      /* best-effort */
    }
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const bg = this.props.backgroundColor || "#0B0B0F";
    const fg = this.props.textColor || "#FFFFFF";
    const accent = this.props.accentColor || "#0D9488";

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: accent + "22",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <RefreshCw size={34} color={accent} />
        </View>
        <Text
          style={{
            color: fg,
            fontSize: 30,
            fontWeight: "800",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          One moment…
        </Text>
        <Text
          style={{
            color: fg,
            opacity: 0.7,
            fontSize: 17,
            textAlign: "center",
            maxWidth: 460,
            lineHeight: 24,
            marginBottom: 32,
          }}
        >
          We hit a snag and are getting things ready for the next order. This
          screen will reset automatically.
        </Text>
        <Pressable
          onPress={this.handleReset}
          style={{
            paddingHorizontal: 40,
            paddingVertical: 16,
            borderRadius: 999,
            backgroundColor: accent,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
            Start over
          </Text>
        </Pressable>
      </View>
    );
  }
}
