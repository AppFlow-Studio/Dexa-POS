#!/usr/bin/env bash
#
# Kitchen-status literal discipline check (K8 hardening)
#
# Bans bare `kitchen_status ... "sent"` literals in the OPERATIONAL files where
# a workflow-mode decision is made. The one source of truth for "what counts as
# sent" is lib/kitchenStatusUtils.ts (getKitchenSentStatus). A bare literal here
# makes 2-step and 3-step behaviour diverge (see K8).
#
# Allowlisting: wrap a legitimate region (set-membership, explicit-status
# applier) with:
#   // kds-status-allow: <reason>
#   ... code ...
#   // kds-status-allow-end
#
# Display-only code (components, the KDS board store) is not watched — it never
# decides what a send means.
#
# Exit codes:
#   0  — clean
#   1  — bare kitchen_status 'sent' literal in a watched file
#
# Usage: bash scripts/check-kitchen-status-literals.sh
#        npm run check:kitchen-status   # wired in package.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Files where a send/status decision is made. Components and the KDS board
# store are display-only and intentionally excluded.
WATCHED=(
  "stores/useOrderStore.ts"
  "stores/useTableSessionStore.ts"
  "services/preAuthService.ts"
  "services/sessionEffects/sendToKitchenEffect.ts"
  "services/offlineSyncInit.ts"
)

# Match `kitchen_status` followed by any comparison/assignment to 'sent'
PATTERN='kitchen_status[[:space:]]*\(===\|==\|!==\|=\|:\)[[:space:]]*["'"'"']sent["'"'"']'

violations=0

for file in "${WATCHED[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file not found"
    continue
  fi
  in_allow=0
  lineno=0
  while IFS= read -r line; do
    lineno=$((lineno + 1))

    if [[ "$line" == *"kds-status-allow-end"* ]]; then
      in_allow=0
      continue
    fi
    if [[ "$line" == *"kds-status-allow:"* ]]; then
      in_allow=1
      continue
    fi
    if [[ $in_allow -eq 1 ]]; then
      continue
    fi

    # Skip comment lines (prose mentioning the literal is not a decision).
    trimmed="${line#"${line%%[![:space:]]*}"}"
    if [[ "$trimmed" == //* || "$trimmed" == '*'* ]]; then
      continue
    fi

    if [[ "$line" =~ $PATTERN ]]; then
      echo "VIOLATION: $file:$lineno — bare kitchen_status 'sent' literal"
      echo "    Use getKitchenSentStatus() from lib/kitchenStatusUtils.ts."
      echo "    Or wrap in an allow region:   // kds-status-allow: <reason>"
      violations=$((violations + 1))
    fi
  done < "$file"
done

echo ""
if [[ $violations -gt 0 ]]; then
  echo "FAIL: $violations kitchen-status literal violation(s) in watched files."
  exit 1
fi
echo "PASS: no bare kitchen_status 'sent' literals in watched files."
exit 0
