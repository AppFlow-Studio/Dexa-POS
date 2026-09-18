import * as Sentry from "@sentry/react-native";
import { flagKioskAssistance } from "@/components/kiosk/shared/flagKioskAssistance";

// Sentry is mocked in jest-setup.ts (captureMessage is a jest.fn()).
const captureMessage = Sentry.captureMessage as jest.Mock;

describe("flagKioskAssistance", () => {
  beforeEach(() => {
    captureMessage.mockClear();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
  });

  it("raises a Sentry event with the reason tag and order/station context", () => {
    flagKioskAssistance({
      reason: "charge_verify",
      message: "Payment is being verified. Please see a staff member before trying again.",
      at: "2026-09-15T12:34:56.000Z",
      stationId: "station-1",
      dbOrderId: "db-order-9",
      orderId: "local-order-9",
      displayNumber: "042",
    });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [name, options] = captureMessage.mock.calls[0];
    expect(name).toBe("kiosk.payment.assistance");
    expect(options.level).toBe("error");
    expect(options.tags).toMatchObject({
      surface: "kiosk",
      reason: "charge_verify",
    });
    expect(options.extra).toMatchObject({
      at: "2026-09-15T12:34:56.000Z",
      stationId: "station-1",
      dbOrderId: "db-order-9",
      orderId: "local-order-9",
      displayNumber: "042",
    });
  });

  it("still logs to the console when Sentry throws (non-fatal)", () => {
    captureMessage.mockImplementationOnce(() => {
      throw new Error("sentry down");
    });

    expect(() =>
      flagKioskAssistance({
        reason: "guard_held",
        message: "This kiosk needs staff assistance before another payment can start.",
        at: "2026-09-15T12:00:00.000Z",
      }),
    ).not.toThrow();

    expect(console.error).toHaveBeenCalled();
  });
});
