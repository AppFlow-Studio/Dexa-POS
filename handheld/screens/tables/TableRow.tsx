import React, { useCallback } from "react";
import { formatElapsed, minutesSince } from "../../lib/format";
import { tableStatusColor, tableStatusLabel } from "../../lib/tableStatus";
import { ListRow } from "../../primitives";
import { useTableLive } from "./useTableLive";

function guestsLabel(count: number | undefined): string {
  if (!count) return "";
  return count === 1 ? "1 guest" : `${count} guests`;
}

/**
 * One Tables row. Props are primitives plus a stable callback, so the
 * FlashList can recycle it; the live session comes from its own selector.
 */
export const TableRow = React.memo(function TableRow({
  id,
  name,
  now,
  onPress,
}: {
  id: string;
  name: string;
  now: number;
  onPress: (tableId: string) => void;
}) {
  const { session, serverName } = useTableLive(id);
  const status = session?.status ?? "available";
  const elapsed = formatElapsed(minutesSince(session?.seated_at, now));
  const subtitle = [tableStatusLabel(status), guestsLabel(session?.party_size)]
    .filter(Boolean)
    .join(" · ");

  const handlePress = useCallback(() => onPress(id), [onPress, id]);

  return (
    <ListRow
      title={name}
      subtitle={subtitle}
      value={elapsed || undefined}
      meta={serverName ?? undefined}
      dotColor={tableStatusColor(status)}
      onPress={handlePress}
      chevron
    />
  );
});
