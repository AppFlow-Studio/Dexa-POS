-- ============================================================================
-- get_floor_plan_objects_with_sessions
-- ============================================================================
-- Fetches ALL floor plan objects (not just tables/booths) with their sessions.
-- This includes walls, decorations, zones, and other functional objects.
--
-- Returns objects ordered by z_index for proper layering.
--

CREATE OR REPLACE FUNCTION get_floor_plan_objects_with_sessions(
  p_floor_plan_id UUID
)
RETURNS TABLE (
  id                  UUID,
  floor_plan_id       UUID,
  location_id         UUID,
  merchant_id         UUID,
  name                TEXT,
  shape_id            TEXT,
  category            TEXT,
  x                   NUMERIC,
  y                   NUMERIC,
  rotation            NUMERIC,
  z_index             INT,
  width               NUMERIC,
  height              NUMERIC,
  capacity            INT,
  min_capacity        INT,
  is_reservable       BOOLEAN,
  is_combinable       BOOLEAN,
  is_visible          BOOLEAN,
  is_active           BOOLEAN,
  section_id          UUID,
  zone_name           TEXT,
  default_turn_time   INT,
  label_override      TEXT,
  color_override      TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ,
  session_id          UUID,
  session_status      TEXT,
  session_number      TEXT,
  party_size          INT,
  guest_name          TEXT,
  order_id            UUID,
  server_staff_id     UUID,
  is_vip              BOOLEAN,
  needs_attention     BOOLEAN,
  current_course      INT,
  seated_at           TIMESTAMPTZ,
  reservation_id      UUID,
  waitlist_id         UUID,
  merged_tables       UUID[]
)
LANGUAGE plpgsql SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fpo.id,
    fpo.floor_plan_id,
    fpo.location_id,
    fpo.merchant_id,
    fpo.name,
    fpo.shape_id,
    fpo.category::TEXT,
    fpo.x,
    fpo.y,
    fpo.rotation,
    fpo.z_index,
    fpo.width,
    fpo.height,
    fpo.capacity,
    fpo.min_capacity,
    fpo.is_reservable,
    fpo.is_combinable,
    fpo.is_visible,
    fpo.is_active,
    fpo.section_id,
    fpo.zone_name,
    fpo.default_turn_time,
    fpo.label_override,
    fpo.color_override,
    fpo.created_at,
    fpo.updated_at,
    ts.id AS session_id,
    COALESCE(ts.status::TEXT, 'available') AS session_status,
    ts.session_number,
    ts.party_size,
    ts.guest_name,
    ts.order_id,
    ts.server_staff_id,
    COALESCE(ts.is_vip, false) AS is_vip,
    COALESCE(ts.needs_attention, false) AS needs_attention,
    COALESCE(ts.current_course, 1) AS current_course,
    ts.seated_at,
    ts.reservation_id,
    ts.waitlist_id,
    (
      SELECT ARRAY_AGG(tst2.table_id ORDER BY tst2.seated_position)
      FROM table_session_tables tst2
      WHERE tst2.session_id = ts.id
      AND tst2.is_active = true
    ) AS merged_tables
  FROM floor_plan_objects fpo
  LEFT JOIN table_session_tables tst
    ON tst.table_id = fpo.id
    AND tst.is_active = true
  LEFT JOIN table_sessions ts
    ON ts.id = tst.session_id
    AND ts.is_active = true
    AND ts.status NOT IN ('cleaning')
  WHERE fpo.floor_plan_id = p_floor_plan_id
    AND fpo.is_active = true
  ORDER BY fpo.z_index, fpo.name;
END;
$$;
