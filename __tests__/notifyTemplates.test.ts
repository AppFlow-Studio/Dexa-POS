import {
  NotifyContext,
  describeContext,
  getTemplatesForContext,
  renderTemplate,
} from "@/lib/notifyTemplates";

describe("notifyTemplates", () => {
  describe("getTemplatesForContext", () => {
    it("returns ready templates for waitlist_ready", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const templates = getTemplatesForContext(ctx).map((t) => t.key);
      expect(templates).toEqual([
        "waitlist.tableReady",
        "waitlist.almostReady",
        "custom",
      ]);
    });

    it("returns update templates for waitlist_update", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_update",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const templates = getTemplatesForContext(ctx).map((t) => t.key);
      expect(templates).toEqual([
        "waitlist.runningLate",
        "waitlist.updateConfirmed",
        "custom",
      ]);
    });

    it("returns reservation templates for reservation_update", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "7:00 PM",
        changed: ["date"],
      };
      const templates = getTemplatesForContext(ctx).map((t) => t.key);
      expect(templates).toEqual([
        "reservation.moved",
        "reservation.timeChanged",
        "reservation.confirmation",
        "custom",
      ]);
    });
  });

  describe("renderTemplate", () => {
    it("renders the waitlist tableReady template with party + store", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const message = renderTemplate("waitlist.tableReady", ctx);
      expect(message).toContain("Alex");
      expect(message).toContain("Test Bistro");
      expect(message).toContain("ready");
    });

    it("renders the waitlist almostReady template", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const message = renderTemplate("waitlist.almostReady", ctx);
      expect(message).toContain("Alex");
      expect(message).toContain("5 minutes");
    });

    it("includes minutesAdded when provided for runningLate", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        minutesAdded: 15,
      };
      const message = renderTemplate("waitlist.runningLate", ctx);
      expect(message).toContain("15 more minutes");
    });

    it("uses generic copy when minutesAdded is absent", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_update",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const message = renderTemplate("waitlist.runningLate", ctx);
      expect(message).toContain("a few more minutes");
    });

    it("renders reservation.moved with new date + time", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "7:00 PM",
        changed: ["date"],
      };
      const message = renderTemplate("reservation.moved", ctx);
      expect(message).toContain("Alex");
      expect(message).toContain("Jun 10");
      expect(message).toContain("7:00 PM");
      expect(message).toContain("Test Bistro");
    });

    it("renders reservation.timeChanged with date + new time", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "8:30 PM",
        changed: ["time"],
      };
      const message = renderTemplate("reservation.timeChanged", ctx);
      expect(message).toContain("8:30 PM");
      expect(message).toContain("Jun 10");
    });

    it("renders reservation.confirmation copy", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "7:00 PM",
        changed: [],
      };
      const message = renderTemplate("reservation.confirmation", ctx);
      expect(message.toLowerCase()).toContain("confirming");
      expect(message).toContain("Jun 10");
    });

    it("returns empty string for custom template", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      expect(renderTemplate("custom", ctx)).toBe("");
    });

    it("returns empty when reservation template is rendered with non-reservation context", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      expect(renderTemplate("reservation.moved", ctx)).toBe("");
      expect(renderTemplate("reservation.timeChanged", ctx)).toBe("");
      expect(renderTemplate("reservation.confirmation", ctx)).toBe("");
    });
  });

  describe("describeContext", () => {
    it("lists the changed fields for reservation_update", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "7:00 PM",
        changed: ["date", "time"],
      };
      const desc = describeContext(ctx);
      expect(desc).toContain("Jun 10");
      expect(desc).toContain("7:00 PM");
    });

    it("falls back to confirmation copy when nothing changed", () => {
      const ctx: NotifyContext = {
        kind: "reservation_update",
        partyName: "Alex",
        storeName: "Test Bistro",
        newDate: "Jun 10",
        newTime: "7:00 PM",
        changed: [],
      };
      const desc = describeContext(ctx);
      expect(desc).toContain("Jun 10");
    });

    it("returns a concise label for waitlist_ready", () => {
      const ctx: NotifyContext = {
        kind: "waitlist_ready",
        partyName: "Alex",
        storeName: "Test Bistro",
      };
      const desc = describeContext(ctx);
      expect(desc.toLowerCase()).toContain("table");
    });
  });
});
