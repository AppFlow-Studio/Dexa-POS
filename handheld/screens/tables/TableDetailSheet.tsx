import React from "react";
import { DetailRow } from "../../components/DetailRow";
import { useOrderByDbId } from "../../hooks/useOrderByDbId";
import { formatCurrency, formatElapsed, minutesSince } from "../../lib/format";
import { tableStatusLabel } from "../../lib/tableStatus";
import { BottomSheet, StickyActionBar } from "../../primitives";
import { useTableLive } from "./useTableLive";

function seatedLabel(iso: string | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${time} · ${formatElapsed(minutesSince(iso))}`;
}

/** Read-only body: the session and, when one is linked, its check. */
function TableDetailBody({ tableId }: { tableId: string }) {
  const { session, serverName } = useTableLive(tableId);
  const order = useOrderByDbId(session?.order_id);
  const status = session?.status ?? "available";
  return (
    <>
      <DetailRow label="Status" value={tableStatusLabel(status)} />
      {session ? (
        <>
          <DetailRow label="Guests" value={String(session.party_size)} />
          <DetailRow label="Server" value={serverName ?? "—"} />
          <DetailRow label="Seated" value={seatedLabel(session.seated_at)} />
        </>
      ) : null}
      {order ? (
        <>
          <DetailRow
            label="Check"
            value={order.display_number ?? order.order_number ?? "—"}
          />
          <DetailRow
            label="Total"
            value={formatCurrency(order.total_amount ?? 0)}
            emphasis
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Screen 1 tap target: a read-only look at one table. Seating, adding items
 * and payment land in later waves; the only action here is Close.
 */
export function TableDetailSheet({
  tableId,
  name,
  onClose,
}: {
  tableId: string | null;
  name: string;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      visible={tableId !== null}
      onClose={onClose}
      title={name}
      footer={
        <StickyActionBar
          actions={[{ label: "Close", onPress: onClose, variant: "secondary" }]}
        />
      }
    >
      {tableId ? <TableDetailBody tableId={tableId} /> : null}
    </BottomSheet>
  );
}
