/**
 * Register all session side effects at app startup.
 * Called once from _layout.tsx alongside setupTableOrderPrefetch().
 */

import { registerSessionSideEffect } from "@/lib/sessionSideEffects";
import { sendToKitchenEffect } from "./sendToKitchenEffect";
import { closeCheckEffect } from "./closeCheckEffect";
import { reopenCheckEffect } from "./reopenCheckEffect";
import { voidOrderEffect } from "./voidOrderEffect";
import { clearTableEffect } from "./clearTableEffect";

let teardown: (() => void) | null = null;

export function registerAllSessionSideEffects(): void {
  // Prevent double registration
  if (teardown) return;

  const unsubs = [
    registerSessionSideEffect(
      ["SEND_TO_KITCHEN"],
      sendToKitchenEffect,
      "sendToKitchen",
    ),
    registerSessionSideEffect(
      ["CLOSE_CHECK"],
      closeCheckEffect,
      "closeCheck",
    ),
    registerSessionSideEffect(
      ["REOPEN_CHECK"],
      reopenCheckEffect,
      "reopenCheck",
    ),
    registerSessionSideEffect(
      ["VOID_ORDER"],
      voidOrderEffect,
      "voidOrder",
    ),
    registerSessionSideEffect(
      ["CLEAR_TABLE"],
      clearTableEffect,
      "clearTable",
    ),
  ];

  teardown = () => {
    unsubs.forEach((fn) => fn());
    teardown = null;
  };
}

export function teardownAllSessionSideEffects(): void {
  teardown?.();
}
