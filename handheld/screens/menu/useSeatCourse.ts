import { useTableCoursing } from "@/hooks/useTableCoursing";
import { useTableSeating } from "@/hooks/useTableSeating";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { isTableCheck, tableIdOf } from "../../lib/sendCourse";

export interface SeatCourse {
  /** Only a seated table check has seats; `active` null = shared. */
  seat: { enabled: boolean; active: number | null; count: number; set: (seat: number | null) => void };
  /** Only a coursed table check has courses; `current` is the working course new items land on. */
  course: { enabled: boolean; current: number; set: (course: number) => void };
}

/**
 * Screen 3's "Course 2 · Seat 2": the register's seating and coursing hooks
 * for one check, initialised the way TableOrderView does (party size from
 * the session, the coursing store only when the location courses). Items
 * added while the page is up take `seat.active` and land on `course.current`.
 */
export function useSeatCourse(orderId: string): SeatCourse {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const table = !!order && isTableCheck(order);
  const coursing = useLocationConfigStore((s) => s.config.dining.enableCoursing);
  const partySize = useTableSessionStore((s) => {
    const tableId = order && table ? tableIdOf(order) : null;
    return (tableId ? s.sessions[tableId]?.party_size : undefined) ?? 2;
  });

  const seating = useTableSeating(table ? order : undefined, partySize);
  const courses = useTableCoursing(order, coursing && table);

  return {
    seat: { enabled: table, active: seating.activeSeat, count: seating.seatCount, set: seating.setActiveSeat },
    course: {
      enabled: coursing && table,
      current: courses.currentCourse,
      set: (course) => courses.setCurrentCourse(orderId, course),
    },
  };
}
