import { useSettingsStore } from "@/stores/useSettingsStore";
import { useEffect, useState } from "react";

/**
 * Tracks elapsed time since an order was opened and whether
 * it has exceeded the configured default sitting time.
 */
export function useTableDuration(
  openedAt: string | null | undefined,
  isActive: boolean,
): { duration: string; isOvertime: boolean } {
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    if (!isActive || !openedAt) {
      setDuration("");
      setIsOvertime(false);
      return;
    }

    const updateDuration = () => {
      const startTime = new Date(openedAt);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      setDuration(`${diffMins} min`);
      setIsOvertime(
        defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes,
      );
    };

    updateDuration();
    const timer = setInterval(updateDuration, 60000);
    return () => clearInterval(timer);
  }, [isActive, openedAt, defaultSittingTimeMinutes]);

  return { duration, isOvertime };
}
