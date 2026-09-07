import {
  KIOSK_CANCEL_UNCONFIRMED_MESSAGE,
  KIOSK_VERIFY_STAFF_MESSAGE,
  resolveKioskChargeOutcome,
} from "@/components/kiosk/shared/chargeOutcome";

describe("resolveKioskChargeOutcome", () => {
  describe("approved card always completes the order", () => {
    it("goes to success on a plain approval", () => {
      expect(
        resolveKioskChargeOutcome({ ok: true, userCancelled: false }),
      ).toEqual({ kind: "success" });
    });

    // The customer's exact concern: they tapped, it went through, and they
    // still managed to press Back. An approved card must win and run the
    // confirmation flow — on EVERY processor.
    it.each(["valor", "castles", "dejavoo", "atom", undefined])(
      "goes to success even if Back was pressed a beat too late (%s)",
      (terminalType) => {
        expect(
          resolveKioskChargeOutcome({
            ok: true,
            userCancelled: true,
            terminalType: terminalType as string | undefined,
          }),
        ).toEqual({ kind: "success" });
      },
    );
  });

  describe("possibly-captured charges are never voided", () => {
    it("routes an indeterminate charge to staff (verify)", () => {
      const out = resolveKioskChargeOutcome({
        ok: false,
        indeterminate: true,
        message: "Only $5.00 approved",
        userCancelled: false,
      });
      expect(out).toEqual({ kind: "verify", message: "Only $5.00 approved" });
    });

    it("uses the default verify message when none is supplied", () => {
      const out = resolveKioskChargeOutcome({
        ok: false,
        indeterminate: true,
        userCancelled: true,
        terminalType: "valor",
      });
      expect(out).toEqual({
        kind: "verify",
        message: KIOSK_VERIFY_STAFF_MESSAGE,
      });
    });

    // Castles' only abort closes the shared sale socket, so a not-ok after a
    // Back can't be trusted as "no charge" → verify, never void.
    it("routes a Castles cancel to staff (can't confirm no charge)", () => {
      const out = resolveKioskChargeOutcome({
        ok: false,
        userCancelled: true,
        terminalType: "castles",
      });
      expect(out).toEqual({
        kind: "verify",
        message: KIOSK_CANCEL_UNCONFIRMED_MESSAGE,
      });
    });
  });

  describe("confirmed cancellations (separate-channel processors)", () => {
    it.each(["valor", "dejavoo"])(
      "treats a customer Back clean-failure as cancelled (%s)",
      (terminalType) => {
        expect(
          resolveKioskChargeOutcome({
            ok: false,
            userCancelled: true,
            terminalType,
          }),
        ).toEqual({ kind: "cancelled" });
      },
    );
  });

  describe("genuine declines", () => {
    it("voids + surfaces the decline message when the customer did NOT cancel", () => {
      const out = resolveKioskChargeOutcome({
        ok: false,
        userCancelled: false,
        message: "Card declined by issuer",
        terminalType: "valor",
      });
      expect(out).toEqual({
        kind: "declined",
        message: "Card declined by issuer",
      });
    });

    it("falls back to a default decline message", () => {
      const out = resolveKioskChargeOutcome({
        ok: false,
        userCancelled: false,
        terminalType: "castles",
      });
      expect(out).toEqual({ kind: "declined", message: "Payment declined." });
    });
  });
});
