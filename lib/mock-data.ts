import { Role } from "./types";

export interface Shift {
  id: string;
  employeeId: string | null;
  role: Role;
  start: string; // HH:mm format
  end: string;
  date: string; // YYYY-MM-DD
  requiredCount: number;
  notes?: string;
  isOpen: boolean;
  locked?: boolean;
}

export const mockShifts: Shift[] = [
  {
    id: "s1",
    employeeId: "emp_1759078476073_0",
    role: "Cashier",
    start: "08:00",
    end: "16:00",
    date: "2025-01-13",
    requiredCount: 1,
    isOpen: false,
  },
  {
    id: "emp_1759078476073_1",
    employeeId: "2",
    role: "Line Cook",
    start: "10:00",
    end: "18:00",
    date: "2025-01-13",
    requiredCount: 1,
    isOpen: false,
  },
  {
    id: "emp_1759078476073_2",
    employeeId: null,
    role: "Barista",
    start: "06:00",
    end: "14:00",
    date: "2025-01-14",
    requiredCount: 2,
    isOpen: true,
  },
  {
    id: "s4",
    employeeId: "emp_1759078476073_3",
    role: "Supervisor",
    start: "12:00",
    end: "20:00",
    date: "2025-01-14",
    requiredCount: 1,
    isOpen: false,
  },
];

export function getWeekDates(startDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  return dates;
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const h = Number.parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}
