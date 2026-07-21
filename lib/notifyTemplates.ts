export type TemplateKey =
  | "waitlist.tableReady"
  | "waitlist.almostReady"
  | "waitlist.runningLate"
  | "waitlist.updateConfirmed"
  | "reservation.moved"
  | "reservation.timeChanged"
  | "reservation.confirmation"
  | "custom";

export type NotifyContext =
  | {
      kind: "waitlist_ready";
      partyName: string;
      storeName: string;
    }
  | {
      kind: "waitlist_update";
      partyName: string;
      storeName: string;
      minutesAdded?: number;
    }
  | {
      kind: "reservation_update";
      partyName: string;
      storeName: string;
      newDate: string;
      newTime: string;
      changed: ("date" | "time" | "party_size")[];
    };

export interface TemplateOption {
  key: TemplateKey;
  label: string;
}

export function getTemplatesForContext(ctx: NotifyContext): TemplateOption[] {
  switch (ctx.kind) {
    case "waitlist_ready":
      return [
        { key: "waitlist.tableReady", label: "Table Ready" },
        { key: "waitlist.almostReady", label: "Almost Ready" },
        { key: "custom", label: "Custom" },
      ];
    case "waitlist_update":
      return [
        { key: "waitlist.runningLate", label: "Running Late" },
        { key: "waitlist.updateConfirmed", label: "Update Confirmed" },
        { key: "custom", label: "Custom" },
      ];
    case "reservation_update":
      return [
        { key: "reservation.moved", label: "Reservation Moved" },
        { key: "reservation.timeChanged", label: "Time Changed" },
        { key: "reservation.confirmation", label: "Confirmation" },
        { key: "custom", label: "Custom" },
      ];
  }
}

// Fill the `{token}` placeholders the composer knows about, leaving any other
// token (e.g. {party_size}, {store_address}) verbatim — the server fills those
// from the row at send time. Mirrors the whitelist substitution in
// supabase/functions/_shared/notifyTemplates.ts.
function fillTokens(template: string, tokens: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

function tokensFromContext(ctx: NotifyContext): Record<string, string> {
  const tokens: Record<string, string> = {
    name: ctx.partyName,
    store: ctx.storeName,
  };
  if (ctx.kind === "reservation_update") {
    tokens.date = ctx.newDate;
    tokens.time = ctx.newTime;
  }
  return tokens;
}

/**
 * Render the composer preview for a template. When the merchant has saved a
 * custom template for this event (`merchantTemplate`), preview that instead of
 * the built-in default so the host sees what the guest will actually receive.
 */
export function renderTemplate(
  key: TemplateKey,
  ctx: NotifyContext,
  merchantTemplate?: string | null,
): string {
  if (
    key !== "custom" &&
    typeof merchantTemplate === "string" &&
    merchantTemplate.trim().length > 0
  ) {
    return fillTokens(merchantTemplate.trim(), tokensFromContext(ctx)).slice(
      0,
      500,
    );
  }

  const { partyName, storeName } = ctx;
  switch (key) {
    case "waitlist.tableReady":
      return `Hi ${partyName}! Your table at ${storeName} is ready. Please check in with the host within 10 minutes.`;
    case "waitlist.almostReady":
      return `Hi ${partyName}! Your table at ${storeName} will be ready in about 5 minutes. Please head back to the host stand.`;
    case "waitlist.runningLate": {
      const extra =
        ctx.kind === "waitlist_update" && ctx.minutesAdded
          ? `about ${ctx.minutesAdded} more minutes`
          : "a few more minutes";
      return `Hi ${partyName}, we're running ${extra} behind at ${storeName}. Thanks for your patience — we'll have your table ready soon.`;
    }
    case "waitlist.updateConfirmed":
      return `Hi ${partyName}, just a quick update on your wait at ${storeName}. We'll have your table ready as soon as possible.`;
    case "reservation.moved":
      if (ctx.kind === "reservation_update") {
        return `Hi ${partyName}, your reservation at ${storeName} has been moved to ${ctx.newDate} at ${ctx.newTime}. Reply to this message to confirm.`;
      }
      return "";
    case "reservation.timeChanged":
      if (ctx.kind === "reservation_update") {
        return `Hi ${partyName}, your reservation time at ${storeName} on ${ctx.newDate} has changed to ${ctx.newTime}. Reply to this message to confirm.`;
      }
      return "";
    case "reservation.confirmation":
      if (ctx.kind === "reservation_update") {
        return `Hi ${partyName}, this is ${storeName} confirming your reservation on ${ctx.newDate} at ${ctx.newTime}. See you soon!`;
      }
      return "";
    case "custom":
      return "";
  }
}

// Mirror of the server-side `waitlist.added` template. The edge function is the
// source of truth — this helper is kept so the in-app preview matches what the
// guest actually receives.
export function renderWaitlistAddedMessage(params: {
  partyName: string;
  storeName: string;
  storeAddress?: string;
  quotedWaitMinutes?: number;
}): string {
  const addressClause = params.storeAddress ? ` (${params.storeAddress})` : "";
  const waitClause =
    params.quotedWaitMinutes != null && params.quotedWaitMinutes > 0
      ? `in ${params.quotedWaitMinutes} min`
      : "soon";
  return `Hi ${params.partyName}, you're on the waitlist at ${params.storeName}${addressClause}. Your seat should be ready ${waitClause}. We'll text you when it's ready.`;
}

// Auto-send confirmation after a new reservation is created. Not surfaced in
// NotifyCustomerModal (that modal is for updates / Notify-now flows).
export function renderReservationCreatedMessage(params: {
  partyName: string;
  storeName: string;
  storeAddress?: string;
  partySize?: number;
  reservationDate: string;
  reservationTime: string;
  confirmationNumber?: string;
}): string {
  const addressClause = params.storeAddress ? ` (${params.storeAddress})` : "";
  const partyClause = params.partySize ? ` for ${params.partySize}` : "";
  const confClause = params.confirmationNumber
    ? ` Confirmation #${params.confirmationNumber}.`
    : "";
  return `Hi ${params.partyName}, your reservation at ${params.storeName}${addressClause}${partyClause} is confirmed for ${params.reservationDate} at ${params.reservationTime}.${confClause} Reply to this message if you need to make changes.`;
}

export function describeContext(ctx: NotifyContext): string {
  switch (ctx.kind) {
    case "waitlist_ready":
      return "Notify guest their table is ready";
    case "waitlist_update":
      return "Send a wait update";
    case "reservation_update": {
      const parts: string[] = [];
      if (ctx.changed.includes("date")) parts.push(`New date: ${ctx.newDate}`);
      if (ctx.changed.includes("time")) parts.push(`New time: ${ctx.newTime}`);
      if (ctx.changed.includes("party_size")) parts.push("Party size updated");
      return parts.length > 0
        ? parts.join(" · ")
        : `Confirm reservation for ${ctx.newDate} at ${ctx.newTime}`;
    }
  }
}
