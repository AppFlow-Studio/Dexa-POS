-- calculate_tip_distribution_v2 RPC with staff_name support

CREATE OR REPLACE FUNCTION public.calculate_tip_distribution_v2(
  p_merchant_id UUID,
  p_location_id UUID,
  p_session_date DATE,
  p_shift_period TEXT DEFAULT NULL,
  p_calculated_by UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id       UUID;
  v_total_collected   NUMERIC;
  v_total_distributed NUMERIC;
  v_total_pooled      NUMERIC;
  v_total_tipouts     NUMERIC;
  v_pool              RECORD;
  v_rule              RECORD;
  v_role_share        RECORD;
  v_pool_total        NUMERIC;
  v_role_count        INTEGER;
  v_total_hours       NUMERIC;
  v_total_points      NUMERIC;
  v_tipout_total      NUMERIC;
  v_giver_count       INTEGER;
  v_receiver_count    INTEGER;
BEGIN

  -- Advisory lock to prevent concurrent runs for same location/date
  PERFORM pg_advisory_xact_lock(
    hashtext(p_location_id::text || p_session_date::text)
  );

  -- =========================================================
  -- STEP 1: CREATE OR RESET SESSION
  -- =========================================================
  INSERT INTO tip_distribution_sessions(
    merchant_id, location_id, session_date, shift_period
  )
  VALUES(p_merchant_id, p_location_id, p_session_date, p_shift_period)
  ON CONFLICT(location_id, session_date, shift_period)
  DO UPDATE SET updated_at = now(), status = 'draft'
  RETURNING id INTO v_session_id;

  DELETE FROM tip_distribution_details WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 2: POPULATE EMPLOYEE DATA FROM DAILY TIPS
  -- =========================================================
  INSERT INTO tip_distribution_details(
    session_id, staff_profile_id, staff_name, role_code,
    hours_worked, gross_sales,
    charged_tips, cash_tips, individual_tips_earned
  )
  SELECT
    v_session_id,
    edt.staff_profile_id,
    COALESCE(sp.display_name, sp.first_name || ' ' || sp.last_name, 'Unknown'),
    lm.role_code,
    COALESCE(edt.hours_worked, 0),
    COALESCE(edt.gross_sales, 0),
    COALESCE(edt.charged_tips, 0),
    COALESCE(edt.cash_tips_declared, 0),
    COALESCE(edt.charged_tips, 0) + COALESCE(edt.cash_tips_declared, 0)
  FROM employee_daily_tips edt
  JOIN location_members lm
    ON lm.staff_profile_id = edt.staff_profile_id
    AND lm.location_id = edt.location_id
  JOIN staff_profiles sp
    ON sp.id = edt.staff_profile_id
  WHERE edt.location_id = p_location_id
    AND edt.shift_date = p_session_date;

  -- =========================================================
  -- STEP 3: CALCULATE TOTAL COLLECTED
  -- =========================================================
  SELECT COALESCE(SUM(individual_tips_earned), 0)
  INTO v_total_collected
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 4: CREATE TEMP TABLE FOR PER‑POOL CONTRIBUTIONS
  -- =========================================================
  CREATE TEMP TABLE temp_pool_contrib (
    pool_id UUID,
    staff_profile_id UUID,
    amount NUMERIC
  ) ON COMMIT DROP;

  -- =========================================================
  -- STEP 5: PROCESS EACH ACTIVE TIP POOL – CONTRIBUTIONS
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Insert contributions into temp table (per pool)
    IF v_pool.tip_source = 'charged_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.charged_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'all_tips' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.individual_tips_earned * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);

    ELSIF v_pool.tip_source = 'cash_only' THEN
      INSERT INTO temp_pool_contrib (pool_id, staff_profile_id, amount)
      SELECT v_pool.id, dd.staff_profile_id,
             ROUND(dd.cash_tips * (v_pool.source_percentage / 100.0), 2)
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = ANY(v_pool.contributing_role_codes);
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 6: UPDATE tip_pool_contributed FROM TEMP TABLE
  -- =========================================================
  UPDATE tip_distribution_details dd
  SET tip_pool_contributed = COALESCE((
    SELECT SUM(amount) FROM temp_pool_contrib t
    WHERE t.staff_profile_id = dd.staff_profile_id
  ), 0)
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 7: REDISTRIBUTE EACH POOL (accumulate receipts)
  -- =========================================================
  FOR v_pool IN
    SELECT * FROM tip_pool_configs
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- Get total contributed to this pool from the temp table
    SELECT COALESCE(SUM(amount), 0) INTO v_pool_total
    FROM temp_pool_contrib
    WHERE pool_id = v_pool.id;

    -- Skip if nothing to distribute
    IF v_pool_total = 0 THEN
      CONTINUE;
    END IF;

    -- ----- DISTRIBUTION BY METHOD -----
    IF v_pool.distribution_method = 'percentage' THEN
      -- Percentage split by role, equally among employees of that role
      FOR v_role_share IN
        SELECT prs.role_code, prs.share_percentage
        FROM tip_pool_role_shares prs
        WHERE prs.tip_pool_config_id = v_pool.id
          AND prs.is_eligible = true
          AND prs.share_percentage IS NOT NULL
          AND prs.share_percentage > 0
      LOOP
        SELECT COUNT(*) INTO v_role_count
        FROM tip_distribution_details
        WHERE session_id = v_session_id
          AND role_code = v_role_share.role_code;

        IF v_role_count > 0 THEN
          UPDATE tip_distribution_details
          SET tip_pool_received = tip_pool_received +
            ROUND((v_pool_total * (v_role_share.share_percentage / 100.0)) / v_role_count, 2)
          WHERE session_id = v_session_id
            AND role_code = v_role_share.role_code;
        END IF;
      END LOOP;

    ELSIF v_pool.distribution_method = 'equal_split' THEN
      -- Equal split only among employees whose roles are eligible for this pool
      SELECT COUNT(*) INTO v_role_count
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_role_count > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total / v_role_count, 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'hours_weighted' THEN
      -- Hours‑weighted only for eligible roles
      SELECT COALESCE(SUM(dd.hours_worked), 0) INTO v_total_hours
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND EXISTS (
          SELECT 1 FROM tip_pool_role_shares prs
          WHERE prs.tip_pool_config_id = v_pool.id
            AND prs.role_code = dd.role_code
            AND prs.is_eligible = true
        );

      IF v_total_hours > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * (dd.hours_worked / v_total_hours), 2)
        WHERE dd.session_id = v_session_id
          AND EXISTS (
            SELECT 1 FROM tip_pool_role_shares prs
            WHERE prs.tip_pool_config_id = v_pool.id
              AND prs.role_code = dd.role_code
              AND prs.is_eligible = true
          );
      END IF;

    ELSIF v_pool.distribution_method = 'points' THEN
      -- Points‑based: role's points_per_hour * employee's hours
      SELECT COALESCE(SUM(prs.points_per_hour * dd.hours_worked), 0) INTO v_total_points
      FROM tip_distribution_details dd
      JOIN tip_pool_role_shares prs
        ON prs.tip_pool_config_id = v_pool.id
        AND prs.role_code = dd.role_code
        AND prs.is_eligible = true
      WHERE dd.session_id = v_session_id;

      IF v_total_points > 0 THEN
        UPDATE tip_distribution_details dd
        SET tip_pool_received = tip_pool_received +
          ROUND(v_pool_total * ((prs_sub.points_per_hour * dd.hours_worked) / v_total_points), 2)
        FROM tip_pool_role_shares prs_sub
        WHERE dd.session_id = v_session_id
          AND prs_sub.tip_pool_config_id = v_pool.id
          AND prs_sub.role_code = dd.role_code
          AND prs_sub.is_eligible = true;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 8: TIP‑OUT RULES (all three types)
  -- =========================================================
  FOR v_rule IN
    SELECT * FROM tip_out_rules
    WHERE location_id = p_location_id
      AND is_active = true
      AND effective_date <= p_session_date
      AND (end_date IS NULL OR end_date >= p_session_date)
  LOOP
    -- How many receivers for this rule?
    SELECT COUNT(*) INTO v_receiver_count
    FROM tip_distribution_details
    WHERE session_id = v_session_id
      AND role_code = v_rule.to_role_code;

    IF v_rule.tip_out_type = 'percentage_of_sales' THEN
      -- Deduct from givers
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Total given (for crediting receivers)
      SELECT COALESCE(SUM(ROUND(dd.gross_sales * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      -- Credit receivers equally
      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'percentage_of_tips' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given +
        ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COALESCE(SUM(ROUND(dd.individual_tips_earned * (v_rule.tip_out_value / 100.0), 2)), 0)
      INTO v_tipout_total
      FROM tip_distribution_details dd
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;

    ELSIF v_rule.tip_out_type = 'flat_amount' THEN
      UPDATE tip_distribution_details dd
      SET tip_out_given = tip_out_given + v_rule.tip_out_value
      WHERE dd.session_id = v_session_id
        AND dd.role_code = v_rule.from_role_code;

      SELECT COUNT(*) INTO v_giver_count
      FROM tip_distribution_details
      WHERE session_id = v_session_id
        AND role_code = v_rule.from_role_code;

      v_tipout_total := v_giver_count * v_rule.tip_out_value;

      IF v_receiver_count > 0 THEN
        UPDATE tip_distribution_details
        SET tip_out_received = tip_out_received +
          ROUND(v_tipout_total / v_receiver_count, 2)
        WHERE session_id = v_session_id
          AND role_code = v_rule.to_role_code;
      END IF;
    END IF;
  END LOOP;

  -- =========================================================
  -- STEP 9: CALCULATE NET TIPS FOR EACH EMPLOYEE
  -- =========================================================
  UPDATE tip_distribution_details
  SET net_tips =
    individual_tips_earned
    - tip_pool_contributed
    + tip_pool_received
    - tip_out_given
    + tip_out_received
    + manual_adjustment
  WHERE session_id = v_session_id;

  -- =========================================================
  -- STEP 10: AGGREGATE SESSION TOTALS
  -- =========================================================
  SELECT
    COALESCE(SUM(net_tips), 0),
    COALESCE(SUM(tip_pool_contributed), 0),
    COALESCE(SUM(tip_out_given), 0)
  INTO v_total_distributed, v_total_pooled, v_total_tipouts
  FROM tip_distribution_details
  WHERE session_id = v_session_id;

  UPDATE tip_distribution_sessions
  SET
    status = 'calculated',
    total_tips_collected = v_total_collected,
    total_tips_pooled = v_total_pooled,
    total_tip_outs = v_total_tipouts,
    total_distributed = v_total_distributed,
    rounding_adjustment = v_total_collected - v_total_distributed,
    calculated_at = now(),
    calculated_by = p_calculated_by
  WHERE id = v_session_id;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'total_collected', v_total_collected,
    'total_distributed', v_total_distributed,
    'total_tips_pooled', v_total_pooled,
    'total_tip_outs', v_total_tipouts,
    'details', (
      SELECT json_agg(
        json_build_object(
          'id', id,
          'staff_profile_id', staff_profile_id,
          'staff_name', staff_name,
          'role_code', role_code,
          'gross_sales', gross_sales,
          'charged_tips', charged_tips,
          'cash_tips', cash_tips,
          'individual_tips_earned', individual_tips_earned,
          'tip_pool_contributed', tip_pool_contributed,
          'tip_pool_received', tip_pool_received,
          'tip_out_given', tip_out_given,
          'tip_out_received', tip_out_received,
          'manual_adjustment', manual_adjustment,
          'net_tips', net_tips,
          'hours_worked', hours_worked
        )
      )
      FROM tip_distribution_details
      WHERE session_id = v_session_id
    )
  );

END;
$$;
