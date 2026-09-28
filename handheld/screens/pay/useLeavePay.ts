import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Back to the check from anywhere in the pay flow. The flow pushes several
 * screens over the check (pay → tip → charge, pay → cash, pay → split), so a
 * single back() would land mid-flow. Unwind the whole flow.
 */
export function useLeavePay(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else router.back();
  }, [router]);
}
