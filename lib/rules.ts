// lib/rules.ts
// This file will contain pure functions for business logic and validation.

import { PTORequest } from "./types";

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
