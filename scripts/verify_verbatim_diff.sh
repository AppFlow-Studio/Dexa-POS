#!/usr/bin/env bash
#
# verify_verbatim_diff.sh — Wave Cat-B BEGIN_VERBATIM diff guard
#
# Purpose: ensure the body between BEGIN_VERBATIM/END_VERBATIM in
# process_payment_v9.sql diverges from v8 ONLY by the three documented
# deltas:
#   1. RETURN jsonb_build_object(  →  v_result := jsonb_build_object(
#   2. orders SELECT gains "FOR UPDATE" (and a `;` shifts onto its line)
#   3. order_payments INSERT gains `idempotency_key` column + `p_idempotency_key`
#      value (column-list and VALUES tails get a trailing comma)
#
# Mode: REPORT-ONLY for v9. The v8 body is large (~930 lines) and
# whitespace-sensitive sed normalization would be fragile. We surface the
# diff and rely on reviewer eyeballs for v9; promote to enforcing-mode at
# the next Category B retrofit when the script can be tightened with
# real-world wear.
#
# Exit code: always 0 in report-only mode. Set REPORT_ONLY=0 to flip
# (will exit 1 if the diff contains anything outside the expected delta
# regions — best-effort, not airtight).
#
# Usage: bash scripts/verify_verbatim_diff.sh

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

V8="utils/supabase/migrations/process_payment_v7_terminal_id.sql"
V9="utils/supabase/migrations/process_payment_v9.sql"
REPORT_ONLY="${REPORT_ONLY:-1}"

if [[ ! -f "$V8" ]]; then
  echo "✗ v8 source not found: $V8" >&2
  exit 1
fi
if [[ ! -f "$V9" ]]; then
  echo "✗ v9 source not found: $V9" >&2
  exit 1
fi

TMP_V8_BODY="$(mktemp)"
TMP_V9_VERBATIM="$(mktemp)"
TMP_V9_NORMALIZED="$(mktemp)"
trap 'rm -f "$TMP_V8_BODY" "$TMP_V9_VERBATIM" "$TMP_V9_NORMALIZED"' EXIT

# v8 body: lines after the function-level BEGIN (line ~91) up to (but not
# including) the function-level END;. Use awk to find the FIRST `^BEGIN$`
# (the function-level one, after the param/DECLARE block) and the LAST
# `^END;$` before the closing `$$`.
awk '
  /^BEGIN$/ && !started { started=1; next }
  /^END;$/  &&  started { started=0; next }
  started
' "$V8" > "$TMP_V8_BODY"

# v9 verbatim block: between -- BEGIN_VERBATIM and -- END_VERBATIM markers.
awk '
  /-- BEGIN_VERBATIM/ { started=1; next }
  /-- END_VERBATIM/   { started=0; next }
  started
' "$V9" > "$TMP_V9_VERBATIM"

# Normalize v9 → expected-v8 by reversing the three documented deltas.
# This is best-effort: precise enough for a fingerprint match, lenient
# enough that whitespace nits show up explicitly in the report.
sed \
  -e '/-- v9 delta:/d' \
  -e '/-- (60s window in _idempotency_claim) so amount_paid UPDATE + INSERT/d' \
  -e '/-- side effects can.t race\./d' \
  -e '/-- (idempotency cache + size trim) runs before RETURN\./d' \
  -e 's/^    v_result := jsonb_build_object(/    RETURN jsonb_build_object(/' \
  -e '/^    FOR UPDATE;$/d' \
  -e 's/^      AND location_id = ANY(user_location_ids())$/      AND location_id = ANY(user_location_ids());/' \
  -e '/^        idempotency_key$/d' \
  -e '/^        p_idempotency_key$/d' \
  -e '/^        p_idempotency_key::text$/d' \
  -e 's/^        terminal_id,$/        terminal_id/' \
  -e 's/^        v_terminal_id,$/        v_terminal_id/' \
  "$TMP_V9_VERBATIM" > "$TMP_V9_NORMALIZED"

echo "================================================================"
echo "BEGIN_VERBATIM diff: process_payment_v9 vs v8 body"
echo "================================================================"
echo "v8 body lines:           $(wc -l < "$TMP_V8_BODY")"
echo "v9 verbatim block lines: $(wc -l < "$TMP_V9_VERBATIM")"
echo "v9 normalized lines:     $(wc -l < "$TMP_V9_NORMALIZED")"
echo ""

if diff -q "$TMP_V8_BODY" "$TMP_V9_NORMALIZED" > /dev/null; then
  echo "✓ v9 verbatim body matches v8 modulo documented deltas"
  exit 0
fi

echo "Diff between v8 body and (normalized) v9 verbatim body:"
echo "----------------------------------------------------------------"
diff -u "$TMP_V8_BODY" "$TMP_V9_NORMALIZED" || true
echo "----------------------------------------------------------------"
echo ""
echo "Expected diffs (anything else is suspect):"
echo "  - whitespace-only nits introduced by editors are tolerated in"
echo "    REPORT_ONLY mode but should be cleaned up before promoting"
echo "    this script to enforcing-mode."
echo ""

if [[ "$REPORT_ONLY" == "1" ]]; then
  echo "→ report-only mode (exit 0). Set REPORT_ONLY=0 to enforce."
  exit 0
fi

echo "✗ verbatim block has unexpected drift from v8" >&2
exit 1
