/**
 * PanelSheet contract tests.
 *
 * Locks in the ref API (expand / snapToIndex / close) and the callback contract
 * the four bill-panel sheets + their call sites depend on: opening fires
 * onChange(index); dismissing fires onClose exactly once + onChange(-1) via the
 * `closedRef` guard mirrored from Expo UI's native BottomSheet.android.tsx; and
 * backdrop-tap dismissal is gated on enablePanDownToClose.
 *
 * Uses react-test-renderer directly (not @testing-library/react-native, whose
 * `test-renderer` resolution is broken in this repo — see NetworkStatusBadge.test)
 * and drives the imperative ref. The reanimated mock fires withTiming's
 * completion synchronously, so close → onClose is observable without timers.
 */

jest.mock("@/lib/theme", () => ({
  colors: { panel: "#111827", muted: "#888888", border: "#333333" },
}));

// Self-contained reanimated mock. The global mock in jest-setup.ts requires the
// real `react-native-reanimated/mock`, which pulls in react-native-worklets and
// crashes under jest; override it here with the minimal surface PanelSheet uses.
// withTiming fires its completion callback synchronously.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const withTiming = (toValue: any, _cfg?: any, cb?: (f: boolean) => void) => {
    cb?.(true);
    return toValue;
  };
  const createAnimatedComponent = (c: any) => c;
  return {
    __esModule: true,
    default: { View, createAnimatedComponent, call: () => {} },
    View,
    createAnimatedComponent,
    useSharedValue: (init: any) => ({ value: init }),
    useAnimatedStyle: (fn: () => any) => fn(),
    withTiming,
    runOnJS: (fn: any) => fn,
  };
});

// @rn-primitives/portal ships untransformed JSX in its dist (not in jest's
// transformIgnorePatterns allowlist). Mock it: Portal renders inline so the
// overlay is in the test tree; production (Metro) uses the real portal.
jest.mock("@rn-primitives/portal", () => ({
  Portal: ({ children }: any) => children,
  PortalHost: () => null,
}));

// Isolate from gesture-handler native internals — only the Pan builder and a
// passthrough GestureDetector are needed to render the drag handle.
jest.mock("react-native-gesture-handler", () => {
  const makeGesture = () => {
    const g: any = {};
    for (const m of [
      "enabled",
      "onStart",
      "onUpdate",
      "onEnd",
      "onChange",
      "onFinalize",
    ]) {
      g[m] = () => g;
    }
    return g;
  };
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: makeGesture },
  };
});

import PanelSheet, { type BottomSheetMethods } from "@/components/ui/PanelSheet";
import { useBillPanelLayoutStore } from "@/stores/useBillPanelLayoutStore";
import React from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

interface HarnessProps {
  enablePanDownToClose?: boolean;
  onClose?: () => void;
  onChange?: (i: number) => void;
}

function renderSheet(props: HarnessProps) {
  const ref = React.createRef<BottomSheetMethods>();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <>
        <PanelSheet
          ref={ref}
          index={-1}
          snapPoints={["90%"]}
          enablePanDownToClose={props.enablePanDownToClose ?? true}
          onClose={props.onClose}
          onChange={props.onChange}
          testID="sheet"
        >
          <Text>PANEL_BODY</Text>
        </PanelSheet>
      </>,
    );
  });
  const root = renderer.root;
  return {
    ref,
    /**
     * The children only mount when open (PanelSheet returns null when closed).
     * Key off the rendered body text, NOT testID="sheet" — that prop lives on
     * the PanelSheet element itself, which is present in the tree even when it
     * renders null.
     */
    isOpen: () =>
      root.findAll((n) => n.props?.children === "PANEL_BODY").length > 0,
    pressBackdrop: () => {
      const backdrop = root.findAll(
        (n) => n.props?.testID === "sheet-backdrop",
      );
      act(() => backdrop[0]?.props?.onPress?.());
    },
  };
}

beforeEach(() => {
  // Give the anchor store real dims so the panel resolves a height/width.
  useBillPanelLayoutStore.getState().setLayout(380, 800);
});

describe("PanelSheet", () => {
  it("starts closed when index = -1", () => {
    const onClose = jest.fn();
    const onChange = jest.fn();
    const { isOpen } = renderSheet({ onClose, onChange });
    expect(isOpen()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("expand() opens the panel and fires onChange(0)", () => {
    const onChange = jest.fn();
    const { ref, isOpen } = renderSheet({ onChange });
    act(() => ref.current!.expand());
    expect(isOpen()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("snapToIndex(0) opens the panel", () => {
    const { ref, isOpen } = renderSheet({});
    act(() => ref.current!.snapToIndex(0));
    expect(isOpen()).toBe(true);
  });

  it("close() dismisses and fires onClose once + onChange(-1)", () => {
    const onClose = jest.fn();
    const onChange = jest.fn();
    const { ref, isOpen } = renderSheet({ onClose, onChange });
    act(() => ref.current!.expand());
    act(() => ref.current!.close());
    expect(isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(-1);
  });

  it("double close fires onClose exactly once (closedRef guard)", () => {
    const onClose = jest.fn();
    const { ref } = renderSheet({ onClose });
    act(() => ref.current!.expand());
    act(() => ref.current!.close());
    act(() => ref.current!.close());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop tap dismisses when enablePanDownToClose is true", () => {
    const onClose = jest.fn();
    const { ref, isOpen, pressBackdrop } = renderSheet({ onClose });
    act(() => ref.current!.expand());
    pressBackdrop();
    expect(isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop tap is inert when enablePanDownToClose is false", () => {
    const onClose = jest.fn();
    const { ref, isOpen, pressBackdrop } = renderSheet({
      enablePanDownToClose: false,
      onClose,
    });
    act(() => ref.current!.expand());
    pressBackdrop();
    expect(isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
