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

export function renderTemplate(key: TemplateKey, ctx: NotifyContext): string {
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
