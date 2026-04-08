/**
 * Server Assignment Service
 *
 * Manages server-to-section assignments and server-to-table transfers.
 * Works with the server_sections table and table_sessions.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveServer {
  staffProfileId: string;
  employeeId: string; // location_member ID
  displayName: string;
  role: string;
}

/**
 * Assign a server to a section.
 * Updates the server_sections row's assigned_staff_id.
 */
export async function assignServerToSection(
  supabase: SupabaseClient,
  sectionId: string,
  staffProfileId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("server_sections")
    .update({
      assigned_staff_id: staffProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId);

  if (error) {
    console.error("[ServerAssignment] Failed to assign server:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Unassign a server from a section.
 * Sets assigned_staff_id to null.
 */
export async function unassignServerFromSection(
  supabase: SupabaseClient,
  sectionId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("server_sections")
    .update({
      assigned_staff_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId);

  if (error) {
    console.error("[ServerAssignment] Failed to unassign server:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Transfer a table session to a different server.
 * Updates the server_staff_id on the table_sessions row.
 */
export async function transferTableServer(
  supabase: SupabaseClient,
  sessionId: string,
  newServerStaffId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("table_sessions")
    .update({
      server_staff_id: newServerStaffId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) {
    console.error("[ServerAssignment] Failed to transfer server:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get the assigned server for a table based on its section.
 * Returns the staff_profile_id of the assigned server, or null if no assignment.
 */
export function getServerForTable(
  tableId: string,
  tablesById: Record<string, { section_id?: string }>,
  sectionsById: Record<string, { assigned_staff_id: string | null }>
): string | null {
  const table = tablesById[tableId];
  if (!table?.section_id) return null;

  const section = sectionsById[table.section_id];
  return section?.assigned_staff_id ?? null;
}
