import {
  SMS_MAX_LENGTH,
  interpolate,
  renderReservationDefault,
  renderWaitlistDefault,
  resolveReservationMessage,
  resolveWaitlistMessage,
  type ReservationTemplateContext,
  type WaitlistTemplateContext,
} from "../supabase/functions/_shared/notifyTemplates";

const waitlistCtx = (
  over: Partial<WaitlistTemplateContext> = {},
): WaitlistTemplateContext => ({
  partyName: "Sam",
  storeName: "Cafe Dexa",
  storeAddress: "123 Main St, Springfield IL 62704",
  quotedWaitMinutes: 15,
  partySize: 4,
  ...over,
});

const reservationCtx = (
  over: Partial<ReservationTemplateContext> = {},
): ReservationTemplateContext => ({
  partyName: "Sam",
  storeName: "Cafe Dexa",
  storeAddress: "123 Main St, Springfield IL 62704",
  partySize: 4,
  reservationDate: "Fri, Jul 18",
  reservationTime: "7:30 PM",
  confirmationNumber: "ABC123",
  ...over,
});

describe("interpolate", () => {
  it("substitutes only whitelisted tokens and leaves unknown ones verbatim", () => {
    expect(
      interpolate("Hi {name} at {store} {unknown}", {
        name: "Sam",
        store: "Cafe Dexa",
      }),
    ).toBe("Hi Sam at Cafe Dexa {unknown}");
  });

  it("trims and caps at SMS_MAX_LENGTH", () => {
    const long = "x".repeat(600);
    const result = interpolate(`  {body}  `, { body: long });
    expect(result.length).toBe(SMS_MAX_LENGTH);
    expect(result.startsWith("x")).toBe(true);
  });
});

describe("resolveWaitlistMessage — default parity (no merchant override)", () => {
  it("waitlist.added matches the legacy hardcoded output (with address + wait)", () => {
    const ctx = waitlistCtx();
    expect(resolveWaitlistMessage("waitlist.added", ctx, {}, null)).toBe(
      renderWaitlistDefault("waitlist.added", ctx),
    );
    expect(resolveWaitlistMessage("waitlist.added", ctx, null, null)).toBe(
      "Hi Sam, you're on the waitlist at Cafe Dexa (123 Main St, Springfield IL 62704). Your seat should be ready in 15 min. We'll text you when it's ready.",
    );
  });

  it("waitlist.added collapses optional clauses when address/wait are absent", () => {
    const ctx = waitlistCtx({ storeAddress: "", quotedWaitMinutes: null });
    expect(resolveWaitlistMessage("waitlist.added", ctx, {}, null)).toBe(
      "Hi Sam, you're on the waitlist at Cafe Dexa. Your seat should be ready soon. We'll text you when it's ready.",
    );
  });

  it("every known waitlist key renders a non-null default", () => {
    const ctx = waitlistCtx();
    for (const key of [
      "waitlist.added",
      "waitlist.tableReady",
      "waitlist.almostReady",
      "waitlist.runningLate",
      "waitlist.updateConfirmed",
      "waitlist.cancelled",
    ]) {
      expect(resolveWaitlistMessage(key, ctx, {}, null)).toBeTruthy();
    }
  });
});

describe("resolveWaitlistMessage — merchant overrides", () => {
  it("uses a saved per-event template and interpolates tokens", () => {
    const ctx = waitlistCtx();
    const config = {
      messageTemplates: {
        "waitlist.tableReady": "Yo {name}, table for {party_size} ready at {store}!",
      },
    };
    expect(resolveWaitlistMessage("waitlist.tableReady", ctx, config, null)).toBe(
      "Yo Sam, table for 4 ready at Cafe Dexa!",
    );
  });

  it("falls back to the default when the saved template is blank/whitespace", () => {
    const ctx = waitlistCtx();
    const config = { messageTemplates: { "waitlist.tableReady": "   " } };
    expect(resolveWaitlistMessage("waitlist.tableReady", ctx, config, null)).toBe(
      renderWaitlistDefault("waitlist.tableReady", ctx),
    );
  });

  it("honors the legacy smsTemplate field as the waitlist.tableReady override", () => {
    const ctx = waitlistCtx();
    const config = { smsTemplate: "Hi {name}, your table for {party_size} is ready!" };
    expect(resolveWaitlistMessage("waitlist.tableReady", ctx, config, null)).toBe(
      "Hi Sam, your table for 4 is ready!",
    );
  });

  it("messageTemplates wins over the legacy smsTemplate for tableReady", () => {
    const ctx = waitlistCtx();
    const config = {
      smsTemplate: "legacy {name}",
      messageTemplates: { "waitlist.tableReady": "new {name}" },
    };
    expect(resolveWaitlistMessage("waitlist.tableReady", ctx, config, null)).toBe(
      "new Sam",
    );
  });

  it("blank party_size renders as an empty token", () => {
    const ctx = waitlistCtx({ partySize: null });
    const config = { messageTemplates: { "waitlist.added": "Party of {party_size}" } };
    expect(resolveWaitlistMessage("waitlist.added", ctx, config, null)).toBe(
      "Party of",
    );
  });
});

describe("resolveWaitlistMessage — custom + unknown keys", () => {
  it("passes a custom message through (trim + cap), ignoring templates", () => {
    expect(
      resolveWaitlistMessage("custom", waitlistCtx(), {}, "  hello there  "),
    ).toBe("hello there");
  });

  it("returns null for a blank custom message", () => {
    expect(resolveWaitlistMessage("custom", waitlistCtx(), {}, "   ")).toBeNull();
    expect(resolveWaitlistMessage("custom", waitlistCtx(), {}, null)).toBeNull();
  });

  it("returns null for an unknown template_key with no override", () => {
    expect(
      resolveWaitlistMessage("waitlist.bogus", waitlistCtx(), {}, null),
    ).toBeNull();
  });
});

describe("resolveReservationMessage", () => {
  it("default parity for reservation.created (all optional clauses present)", () => {
    const ctx = reservationCtx();
    expect(resolveReservationMessage("reservation.created", ctx, {}, null)).toBe(
      renderReservationDefault("reservation.created", ctx),
    );
    expect(resolveReservationMessage("reservation.created", ctx, {}, null)).toBe(
      "Hi Sam, your reservation at Cafe Dexa (123 Main St, Springfield IL 62704) for 4 is confirmed for Fri, Jul 18 at 7:30 PM. Confirmation #ABC123. Reply to this message if you need to make changes.",
    );
  });

  it("interpolates date/time/confirmation tokens in a merchant override", () => {
    const ctx = reservationCtx();
    const config = {
      messageTemplates: {
        "reservation.created":
          "{name}: {store} on {date} @ {time}, party {party_size}, conf {confirmation}",
      },
    };
    expect(resolveReservationMessage("reservation.created", ctx, config, null)).toBe(
      "Sam: Cafe Dexa on Fri, Jul 18 @ 7:30 PM, party 4, conf ABC123",
    );
  });

  it("blank override falls back to default; unknown key returns null", () => {
    const ctx = reservationCtx();
    const config = { messageTemplates: { "reservation.moved": "" } };
    expect(resolveReservationMessage("reservation.moved", ctx, config, null)).toBe(
      renderReservationDefault("reservation.moved", ctx),
    );
    expect(
      resolveReservationMessage("reservation.bogus", ctx, {}, null),
    ).toBeNull();
  });
});
