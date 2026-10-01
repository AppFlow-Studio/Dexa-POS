import { getPosAccessFailure } from "@/lib/posAccessControl";

export function getPinPromptLabel(pinLength: number): string {
  return `Enter your ${pinLength}-digit PIN`;
}

/**
 * KDS and kiosk stations run unattended: they start without a staff PIN
 * (pos_station_login) and land straight on their screen. Every other station
 * signs in with a staff PIN on pin-login.
 */
export function isUnattendedStation(stationType?: string | null): boolean {
  return stationType === "kds" || stationType === "self_service";
}

export function resolvePostLoginRoute(
  stationType?: string | null,
): "home" | "kds" | "kiosk" {
  if (stationType === "kds") return "kds";
  if (stationType === "self_service") return "kiosk";
  return "home";
}

function isInactiveAccountError(code?: string | null, message?: string | null) {
  const normalizedCode = String(code ?? "").toLowerCase();
  const normalizedMessage = String(message ?? "").toLowerCase();

  return (
    normalizedCode.includes("inactive") ||
    normalizedCode.includes("disabled") ||
    normalizedCode.includes("deactivated") ||
    normalizedMessage.includes("inactive") ||
    normalizedMessage.includes("disabled") ||
    normalizedMessage.includes("deactivated") ||
    normalizedMessage.includes("not active")
  );
}

export function getPinAuthFailure(input: {
  error?: string | null;
  errorCode?: string | null;
  offline?: boolean;
}): { title: string; message: string } {
  const message = String(input.error ?? "").trim();
  const posAccessFailure = getPosAccessFailure({
    error: message,
    errorCode: input.errorCode,
  });

  if (posAccessFailure) {
    return {
      title: posAccessFailure.title,
      message: posAccessFailure.message,
    };
  }

  if (isInactiveAccountError(input.errorCode, message)) {
    return {
      title: "Account Inactive",
      message:
        "This account is inactive. Ask a manager to reactivate it before signing in.",
    };
  }

  if (input.offline) {
    return {
      title: "Sign In Failed",
      message: "The PIN you entered is incorrect.",
    };
  }

  if (message.toLowerCase().includes("pin")) {
    return {
      title: "Invalid PIN",
      message: "The PIN you entered is incorrect.",
    };
  }

  return {
    title: "Sign In Failed",
    message: message || "Unable to sign in. Please try again.",
  };
}
