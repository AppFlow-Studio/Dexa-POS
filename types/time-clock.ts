export type TimeClockStatus = 'idle' | 'active' | 'on_break' | 'completed';
export type TimeClockActionType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

export interface TimeClockAction {
  id: string; // Unique ID for the queue item
  type: TimeClockActionType;
  pinCode: string;
  locationId: string;
  timestamp: string; // ISO String (captured at moment of button press)
  deviceId: string;
}

export interface StaffShiftState {
  currentStatus: TimeClockStatus;
  currentShiftId: string | null;
  lastActionTime: string | null;
  staffName: string | null;
}