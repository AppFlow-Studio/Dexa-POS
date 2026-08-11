import {
  getPosAccessFailure,
  normalizeMerchantBillingAccess,
} from "@/lib/posAccessControl";

describe("posAccessControl", () => {
  it("blocks suspended merchant subscription status", () => {
    const access = normalizeMerchantBillingAccess({
      subscription_status: "suspended",
    });

    expect(access.allowed).toBe(false);
    expect(access.failure).toMatchObject({
      reason: "subscription_suspended",
      title: "Billing Suspended",
    });
  });

  it("allows active merchant subscription status", () => {
    const access = normalizeMerchantBillingAccess({
      subscription_status: "active",
    });

    expect(access).toMatchObject({
      allowed: true,
      failure: null,
      status: "active",
    });
  });

  it("maps station quota errors to the station-limit message", () => {
    const failure = getPosAccessFailure({
      errorCode: "STATION_QUOTA_EXCEEDED",
      error: "Paid station limit reached",
    });

    expect(failure).toMatchObject({
      reason: "station_quota",
      title: "Station Limit Reached",
      message: "Paid station limit reached",
    });
  });

  it("maps billing text errors to the billing-suspended message", () => {
    const failure = getPosAccessFailure({
      error: "Subscription suspended for non payment",
    });

    expect(failure).toMatchObject({
      reason: "subscription_suspended",
      title: "Billing Suspended",
      message: "Subscription suspended for non payment",
    });
  });
});
