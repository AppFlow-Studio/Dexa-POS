/**
 * PanelSheet — in-tree slide-up overlay that replaces the native bottom sheet.
 *
 * WHY THIS EXISTS
 * The app used to route sheets through `@expo/ui/community/bottom-sheet`, which on
 * Android is a Material 3 `ModalBottomSheet` — a *screen-level dialog window*. That
 * window (a) does not inherit the app's hidden/immersive status bar, so opening it
 * re-reveals the Android status bar and shifts the edge-to-edge UI, and (b) always
 * docks to the screen bottom, centered with a 640dp max width on wide tablets, so it
 * can't be anchored to a sub-region. Both are unfixable from JS.
 *
 * PanelSheet is a pure-RN + Reanimated replacement rendered in-tree through the root
 * `<PortalHost />`. Being in-tree it creates NO native window (→ no status-bar shift).
 * It supports two layouts via `presentation`:
 *   - "sheet"       (default): bottom-docked, horizontally centered, `maxWidth` (640dp
 *                    default) — the faithful replacement for the native modal.
 *   - "bill-column": anchored bottom-left and sized to the measured bill column
 *                    (`useBillPanelLayoutStore`) — used by the four bill-panel sheets.
 *
 * It is API-compatible with the subset of `@gorhom/bottom-sheet` / Expo UI the app
 * uses: a `BottomSheetMethods` ref (`expand`/`snapToIndex`/`present`/`dismiss`/…) plus
 * `index`/`snapPoints`/`enablePanDownToClose`/`onClose`/`onChange`/`footerComponent`.
 * The whole app reaches it through the `components/ui/bottomSheet.tsx` adapter; only the
 * bill sheets import it directly (they pass `presentation="bill-column"`).
 */
import { colors } from "@/lib/theme";
import { useBillPanelLayoutStore } from "@/stores/useBillPanelLayoutStore";
import { Portal } from "@rn-primitives/portal";
import * as React from "react";
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Imperative methods exposed via ref — a drop-in for gorhom / Expo UI
 * `BottomSheetMethods`. Owned here (not imported from the adapter) so the adapter can
 * re-export it without a circular import.
 */
export interface BottomSheetMethods {
  snapToIndex: (index: number) => void;
  snapToPosition: (position: string | number) => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;
  forceClose: () => void;
  present: () => void;
  dismiss: () => void;
}

// ── Child re-exports ──────────────────────────────────────────────────────────
// Plain RN components work in-tree (unlike gorhom's, which existed only to
// coordinate with the native scroll/gesture layer). Aliased on import at call sites
// (`PanelSheetScrollView as BottomSheetScrollView`, etc.).
export const PanelSheetScrollView = ScrollView;
export const PanelSheetView = View;
export const PanelSheetTextInput = TextInput;
export const PanelSheetFlatList = FlatList;
export const PanelSheetSectionList = SectionList;

/**
 * Default `<PortalHost>` name for any PanelSheet rendered inside this provider.
 * Used to hoist sheets opened from inside a native `<Modal>` (e.g. the profile
 * overlay) into a host that lives *inside* that Modal — otherwise they portal to the
 * root host and render behind the Modal window. A `portalHostName` prop still wins.
 */
export const PanelSheetHostContext = React.createContext<string | undefined>(
  undefined,
);

// Unique portal name per instance so concurrent sheets never collide.
let portalSeq = 0;

const OPEN_MS = 260;
const CLOSE_MS = 220;
/** Native ModalBottomSheet caps at 640dp on wide tablets; match it for "sheet" mode. */
const DEFAULT_MAX_WIDTH = 640;
/** Fallback column width fraction before the bill column has laid out. */
const FALLBACK_WIDTH_FRACTION = 0.38;

export type PanelSheetPresentation = "sheet" | "bill-column";

export interface PanelSheetProps {
  /** -1 = start closed. Non-modal honours this on mount; modal ignores it (see `modal`). */
  index?: number;
  /** Points from bottom→top; the target snap index selects the panel height. */
  snapPoints?: (string | number)[];
  /** Gates backdrop-tap and swipe-down dismissal. */
  enablePanDownToClose?: boolean;
  onChange?: (index: number) => void;
  onClose?: () => void;
  onDismiss?: () => void;

  /** Layout mode. Default "sheet" (bottom-docked, centered). */
  presentation?: PanelSheetPresentation;
  /** Max width for "sheet" mode (default 640dp, matching the native modal). */
  maxWidth?: number;
  /**
   * Deferred-modal semantics: always start CLOSED on mount regardless of `index`;
   * open only via `present()` (opens to the `index` snap). Set by the adapter's
   * `BottomSheetModal`. Prevents always-mounted modal sheets flashing open on mount.
   */
  modal?: boolean;
  /** gorhom-style pinned footer render-prop: `(props) => <BottomSheetFooter>…`. */
  footerComponent?: (props: any) => React.ReactNode;
  /** Target a named `<PortalHost>` (e.g. "profile-overlay") instead of the root host. */
  portalHostName?: string;

  /** `backgroundColor`/radius/border read live (colors Proxy freezes in module StyleSheet). */
  backgroundStyle?: any;
  /** Accepted for API compat; stacking is handled by the Portal. */
  style?: any;
  handleIndicatorStyle?: any;
  testID?: string;
  children?: React.ReactNode;

  // ── Insets (honoured in "sheet" mode; ignored in "bill-column") ──
  topInset?: number;
  bottomInset?: number;

  // ── Accepted-and-ignored (gorhom / Expo UI API compat) ──
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
  name?: string;
}

const styles = StyleSheet.create({
  // Layout-only styles (NO colors — the `colors` Proxy freezes to dark when
  // captured in a module-level StyleSheet.create; themed colors stay inline).
  panel: {
    position: "absolute",
    overflow: "hidden",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
});

/** Resolve a snap point (number px or "NN%") to pixels against a reference height. */
function resolveSnap(
  point: string | number | undefined,
  refHeight: number,
): number {
  if (point == null) return refHeight;
  if (typeof point === "number") return point;
  const s = String(point).trim();
  const n = s.endsWith("%") ? (parseFloat(s) / 100) * refHeight : parseFloat(s);
  return n || refHeight;
}

const PanelSheet = forwardRef<BottomSheetMethods, PanelSheetProps>(
  function PanelSheet(props, ref) {
    const {
      index = -1,
      snapPoints,
      enablePanDownToClose = false,
      onChange,
      onClose,
      onDismiss,
      presentation = "sheet",
      maxWidth = DEFAULT_MAX_WIDTH,
      modal = false,
      footerComponent,
      portalHostName,
      backgroundStyle,
      handleIndicatorStyle,
      topInset = 0,
      bottomInset = 0,
      testID,
      children,
    } = props;

    const isSheet = presentation !== "bill-column";
    const win = useWindowDimensions();
    const columnWidth = useBillPanelLayoutStore((s) => s.width);
    const columnHeight = useBillPanelLayoutStore((s) => s.height);
    // Explicit prop wins; otherwise inherit the nearest provider's host (e.g. the
    // profile overlay) so sheets opened inside a native Modal aren't hidden behind it.
    const contextHost = useContext(PanelSheetHostContext);
    const resolvedHost = portalHostName ?? contextHost;

    // Reference height the snap-point fractions are measured against. In "sheet" mode
    // it tracks the (keyboard-)resized window and reserves the insets; in "bill-column"
    // mode it's the measured column height.
    const refHeight = isSheet
      ? Math.max(0, win.height - topInset - bottomInset)
      : columnHeight || win.height;

    const lastIndex = Math.max(0, (snapPoints?.length ?? 1) - 1);
    const initialTarget = index >= 0 ? index : lastIndex;

    // Which snap point we're currently opened to (drives the panel height).
    const [targetIdx, setTargetIdx] = useState(initialTarget);
    const panelHeight = Math.min(
      refHeight,
      Math.max(
        0,
        Math.round(
          resolveSnap(
            snapPoints?.[Math.min(targetIdx, lastIndex)] ?? "90%",
            refHeight,
          ),
        ),
      ),
    );

    const panelWidth = isSheet
      ? Math.min(win.width, maxWidth)
      : columnWidth ||
        Math.round(Dimensions.get("window").width * FALLBACK_WIDTH_FRACTION);
    const panelLeft = isSheet
      ? Math.max(0, Math.round((win.width - panelWidth) / 2))
      : 0;
    const panelBottom = isSheet ? bottomInset : 0;

    // Modal sheets start closed regardless of `index` (deferred-present semantics);
    // non-modal sheets honour `index` on mount.
    const startsOpen = !modal && index >= 0;

    const [isOpen, setIsOpen] = useState(startsOpen);
    const portalNameRef = useRef<string | null>(null);
    if (portalNameRef.current === null) {
      portalNameRef.current = `panel-sheet-${portalSeq++}`;
    }
    const progress = useSharedValue(startsOpen ? 1 : 0);
    const panelHeightSV = useSharedValue(panelHeight);
    useEffect(() => {
      panelHeightSV.value = panelHeight;
    }, [panelHeight, panelHeightSV]);

    // Callback plumbing: stable refs + a `closedRef` guard so onClose fires exactly
    // once even when a swipe-dismiss and a programmatic close race.
    const closedRef = useRef(!startsOpen);
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
      // Only unmount here. The close callbacks fire from the effect below, AFTER the
      // panel has actually left the tree — mirroring the native ModalBottomSheet's
      // onDismiss timing (fires once the sheet is gone). Call sites depend on this:
      // e.g. TableContextSheet defers a "View Order" action to onDismiss so it opens
      // its overlay into a clean tree, not the tearing-down sheet surface.
      setIsOpen(false);
    }, []);

    // Fire close callbacks once the close has committed (open → closed transition).
    const prevOpenRef = useRef(isOpen);
    useEffect(() => {
      if (prevOpenRef.current && !isOpen) fireCloseCallbacks();
      prevOpenRef.current = isOpen;
    }, [isOpen, fireCloseCallbacks]);

    const open = useCallback(
      (notifyIndex: number) => {
        closedRef.current = false;
        setTargetIdx(Math.max(0, notifyIndex));
        setIsOpen(true);
        progress.value = withTiming(1, { duration: OPEN_MS });
        onChangeRef.current?.(notifyIndex);
      },
      [progress],
    );

    const close = useCallback(() => {
      // Ignore redundant closes. Controlled modals re-issue dismiss() from an
      // onClose-driven prop change — e.g. TableContextSheet's `table → null` effect
      // fires dismiss() again right after onClose set the table to null. Without this
      // guard that starts a second close animation on the already-unmounted panel,
      // which fatally crashes Reanimated on the New Architecture (app drops to home).
      if (closedRef.current) return;
      progress.value = withTiming(0, { duration: CLOSE_MS }, (finished) => {
        "worklet";
        if (finished) runOnJS(finishClose)();
      });
    }, [progress, finishClose]);

    // Android hardware back / back-gesture. The native ModalBottomSheet consumed
    // this implicitly (back = dismiss); an in-tree overlay does not, so without this
    // the back event leaks to Expo Router and navigates away / exits the app while a
    // sheet is open. Consume it whenever open; dismiss the sheet if it's dismissible.
    // Handlers fire last-registered-first, so back closes the topmost sheet only.
    useEffect(() => {
      if (!isOpen) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (enablePanDownToClose) close();
        return true;
      });
      return () => sub.remove();
    }, [isOpen, enablePanDownToClose, close]);

    useImperativeHandle(
      ref,
      (): BottomSheetMethods => ({
        snapToIndex: (i: number) =>
          i < 0 ? close() : open(Math.min(i, lastIndex)),
        snapToPosition: () => open(lastIndex),
        // gorhom: expand → largest snap, collapse → smallest, present → `index` snap.
        expand: () => open(lastIndex),
        collapse: () => open(0),
        present: () => open(index >= 0 ? Math.min(index, lastIndex) : 0),
        close,
        forceClose: close,
        dismiss: close,
      }),
      [open, close, index, lastIndex],
    );

    const backdropStyle = useAnimatedStyle(() => ({
      // 0.5 inlined (not a module const) so the worklet needs no closure capture.
      opacity: progress.value * 0.5,
    }));
    const panelStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: (1 - progress.value) * panelHeightSV.value }],
    }));

    // Swipe-down-to-dismiss on the handle only (not the scroll body). Gated on
    // enablePanDownToClose. Kept off the content so long sheets still scroll.
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

    // Rendered through a PortalHost so the overlay lives in clean, full-screen
    // coordinates — escaping the screens' padded/offset layers. Defaults to the root
    // host; `portalHostName` targets a named host (e.g. the profile overlay).
    return (
      <Portal name={portalNameRef.current!} hostName={resolvedHost}>
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
          {/* Panel: bottom-docked (centered in "sheet" mode, bottom-left in
              "bill-column" mode), sized to the target snap point. */}
          <Animated.View
            style={[
              styles.panel,
              {
                left: panelLeft,
                bottom: panelBottom,
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
            {/* Pinned footer (gorhom `footerComponent`): sits below the scroll body
                so action buttons stay visible. */}
            {footerComponent ? <View>{footerComponent({})}</View> : null}
          </Animated.View>
        </View>
      </Portal>
    );
  },
);

PanelSheet.displayName = "PanelSheet";

export default PanelSheet;
