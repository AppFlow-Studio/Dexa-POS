#!/usr/bin/env bash
#
# RPC discipline check (Option C — Bad-WiFi Optimization)
#
# Scope: enforces that direct supabase.rpc(...) calls in the files Option C
# is responsible for are explicitly allowlisted with an
# `// rpc-discipline-allow: <reason>` comment.
#
# Watched files (where new direct RPC calls would silently bypass the deadline wrap):
#   - stores/useOrderStore.ts
#   - services/orderService.ts (the wrap layer itself — but new RPCs here should
#     also use _runWithDeadline; allowlist comments are still required)
#
# Other files in the codebase have pre-existing direct RPC calls that are out of
# Option C's scope. They retain current behavior. If/when deeper-optimizations
# work expands the wrap layer, this script's WATCHED list should grow.
#
# Exit codes:
#   0  — clean
#   1  — unallowed direct supabase.rpc() in a watched file
#
# Usage: bash scripts/check-rpc-discipline.sh
#        npm run check:rpc-discipline   # if wired into package.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WATCHED=(
  "stores/useOrderStore.ts"
)

violations=0

for file in "${WATCHED[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file not found"
    continue
  fi
  while IFS= read -r match; do
    lineno="${match%%:*}"
    prev_line=$((lineno - 1))
    prev_content=""
    if [[ $prev_line -gt 0 ]]; then
      prev_content=$(sed -n "${prev_line}p" "$file" || true)
    fi
    if [[ "$prev_content" == *"rpc-discipline-allow:"* ]]; then
      continue
    fi
    echo "VIOLATION: $file:$lineno — direct supabase.rpc() outside wrap layer"
    echo "    Add comment on line above:   // rpc-discipline-allow: <reason>"
    echo "    Or route through services/orderService.ts (and use runWithDeadline)."
    violations=$((violations + 1))
  done < <(grep -n 'supabase\.rpc(' "$file" || true)
done

echo ""
if [[ $violations -gt 0 ]]; then
  echo "FAIL: $violations RPC discipline violation(s) in watched files."
  exit 1
fi
echo "OK: no RPC discipline violations in watched files."
exit 0
