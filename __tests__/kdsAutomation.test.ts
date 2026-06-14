/**
 * KDS auto-fire / auto-bump decision logic (lib/kdsAutomation.ts).
 *
 * Guards the behavior the D5 refactor moved from a captured-array snapshot to a
 * getState() read at fire time. The recall-skip in particular is safety-critical:
 * a recalled ready ticket must NEVER auto-bump.
 */
import {
  isStarted,
  shouldAutoBump,
  shouldAutoFire,
} from "@/lib/kdsAutomation";

const MIN = 60 * 1000;

describe("shouldAutoFire", () => {
  it("is false for an unstarted ticket (start_time_epoch === 0)", () => {
    expect(shouldAutoFire(0, 10 * MIN, 5 * MIN)).toBe(false);
  });

  it("is false before the delay elapses", () => {
    const start = 0 + 1; // started at t=1ms
    expect(shouldAutoFire(start, start + 4 * MIN, 5 * MIN)).toBe(false);
  });

  it("is true at exactly the delay boundary", () => {
    const start = 1;
    expect(shouldAutoFire(start, start + 5 * MIN, 5 * MIN)).toBe(true);
  });

  it("is true after the delay elapses", () => {
    const start = 1;
    expect(shouldAutoFire(start, start + 9 * MIN, 5 * MIN)).toBe(true);
  });
});

describe("shouldAutoBump", () => {
  it("NEVER bumps a recalled ticket, even long past the delay", () => {
    const start = 1;
    expect(shouldAutoBump(start, start + 60 * MIN, 5 * MIN, true)).toBe(false);
  });

  it("bumps a non-recalled ticket past the delay (control)", () => {
    const start = 1;
    expect(shouldAutoBump(start, start + 6 * MIN, 5 * MIN, false)).toBe(true);
  });

  it("is false for an unstarted ticket regardless of recall flag", () => {
    expect(shouldAutoBump(0, 100 * MIN, 5 * MIN, false)).toBe(false);
  });

  it("is false before the delay elapses", () => {
    const start = 1;
    expect(shouldAutoBump(start, start + 4 * MIN, 5 * MIN, false)).toBe(false);
  });

  it("is true at exactly the delay boundary", () => {
    const start = 1;
    expect(shouldAutoBump(start, start + 5 * MIN, 5 * MIN, false)).toBe(true);
  });
});

describe("isStarted", () => {
  it("treats 0 as not started", () => {
    expect(isStarted(0)).toBe(false);
    expect(isStarted(1)).toBe(true);
  });
});
