import React, { useState } from "react";
import { CoursePickerSheet } from "../../screens/menu/CoursePickerSheet";
import { OptionsSheet } from "../../screens/menu/OptionsSheet";
import { SeatPickerSheet } from "../../screens/menu/SeatPickerSheet";
import type { OptionsTarget } from "../../screens/menu/useOptionsDraft";
import type { SeatCourse } from "../../screens/menu/useSeatCourse";
import { ItemNoteSheet } from "./ItemNoteSheet";
import { ItemSheet } from "./ItemSheet";
import { ManagerPinScreen } from "./ManagerPinScreen";
import { VoidReasonSheet } from "./VoidReasonSheet";
import type { useItemActions } from "./useItemActions";

/**
 * Whichever item sheet is up for the tapped line, one at a time (each is a
 * Modal). Mounted once by the check page under `useItemActions`.
 */
export function ItemSheets({ orderId, actions, sc }: { orderId: string; actions: ReturnType<typeof useItemActions>; sc: SeatCourse }) {
  const [target, setTarget] = useState<OptionsTarget | null>(null);
  const { item, sheet } = actions;
  if (!item) return null;

  switch (sheet) {
    case "menu":
      return (
        <ItemSheet
          item={item}
          sent={actions.sent}
          seats={sc.seat.enabled}
          courses={sc.course.enabled}
          onQuantity={actions.setQuantity}
          onOptions={() => {
            const next = actions.optionsTarget();
            if (!next) return;
            setTarget(next);
            actions.setSheet("options");
          }}
          onNote={() => actions.setSheet("note")}
          onSeat={() => actions.setSheet("seat")}
          onCourse={() => actions.setSheet("course")}
          onRemove={actions.remove}
          onVoid={() => actions.setSheet("reason")}
          onClose={actions.close}
        />
      );
    case "options":
      return target ? <OptionsSheet key={item.id} target={target} onAdd={actions.saveOptions} onClose={actions.close} /> : null;
    case "note":
      return <ItemNoteSheet item={item} onSave={actions.saveNote} onClose={actions.close} />;
    case "seat":
      return (
        <SeatPickerSheet
          orderId={orderId}
          count={sc.seat.count}
          value={item.seatNumber ?? null}
          title="Move to seat"
          onPick={actions.moveSeat}
          onClose={actions.close}
        />
      );
    case "course":
      return (
        <CoursePickerSheet orderId={orderId} value={item.courseNumber ?? 1} title="Move to course" onPick={actions.moveCourse} onClose={actions.close} />
      );
    case "reason":
      return <VoidReasonSheet itemName={item.name} onPick={actions.pickReason} onClose={actions.close} />;
    case "pin":
      return <ManagerPinScreen action={`Void ${item.name}`} onApproved={actions.approved} onCancel={actions.close} />;
    default:
      return null;
  }
}
