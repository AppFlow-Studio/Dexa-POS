/**
 * usePinEntry: the one PIN digit handler every PinNumpad screen uses.
 *
 * Regression: fast typing on a slow device delivers several taps before the
 * next render. Handlers that read render-time `pin` either grew the PIN past
 * 4 digits (login: Sign In stayed disabled until a backspace removed an
 * invisible 5th digit) or dropped digits (`setPin(pin + d)`).
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React from "react";
// @ts-ignore — react-test-renderer ships no bundled types on SDK 53
import TestRenderer, { act } from "react-test-renderer";

import { usePinEntry } from "@/hooks/usePinEntry";

type Entry = ReturnType<typeof usePinEntry>;

function mount(opts: Parameters<typeof usePinEntry>[0] = {}) {
  const current: { entry: Entry | null } = { entry: null };
  function Probe(props: { opts: Parameters<typeof usePinEntry>[0] }) {
    current.entry = usePinEntry(props.opts);
    return null;
  }
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(<Probe opts={opts} />);
  });
  return {
    get: () => current.entry!,
    rerender: (next: Parameters<typeof usePinEntry>[0]) =>
      act(() => renderer.update(<Probe opts={next} />)),
  };
}

describe("usePinEntry", () => {
  it("never exceeds the PIN length when taps land before a re-render", () => {
    const pin = mount({ length: 4 });
    const press = pin.get().onKeyPress; // one render's handler, reused — like queued taps
    act(() => {
      for (const d of [1, 2, 3, 4, 5, 6]) press(d);
    });
    expect(pin.get().pin).toBe("1234");
  });

  it("never drops a digit when taps land before a re-render", () => {
    const pin = mount({ length: 4 });
    const press = pin.get().onKeyPress;
    act(() => {
      press(7);
      press(8);
    });
    expect(pin.get().pin).toBe("78");
  });

  it("fires onComplete once, with the full PIN, on the completing key", () => {
    const onComplete = jest.fn();
    const pin = mount({ length: 4, onComplete });
    const press = pin.get().onKeyPress;
    act(() => {
      for (const d of [9, 8, 7, 6, 5]) press(d);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("9876");
  });

  it("backspace and clear edit the latest value", () => {
    const pin = mount({ length: 4 });
    const press = pin.get().onKeyPress;
    act(() => {
      press(1);
      press(2);
      press("backspace");
      press(3);
    });
    expect(pin.get().pin).toBe("13");
    act(() => press("clear"));
    expect(pin.get().pin).toBe("");
  });

  it("ignores keys while disabled", () => {
    const pin = mount({ length: 4, disabled: true });
    act(() => pin.get().onKeyPress(1));
    expect(pin.get().pin).toBe("");
    pin.rerender({ length: 4, disabled: false });
    act(() => pin.get().onKeyPress(1));
    expect(pin.get().pin).toBe("1");
  });

  it("setPin resets the value the next key press builds on", () => {
    const pin = mount({ length: 4 });
    act(() => {
      pin.get().onKeyPress(1);
      pin.get().onKeyPress(2);
    });
    act(() => pin.get().setPin(""));
    act(() => pin.get().onKeyPress(5));
    expect(pin.get().pin).toBe("5");
  });

  it("keeps onKeyPress stable across renders so the keypad doesn't re-render per digit", () => {
    const pin = mount({ length: 4 });
    const first = pin.get().onKeyPress;
    act(() => first(1));
    expect(pin.get().onKeyPress).toBe(first);
  });
});

describe("no PIN screen keeps its own digit logic (source)", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const files = [
    "app/(auth)/pin-login.tsx",
    "app/(main)/settings/kds.tsx",
    "app/(main)/settings/general.tsx",
    "components/MainMenu.tsx",
    "components/tables/Sidebar.tsx",
    "components/bill/MoreOptionsBottomSheet.tsx",
    "components/auth/DeactivateTerminalModal.tsx",
    "components/auth/OrderPinGate.tsx",
    "components/timeclock/PinInputModal.tsx",
    "components/timeclock/ClockInOutModal.tsx",
    "components/settings/security-and-login/SwitchAccountModal.tsx",
    "components/cash-drawer/NoSaleModal.tsx",
    "components/cash-drawer/PayInOutModal.tsx",
  ];
  it.each(files)("%s uses usePinEntry", (file) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).toMatch(/usePinEntry\(/);
    // The two stale-state patterns this replaced.
    expect(src).not.toMatch(/set\w*Pin\(\s*\w*[pP]in \+ /);
    expect(src).not.toMatch(/setPin\(\(prev\w*\) => prev\w* \+ /);
  });

  // Product rule: a PIN prompt that shows a Confirm/Verify button never
  // submits on its own — only OrderPinGate (no confirm button) auto-submits.
  it.each(files.filter((f) => !f.endsWith("OrderPinGate.tsx")))(
    "%s waits for its Confirm button (no auto-submit)",
    (file) => {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      const call = src.slice(src.indexOf("usePinEntry("));
      expect(call.slice(0, call.indexOf(")"))).not.toMatch(/onComplete/);
    },
  );
});
