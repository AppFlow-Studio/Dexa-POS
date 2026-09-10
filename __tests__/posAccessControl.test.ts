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

  it.each(["billing_exempt", "past_due_grace"])(
    "allows authoritative %s access",
    (status) => {
      const access = normalizeMerchantBillingAccess({
        allowed: true,
        status,
      });

      expect(access).toMatchObject({
        allowed: true,
        failure: null,
        status,
      });
    },
  );

  it("does not infer denial from nested statuses when the RPC allows access", () => {
    const access = normalizeMerchantBillingAccess({
      access_allowed: true,
      status: "billing_exempt",
      subscription_status: "suspended",
      location_subscription_status: "past_due",
    });

    expect(access).toMatchObject({
      allowed: true,
      failure: null,
      status: "billing_exempt",
    });
  });

  it.each(["subscription_suspended", "location_suspended"])(
    "honors an explicit allow for %s",
    (status) => {
      expect(
        normalizeMerchantBillingAccess({ allowed: true, status }),
      ).toMatchObject({ allowed: true, failure: null, status });
    },
  );

  it.each([
    ["merchant_suspended", { billing_exempt: true }],
    ["subscription_canceled", {}],
    ["location_canceled", {}],
    ["subscription_suspended", { billing_exempt: false }],
  ])("blocks authoritative %s access", (status, extra) => {
    const access = normalizeMerchantBillingAccess({
      allowed: false,
      status,
      ...extra,
    });

    expect(access).toMatchObject({
      allowed: false,
      failure: { reason: "subscription_suspended" },
      status,
    });
  });

  it("supports one-row RPC payloads", () => {
    expect(
      normalizeMerchantBillingAccess([
        { pos_access_allowed: true, status: "past_due_grace" },
      ]),
    ).toMatchObject({ allowed: true, status: "past_due_grace" });
  });

  it("fails closed when the access RPC payload is empty", () => {
    expect(normalizeMerchantBillingAccess(null)).toMatchObject({
      allowed: false,
      failure: { reason: "subscription_suspended" },
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

  it("maps canceled location access errors to the access-blocked message", () => {
    expect(
      getPosAccessFailure({ errorCode: "LOCATION_CANCELED" }),
    ).toMatchObject({
      reason: "subscription_suspended",
      title: "Billing Suspended",
    });
  });

  it("never maps past_due_grace to a billing failure", () => {
    expect(
      getPosAccessFailure({ errorCode: "past_due_grace" }),
    ).toBeNull();
  });
});
