/**
 * PanelSheet — in-tree slide-up overlay anchored to the left "bill summary" column.
 *
 * WHY THIS EXISTS
 * The app routes sheets through `components/ui/bottomSheet.tsx` →
 * `@expo/ui/community/bottom-sheet`, which on Android is a Material 3
 * `ModalBottomSheet` — a *screen-level dialog window*. That window (a) does not
 * inherit the app's hidden/immersive status bar, so opening it re-reveals the
 * Android status bar and shifts the edge-to-edge UI, and (b) always docks to the
 * screen bottom, centered with a 640dp max width on wide tablets, so it can't be
 * anchored to a sub-region. Both are unfixable from JS.
 *
 * PanelSheet is a pure-RN + Reanimated replacement used ONLY for the four
 * bill-panel sheets (More Options, Order Breakdown, Discount, Service Charge).
 * Being in-tree, it creates no native window (→ no status-bar shift) and sizes
 * its panel to the bill column (→ anchored, not centered/full-screen).
 *
 * It is API-compatible with the subset of `@gorhom/bottom-sheet` / Expo UI that
 * those sheets use: a `BottomSheetMethods` ref (`expand`/`snapToIndex`/`close`/…)
 * plus `index`/`snapPoints`/`enablePanDownToClose`/`onClose`/`onChange`. The
 * callback contract (single-fire `onClose` + `onChange(-1)` on dismiss, driven
 * off the close-animation completion) mirrors Expo UI's
 * `BottomSheet.android.tsx` so call sites and `MoreOptions`' `closeAndThen`
 * chain keep working unchanged.
 */
import type { BottomSheetMethods } from "@/components/ui/bottomSheet";
import { colors } from "@/lib/theme";
import { useBillPanelLayoutStore } from "@/stores/useBillPanelLayoutStore";
import { Portal } from "@rn-primitives/portal";
import * as React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ── Child re-exports ──────────────────────────────────────────────────────────
// These were plain RN re-exports under the native adapter too, so the four
// sheets keep the same JSX by aliasing on import
// (`PanelSheetScrollView as BottomSheetScrollView`, etc.).
export const PanelSheetScrollView = ScrollView;
export const PanelSheetView = View;
export const PanelSheetTextInput = TextInput;
export type { BottomSheetMethods } from "@/components/ui/bottomSheet";

// Unique portal name per instance so concurrent sheets never collide.
let portalSeq = 0;

const OPEN_MS = 260;
const CLOSE_MS = 220;
/** Fallback column width fraction before the bill column has laid out. */
const FALLBACK_WIDTH_FRACTION = 0.38;

export interface PanelSheetProps {
  /** -1 = start closed (all four sheets pass -1). */
  index?: number;
  /** Last point is used as the panel-height fraction of the column height. */
  snapPoints?: (string | number)[];
  /** Gates backdrop-tap and swipe-down dismissal. */
  enablePanDownToClose?: boolean;
  onChange?: (index: number) => void;
  onClose?: () => void;
  onDismiss?: () => void;
  /** `backgroundColor`/radius/border read live (colors Proxy freezes in module StyleSheet). */
  backgroundStyle?: any;
  /** Accepted for API compat; stacking is handled by the root Portal. */
  style?: any;
  handleIndicatorStyle?: any;
  testID?: string;
  children?: React.ReactNode;

  // ── Accepted-and-ignored (Expo UI / gorhom API compat; native handled these) ──
  topInset?: number;
  bottomInset?: number;
  enableDynamicSizing?: boolean;
  enableContentPanningGesture?: boolean;
  keyboardBehavior?: string;
  keyboardBlurBehavior?: string;
  android_keyboardInputMode?: string;
  handleComponent?: React.ComponentType<any> | null;
  handleStyle?: any;
  backdropComponent?: React.ComponentType<any>;
  backgroundComponent?: React.ComponentType<any> | null;
  containerStyle?: any;
}

const styles = StyleSheet.create({
  // Layout-only styles (NO colors — the `colors` Proxy freezes to dark when
  // captured in a module-level StyleSheet.create; themed colors stay inline).
  panel: {
    position: "absolute",
    left: 0,
    bottom: 0,
    overflow: "hidden",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  // Minimal top chrome — the sheets have their own headers + close buttons, so
  // the drag handle stays a thin strip and doesn't waste vertical space.
  handleArea: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 2,
  },
  handleBar: {
    width: 32,
    height: 4,
    borderRadius: 2,
  },
});

const PanelSheet = forwardRef<BottomSheetMethods, PanelSheetProps>(
  function PanelSheet(props, ref) {
    const {
      index = -1,
      snapPoints,
      enablePanDownToClose = false,
      onChange,
      onClose,
      onDismiss,
      backgroundStyle,
      style,
      handleIndicatorStyle,
      testID,
      children,
    } = props;

    const columnWidth = useBillPanelLayoutStore((s) => s.width);
    const columnHeight = useBillPanelLayoutStore((s) => s.height);

    // Resolve the panel height from the LAST snap point (the "expanded" state
    // that .expand() targets), as a fraction of the column height.
    const panelHeight = useMemo(() => {
      const h = columnHeight || Dimensions.get("window").height;
      const last = snapPoints?.[snapPoints.length - 1] ?? "90%";
      const frac =
        typeof last === "number"
          ? last
          : String(last).trim().endsWith("%")
            ? (parseFloat(last) / 100) * h
            : parseFloat(String(last));
      return Math.min(h, Math.max(0, Math.round(frac || h)));
    }, [snapPoints, columnHeight]);

    const panelWidth =
      columnWidth ||
      Math.round(Dimensions.get("window").width * FALLBACK_WIDTH_FRACTION);

    const [isOpen, setIsOpen] = useState(index >= 0);
    const portalNameRef = useRef<string | null>(null);
    if (portalNameRef.current === null) {
      portalNameRef.current = `panel-sheet-${portalSeq++}`;
    }
    const progress = useSharedValue(index >= 0 ? 1 : 0);
    const panelHeightSV = useSharedValue(panelHeight);
    useEffect(() => {
      panelHeightSV.value = panelHeight;
    }, [panelHeight, panelHeightSV]);

    // Callback plumbing mirrors Expo UI's BottomSheet.android.tsx: stable refs +
    // a `closedRef` guard so onClose fires exactly once even when a swipe-dismiss
    // and a programmatic close race.
    const closedRef = useRef(index < 0);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const fireCloseCallbacks = useCallback(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onCloseRef.current?.();
      onDismissRef.current?.();
      onChangeRef.current?.(-1);
    }, []);

    const finishClose = useCallback(() => {
      setIsOpen(false);
      fireCloseCallbacks();
    }, [fireCloseCallbacks]);

    const open = useCallback(
      (notifyIndex: number) => {
        closedRef.current = false;
        setIsOpen(true);
        progress.value = withTiming(1, { duration: OPEN_MS });
        onChangeRef.current?.(notifyIndex);
      },
      [progress],
    );

    const close = useCallback(() => {
      progress.value = withTiming(0, { duration: CLOSE_MS }, (finished) => {
        "worklet";
        if (finished) runOnJS(finishClose)();
      });
    }, [progress, finishClose]);

    useImperativeHandle(
      ref,
      (): BottomSheetMethods => ({
        snapToIndex: (i: number) => (i < 0 ? close() : open(Math.max(0, i))),
        snapToPosition: () => open(0),
        expand: () => open(0),
        collapse: () => open(0),
        close,
        forceClose: close,
        present: () => open(0),
        dismiss: close,
      }),
      [open, close],
    );

    const backdropStyle = useAnimatedStyle(() => ({
      // 0.5 inlined (not a module const) so the worklet needs no closure capture.
      opacity: progress.value * 0.5,
    }));
    const panelStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: (1 - progress.value) * panelHeightSV.value }],
    }));

    // Swipe-down-to-dismiss on the handle only (not the scroll body). Gated on
    // enablePanDownToClose, matching the native `shouldDismissOnClickOutside`
    // mapping. Kept off the content so long sheets still scroll.
    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .enabled(!!enablePanDownToClose)
          .onUpdate((e) => {
            "worklet";
            if (e.translationY > 0) {
              const h = panelHeightSV.value || 1;
              progress.value = Math.max(0, 1 - e.translationY / h);
            }
          })
          .onEnd((e) => {
            "worklet";
            const h = panelHeightSV.value || 1;
            if (e.translationY > h * 0.25 || e.velocityY > 800) {
              runOnJS(close)();
            } else {
              progress.value = withTiming(1, { duration: 160 });
            }
          }),
      [enablePanDownToClose, close, progress, panelHeightSV],
    );

    if (!isOpen) return null;

    const flatBg = StyleSheet.flatten(backgroundStyle) || {};
    const panelBg = flatBg.backgroundColor ?? colors.panel;
    const handleColor =
      StyleSheet.flatten(handleIndicatorStyle)?.backgroundColor ?? colors.muted;
    const backdropTestID = testID ? `${testID}-backdrop` : "panel-sheet-backdrop";

    // Rendered through the root PortalHost so the overlay lives in clean,
    // full-screen coordinates — escaping the bill screens' padded/offset sheet
    // layers (order-processing shifts its overlay by -headerHeight). The panel
    // is then anchored to the bottom-left, sized to the measured bill column.
    return (
      <Portal name={portalNameRef.current!}>
        <View style={StyleSheet.absoluteFill} testID={testID}>
          {/* Tap-catcher: blocks touch-through to the app; dismisses when
              enablePanDownToClose. Sits below the dim + panel. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={enablePanDownToClose ? close : () => {}}
            testID={backdropTestID}
          />
          {/* Dim: animated opacity on a plain Animated.View (animating a wrapped
              Pressable's opacity is unreliable — the node doesn't update). */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]}
          />
          {/* Panel anchored to the bottom-left (the bill column). */}
          <Animated.View
            style={[
              styles.panel,
              {
                width: panelWidth,
                height: panelHeight,
                backgroundColor: panelBg,
                borderTopWidth: flatBg.borderWidth,
                borderColor: flatBg.borderColor,
              },
              panelStyle,
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <View style={styles.handleArea}>
                <View
                  style={[styles.handleBar, { backgroundColor: handleColor }]}
                />
              </View>
            </GestureDetector>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              {children}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Portal>
    );
  },
);

PanelSheet.displayName = "PanelSheet";

export default PanelSheet;
