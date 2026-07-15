/**
 * Idle-memory churn: permanently-mounted periodic timers must not keep firing
 * (re-rendering + allocating) while the app is backgrounded/idle. Left ungated
 * they produce garbage every tick that only gets reclaimed when a touch forces a
 * render/GC — the "memory climbs while idle, drops when I touch the screen"
 * report. Both offenders are now AppState-gated and resync on foreground.
 */
import fs from "fs";
import path from "path";

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("useLiveClock is AppState-gated", () => {
  const source = read("hooks", "useLiveClock.ts");

  it("imports AppState and subscribes to change", () => {
    expect(source).toContain('from "react-native"');
    expect(source).toContain("AppState");
    expect(source).toContain('AppState.addEventListener("change"');
  });

  it("only runs the interval while active and removes the listener on cleanup", () => {
    expect(source).toContain('AppState.currentState === "active"');
    expect(source).toContain("sub.remove()");
  });
});

describe("useTableTimerTick is AppState-gated", () => {
  const source = read("hooks", "useTableTimerTick.ts");

  it("suspends firing while backgrounded", () => {
    expect(source).toContain("if (paused || backgrounded) return;");
  });

  it("resyncs immediately on return to foreground", () => {
    expect(source).toContain(
      "if (wasBackgrounded && !backgrounded) fireAll();",
    );
  });

  it("removes the AppState listener when the last subscriber unmounts", () => {
    expect(source).toContain("appStateSub.remove()");
    expect(source).toContain("appStateSub = null;");
  });
});
