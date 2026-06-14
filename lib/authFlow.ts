export function getPinPromptLabel(pinLength: number): string {
  return `Enter your ${pinLength}-digit PIN`;
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
