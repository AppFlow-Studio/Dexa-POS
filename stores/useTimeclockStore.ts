import { ShiftHistoryEntry, UserProfile } from "@/lib/types"; // Assuming this type is in types.ts
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";

type ClockStatus = "clockedOut" | "clockedIn" | "onBreak";

// Define the shape of a single shift
export interface Shift {
  clockInTime: Date | null;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
  clockOutTime: Date | null;
  hasTakenBreak: boolean;
}

interface TimeclockState {
  status: ClockStatus;
  currentShift: Shift | null;
  shiftHistory: ShiftHistoryEntry[]; // To hold the table data
  isClockInWallOpen: boolean;
  // Pin-based tracking with user info
  clockedInByPin: Record<string, {
    clockInTime: Date;
    userProfile: UserProfile;
  }>;
  // Saved user profiles
  savedUserProfiles: UserProfile[];

  // Actions
  clockIn: () => void;
  clockOut: () => void;
  startBreak: () => void;
  endBreak: () => void;
  showClockInWall: () => void;
  hideClockInWall: () => void;
  // Pin actions
  isPinClockedIn: (pin: string) => boolean;
  clockInWithPin: (pin: string) => { ok: true; userProfile: UserProfile } | { ok: false; reason: "already_clocked_in" | "invalid_pin" };
  clockOutWithPin: (pin: string) => { ok: true; userProfile: UserProfile } | { ok: false; reason: "not_clocked_in" | "invalid_pin" };
}

// Default break duration in minutes
const BREAK_DURATION_MINUTES = 30;

// Random user generation function
const generateRandomUser = (pin: string): UserProfile => {
  const firstNames = [
    "Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Avery", "Quinn",
    "Blake", "Cameron", "Drew", "Emery", "Finley", "Hayden", "Jamie", "Kendall",
    "Logan", "Parker", "Reese", "Sage", "Skyler", "Sydney", "Tatum", "River"
  ];

  const lastNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White"
  ];

  const roles = ["Manager", "Cashier", "Chef", "Server", "Host", "Bartender"];
  const countries = ["United States", "Canada", "United Kingdom", "Australia", "Germany", "France"];
  const genders = ["Male", "Female", "Other"] as const;

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const fullName = `${firstName} ${lastName}`;
  const role = roles[Math.floor(Math.random() * roles.length)];
  const country = countries[Math.floor(Math.random() * countries.length)];
  const gender = genders[Math.floor(Math.random() * genders.length)];

  // Generate random date of birth (age between 18-65)
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - Math.floor(Math.random() * 47) - 18;
  const birthMonth = Math.floor(Math.random() * 12) + 1;
  const birthDay = Math.floor(Math.random() * 28) + 1;
  const dob = `${birthMonth.toString().padStart(2, '0')}/${birthDay.toString().padStart(2, '0')}/${birthYear}`;

  // Generate random phone number
  const phone = `+1 (${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;

  // Generate random email
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@restaurant.com`;

  // Generate random address
  const streetNumbers = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const streetNames = ["Main St", "Oak Ave", "Pine Rd", "Elm St", "Cedar Blvd", "Maple Dr", "First St", "Second Ave"];
  const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego"];
  const streetNumber = streetNumbers[Math.floor(Math.random() * streetNumbers.length)];
  const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const address = `${streetNumber} ${streetName}, ${city}`;

  // Generate employee ID
  const employeeId = `EMP${Math.floor(Math.random() * 9000) + 1000}`;

  return {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    employeeId,
    fullName,
    dob,
    gender,
    country,
    address,
    email,
    phone,
    pin,
    profileImageUrl: undefined
  };
};

export const useTimeclockStore = create<TimeclockState>((set, get) => ({
  status: "clockedOut",
  currentShift: null,
  shiftHistory: [], // Start with empty history
  isClockInWallOpen: false,
  clockedInByPin: {},
  savedUserProfiles: [],

  clockIn: () => {
    const newShift: Shift = {
      clockInTime: new Date(),
      breakStartTime: null,
      breakEndTime: null,
      clockOutTime: null,
      hasTakenBreak: false,
    };
    set({ status: "clockedIn", currentShift: newShift });
  },

  clockOut: () => {
    const { currentShift } = get();
    if (!currentShift || !currentShift.clockInTime) return;

    const clockOutTime = new Date();
    const durationMs =
      clockOutTime.getTime() - currentShift.clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: currentShift.clockInTime.toLocaleDateString(),
      role: "Cashier",
      clockIn: currentShift.clockInTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      breakInitiated:
        currentShift.breakStartTime?.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "N/A",
      breakEnded:
        currentShift.breakEndTime?.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) || "N/A",
      clockOut: clockOutTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      duration: `${durationHours}h`,
    };

    set((state) => ({
      status: "clockedOut",
      currentShift: null,
      shiftHistory: [newHistoryEntry, ...state.shiftHistory],
    }));
  },

  startBreak: () => {
    const { currentShift } = get();
    if (currentShift?.hasTakenBreak) {
      toast.error("Break Already Taken", {
        position: ToastPosition.BOTTOM,
        duration: 4000,
      });
      return;
    }

    set((state) => ({
      status: "onBreak",
      currentShift: state.currentShift
        ? { ...state.currentShift, breakStartTime: new Date() }
        : null,
    }));
  },

  endBreak: () => {
    set((state) => {
      if (state.status === "onBreak" && state.currentShift) {
        return {
          status: "clockedIn",
          currentShift: {
            ...state.currentShift,
            breakEndTime: new Date(),
            hasTakenBreak: true, // Mark the break as used
          },
        };
      }
      return {};
    });
  },
  showClockInWall: () => set({ isClockInWallOpen: true }),
  hideClockInWall: () => set({ isClockInWallOpen: false }),

  // Pin helpers
  isPinClockedIn: (pin: string) => {
    const { clockedInByPin } = get();
    return !!clockedInByPin[pin];
  },
  clockInWithPin: (pin: string) => {
    if (!pin || pin.trim().length === 0) return { ok: false as const, reason: "invalid_pin" as const };
    const { clockedInByPin } = get();
    if (clockedInByPin[pin]) {
      return { ok: false as const, reason: "already_clocked_in" as const };
    }

    // Generate a random user profile for this PIN
    const userProfile = generateRandomUser(pin);
    const clockInTime = new Date();

    console.log('🕐 Timeclock: Generated random user for PIN', pin, ':', {
      name: userProfile.fullName,
      role: userProfile.employeeId,
      email: userProfile.email
    });

    set((state) => ({
      status: "clockedIn",
      currentShift: state.currentShift ?? { clockInTime, breakStartTime: null, breakEndTime: null, clockOutTime: null, hasTakenBreak: false },
      clockedInByPin: { ...state.clockedInByPin, [pin]: { clockInTime, userProfile } },
    }));
    return { ok: true as const, userProfile };
  },
  clockOutWithPin: (pin: string) => {
    if (!pin || pin.trim().length === 0) return { ok: false as const, reason: "invalid_pin" as const };
    const { clockedInByPin, savedUserProfiles } = get();
    const entry = clockedInByPin[pin];
    if (!entry) {
      return { ok: false as const, reason: "not_clocked_in" as const };
    }

    const clockOutTime = new Date();
    const clockInTime = entry.clockInTime;
    const userProfile = entry.userProfile;
    const durationMs = clockOutTime.getTime() - clockInTime.getTime();
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    // Determine role from user profile (extract from employeeId or use a default)
    const role = userProfile.employeeId.includes('EMP') ? 'Employee' : 'Cashier';

    const newHistoryEntry: ShiftHistoryEntry = {
      id: `shift_${Date.now()}`,
      date: clockInTime.toLocaleDateString(),
      role: role,
      clockIn: clockInTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      breakInitiated: "N/A",
      breakEnded: "N/A",
      clockOut: clockOutTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: `${durationHours}h`,
    };

    console.log('🕐 Timeclock: Clocking out user:', {
      name: userProfile.fullName,
      pin: pin,
      duration: `${durationHours}h`,
      role: role
    });

    set((state) => {
      const { [pin]: _, ...rest } = state.clockedInByPin;

      // Save the user profile to the saved profiles list
      const updatedSavedProfiles = [...savedUserProfiles, userProfile];

      return {
        status: Object.keys(rest).length > 0 ? state.status : "clockedOut",
        currentShift: Object.keys(rest).length > 0 ? state.currentShift : null,
        shiftHistory: [newHistoryEntry, ...state.shiftHistory],
        clockedInByPin: rest,
        savedUserProfiles: updatedSavedProfiles,
      };
    });
    return { ok: true as const, userProfile };
  },
}));
