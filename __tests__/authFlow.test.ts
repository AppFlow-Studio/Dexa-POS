import {
    getPinAuthFailure,
    getPinPromptLabel,
    resolvePostLoginRoute,
} from "@/lib/authFlow";

describe("authFlow", () => {
  it("renders the persistent PIN prompt label with the required length", () => {
    expect(getPinPromptLabel(4)).toBe("Enter your 4-digit PIN");
  });

  it("maps inactive-account failures to a distinct message", () => {
    expect(
      getPinAuthFailure({
        errorCode: "ACCOUNT_INACTIVE",
        error: "Account is inactive",
      }),
    ).toEqual({
      title: "Account Inactive",
      message:
        "This account is inactive. Ask a manager to reactivate it before signing in.",
    });
  });

  it("maps invalid PIN failures to a distinct message", () => {
    expect(
      getPinAuthFailure({
        error: "INVALID_PIN",
      }),
    ).toEqual({
      title: "Invalid PIN",
      message: "The PIN you entered is incorrect.",
    });
  });

  it("uses the offline invalid-pin copy when sign-in is deferred offline", () => {
    expect(getPinAuthFailure({ offline: true })).toEqual({
      title: "Sign In Failed",
      message: "The PIN you entered is incorrect.",
    });
  });

  it("routes KDS, kiosk, and POS stations to their correct landing screens", () => {
    expect(resolvePostLoginRoute("kds")).toBe("kds");
    expect(resolvePostLoginRoute("self_service")).toBe("kiosk");
    expect(resolvePostLoginRoute("pos")).toBe("home");
    expect(resolvePostLoginRoute(undefined)).toBe("home");
  });
});
