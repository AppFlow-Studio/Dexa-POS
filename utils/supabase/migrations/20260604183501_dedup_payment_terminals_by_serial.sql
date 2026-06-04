-- Prevent duplicate payment_terminals rows for the same physical device.
--
-- Background: the Add Castles USB wizard re-INSERTs on every run instead of
-- upserting because the client dedup query uses .maybeSingle(), which returns
-- data: null when 2+ rows already match. Once the first duplicate sneaks in,
-- every later registration compounds the problem.
--
-- This migration:
--   1. Merges existing duplicate groups (same location_id + serial_number)
--      into a single winner row, repointing all FK references first.
--   2. Adds a partial unique index that forbids future duplicates at the DB
--      level — defence in depth for the client-side dedup fix.
--
-- Winner per group: the row with is_active=true (preferred) and the most
-- recent updated_at. Other rows in the group are "losers".
--
-- FK columns referencing payment_terminals.id (verified via pg_constraint):
--   device_inventory.linked_payment_terminal_id  (no ON DELETE action)
--   kiosk_profiles.payment_terminal_id            (ON DELETE SET NULL)
--   settlement_batches.payment_terminal_id        (ON DELETE SET NULL)
--   station_devices.payment_terminal_id           (ON DELETE SET NULL)
--
-- settlement_batches collision: the wave_b1 partial unique index
-- (payment_terminal_id, merchant_id, acquirer, batch_number) WHERE batch_number IS NOT NULL
-- forbids two rows for the same terminal with the same host batch_number.
-- In the duplicate-terminal world this constraint held trivially because
-- each terminal_id had its own host-keyed namespace. After we collapse the
-- duplicates, multiple historical batches that happened to recycle the same
-- TSYS batch_number (e.g. "011" recycled monthly) would collide on the
-- winner. We pick one row per (winner, merchant, acquirer, batch_number) to
-- repoint — preferring the still-open one if any, otherwise the most recent —
-- and leave the rest on the loser terminal so that the DELETE at the bottom
-- triggers ON DELETE SET NULL on those rows. They keep their batch data; only
-- the terminal link goes null. For closed/settled batches that's a small loss
-- of attribution; the totals and payments inside the batch are untouched.

CREATE TEMP TABLE _dedup_winners ON COMMIT DROP AS
WITH groups AS (
    SELECT
        location_id,
        serial_number,
        array_agg(id ORDER BY is_active DESC, updated_at DESC) AS ids
    FROM public.payment_terminals
    WHERE serial_number IS NOT NULL
    GROUP BY location_id, serial_number
    HAVING count(*) > 1
)
SELECT
    location_id,
    serial_number,
    ids[1]  AS winner_id,
    ids[2:] AS loser_ids
FROM groups;

-- 1. Repoint device_inventory (no unique constraint to worry about).
UPDATE public.device_inventory di
   SET linked_payment_terminal_id = w.winner_id
  FROM _dedup_winners w
 WHERE di.linked_payment_terminal_id = ANY(w.loser_ids);

-- 2. Repoint kiosk_profiles (no unique constraint to worry about).
UPDATE public.kiosk_profiles kp
   SET payment_terminal_id = w.winner_id
  FROM _dedup_winners w
 WHERE kp.payment_terminal_id = ANY(w.loser_ids);

-- 3. Repoint station_devices (no unique constraint to worry about).
UPDATE public.station_devices sd
   SET payment_terminal_id = w.winner_id
  FROM _dedup_winners w
 WHERE sd.payment_terminal_id = ANY(w.loser_ids);

-- 4. Repoint settlement_batches with collision-awareness.
--    a) Rows with batch_number IS NULL → repoint unconditionally (partial
--       unique index excludes them).
UPDATE public.settlement_batches sb
   SET payment_terminal_id = w.winner_id
  FROM _dedup_winners w
 WHERE sb.payment_terminal_id = ANY(w.loser_ids)
   AND sb.batch_number IS NULL;

--    b) Rows with batch_number IS NOT NULL → pick one "survivor" per
--       (winner, merchant, acquirer, batch_number). Preference order:
--       open > closed/settled, then most recent business_date, then most
--       recent created_at. Skip the survivor if the winner already has a
--       row with the same host key.
WITH candidates AS (
    SELECT
        sb.id AS batch_pk,
        w.winner_id,
        sb.merchant_id,
        sb.acquirer,
        sb.batch_number,
        ROW_NUMBER() OVER (
            PARTITION BY w.winner_id, sb.merchant_id, sb.acquirer, sb.batch_number
            ORDER BY
                (sb.status = 'open') DESC,
                sb.business_date DESC NULLS LAST,
                sb.created_at DESC
        ) AS rn
    FROM public.settlement_batches sb
    JOIN _dedup_winners w ON sb.payment_terminal_id = ANY(w.loser_ids)
    WHERE sb.batch_number IS NOT NULL
)
UPDATE public.settlement_batches sb
   SET payment_terminal_id = c.winner_id
  FROM candidates c
 WHERE sb.id = c.batch_pk
   AND c.rn = 1
   AND NOT EXISTS (
       SELECT 1
         FROM public.settlement_batches existing
        WHERE existing.payment_terminal_id = c.winner_id
          AND existing.merchant_id        = c.merchant_id
          AND existing.acquirer           = c.acquirer
          AND existing.batch_number       = c.batch_number
          AND existing.batch_number IS NOT NULL
   );

-- 5. Delete the loser terminal rows. Any settlement_batches still pointing at
--    a loser (host-key conflicts we couldn't repoint) become NULL via the
--    ON DELETE SET NULL on settlement_batches.payment_terminal_id.
DELETE FROM public.payment_terminals pt
 USING _dedup_winners w
 WHERE pt.id = ANY(w.loser_ids);

-- 6. Enforce uniqueness going forward. NULL serial numbers are exempt so
--    legacy rows and Dejavoo terminals (no serial in this column) coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_terminals_location_serial
    ON public.payment_terminals (location_id, serial_number)
    WHERE serial_number IS NOT NULL;
