// lib/rules.ts
// This file will contain pure functions for business logic and validation.

import { PTORequest, SchedulePeriod, ScheduleTemplate, Shift, TemplateShift, WeeklySchedule } from "./types";
import { addDays, areIntervalsOverlapping, isWithinInterval, parseISO, startOfDay, getDay, isValid } from "date-fns";

/**
 * Validates a PTO request based on business rules.
 * @param request The PTO request to validate.
 * @returns An array of error messages if validation fails, otherwise an empty array.
 */
export function validatePtoRequest(request: PTORequest): string[] {
  const errors: string[] = [];

  if (!request.employeeId) {
    errors.push("Employee ID is required for PTO request.");
  }
  if (!request.startDate) {
    errors.push("Start date is required for PTO request.");
  }
  if (!request.endDate) {
    errors.push("End date is required for PTO request.");
  }
  if (request.hours <= 0) {
    errors.push("PTO hours must be greater than zero.");
  }

  const start = new Date(request.startDate);
  const end = new Date(request.endDate);

  if (start > end) {
    errors.push("Start date cannot be after end date.");
  }

  // Add more complex validation rules here as needed, e.g.,
  // - Check if employee has enough PTO balance (will require fetching balance from store)
  // - Check for overlapping requests
  // - Check for requests too far in the future/past

  return errors;
}

export interface ConflictDetail {
  templateShift: TemplateShift;
  conflictType: "overlap" | "pto";
  conflictingWith?: Shift | PTORequest; // The existing item causing the conflict
}

export interface TemplateConflictSummary {
  shiftsToAdd: number;
  conflictsDetected: number;
  conflictDetails: ConflictDetail[];
}

/**
 * Detects conflicts between a schedule template and an existing schedule.
 * Conflicts include overlapping shifts for the same employee and shifts conflicting with approved PTO.
 *
 * @param template The schedule template to check.
 * @param currentSchedule The current schedule (period or weekly).
 * @param currentWeekStartDate The start date of the week currently displayed in the ScheduleGrid.
 * @param approvedPtoRequests A list of approved PTO requests.
 * @returns A summary of conflicts.
 */
export function detectTemplateConflicts(
  template: ScheduleTemplate,
  currentSchedule: SchedulePeriod | WeeklySchedule,
  schedulePeriodStartDate: Date,
  schedulePeriodEndDate: Date,
  approvedPtoRequests: PTORequest[]
): TemplateConflictSummary {
  let totalShiftsToAdd = 0;
  const conflictDetails: ConflictDetail[] = [];

  // Iterate through each day of the schedule period
  let currentDate = startOfDay(schedulePeriodStartDate);
  const endOfPeriod = startOfDay(schedulePeriodEndDate);

  while (currentDate <= endOfPeriod) {
    const dayOfWeek = getDay(currentDate); // 0 for Sunday, 1 for Monday, etc.
    const currentDateISO = currentDate.toISOString().split('T')[0];

    template.shifts.forEach((templateShift) => {
      if (templateShift.dayOfWeek === dayOfWeek) {
        // This template shift applies to the current day
        if (!templateShift.employeeId) {
          // If unassigned, it's a shift to add, but no conflict check needed yet
          totalShiftsToAdd++;
          return;
        }

        // Map templateShift's dayOfWeek to the specific currentDate
        const templateShiftStartDateTime = parseISO(`${currentDateISO}T${templateShift.startTime.split('T')[1]}`);
        const templateShiftEndDateTime = parseISO(`${currentDateISO}T${templateShift.endTime.split('T')[1]}`);

        if (!isValid(templateShiftStartDateTime) || !isValid(templateShiftEndDateTime)) {
          console.warn("Invalid date/time for template shift:", templateShift);
          return;
        }

        const templateShiftInterval = {
          start: templateShiftStartDateTime,
          end: templateShiftEndDateTime,
        };

        let hasConflict = false;

        // 1. Check for Overlapping Shifts with existing shifts in currentSchedule
        const existingEmployeeShiftsOnDay = currentSchedule.shifts.filter(
          (s) => s.employeeId === templateShift.employeeId && s.date === currentDateISO
        );

        for (const existingShift of existingEmployeeShiftsOnDay) {
          const existingShiftStartDateTime = parseISO(existingShift.startTime);
          const existingShiftEndDateTime = parseISO(existingShift.endTime);

          if (!isValid(existingShiftStartDateTime) || !isValid(existingShiftEndDateTime)) {
            console.warn("Invalid date/time for existing shift:", existingShift);
            continue;
          }

          const existingShiftInterval = {
            start: existingShiftStartDateTime,
            end: existingShiftEndDateTime,
          };

          if (areIntervalsOverlapping(templateShiftInterval, existingShiftInterval)) {
            conflictDetails.push({
              templateShift,
              conflictType: "overlap",
              conflictingWith: existingShift,
            });
            hasConflict = true;
            break; // Only need to find one overlap per template shift
          }
        }

        // 2. Check for PTO Conflict (only if no overlap conflict already found)
        if (!hasConflict) {
          const ptoConflict = approvedPtoRequests.find((pto) => {
            if (pto.employeeId !== templateShift.employeeId) return false;

            const ptoStart = startOfDay(parseISO(pto.startDate));
            const ptoEnd = startOfDay(parseISO(pto.endDate));

            // Check if the template shift's date falls within the PTO range
            return isWithinInterval(currentDate, { start: ptoStart, end: ptoEnd });
          });

          if (ptoConflict) {
            conflictDetails.push({
              templateShift,
              conflictType: "pto",
              conflictingWith: ptoConflict,
            });
            hasConflict = true;
          }
        }

        if (!hasConflict) {
          totalShiftsToAdd++;
        }
      }
    });

    currentDate = addDays(currentDate, 1); // Move to the next day
  }

  return {
    shiftsToAdd: totalShiftsToAdd,
    conflictsDetected: conflictDetails.length,
    conflictDetails,
  };
}
