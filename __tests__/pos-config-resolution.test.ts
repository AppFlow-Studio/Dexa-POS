import { resolveEffectivePosConfig } from "@/lib/posConfigResolution";

describe("POS config resolution", () => {
  it("applies defaults, then location config, then station overrides", () => {
    const config = resolveEffectivePosConfig(
      {
        _version: 42,
        printing: {
          autoPrintReceipt: true,
          printCustomerCopy: false,
        } as any,
        notifications: {
          soundEnabled: true,
          onlineOrderSound: "bell",
        } as any,
      },
      {
        printing: {
          autoPrintKitchenTickets: false,
        } as any,
        notifications: {
          soundEnabled: false,
        } as any,
      },
    );

    expect(config._version).toBe(42);
    expect(config.printing.autoPrintReceipt).toBe(true);
    expect(config.printing.autoPrintKitchenTickets).toBe(false);
    expect(config.printing.printCustomerCopy).toBe(false);
    expect(config.printing.autoPrintVoidReceipt).toBe(true);
    expect(config.notifications.soundEnabled).toBe(false);
    expect(config.notifications.onlineOrderSound).toBe("bell");
    expect(config.notifications.kioskOrderSound).toBe("ding");
  });

  it("does not mutate the provided location config", () => {
    const locationConfig = {
      payment: {
        cashEnabled: true,
      },
    };

    const config = resolveEffectivePosConfig(locationConfig as any, {
      payment: {
        cashEnabled: false,
      },
    } as any);

    expect(config.payment.cashEnabled).toBe(false);
    expect(locationConfig.payment.cashEnabled).toBe(true);
  });

  it("does not allow station overrides to replace location-owned metadata", () => {
    const config = resolveEffectivePosConfig(
      {
        _version: 7,
        _updated_at: "2026-06-30T12:00:00Z",
      },
      {
        _version: 999,
        _updated_at: "bad",
      } as any,
    );

    expect(config._version).toBe(7);
    expect(config._updated_at).toBe("2026-06-30T12:00:00Z");
  });
});
