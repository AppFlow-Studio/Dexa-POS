# Tip Pooling & Distribution - Complete Guide

## Overview

Dexa POS includes a full-featured tip pooling and distribution system at no extra cost. It solves common problems that other POS systems charge add-on fees for:

**The Problem:** Two bartenders share a bar but alternate who rings up orders. All credit card tips get attributed to whoever rang them in, forcing Venmo payments and unfair tax burdens.

**The Solution:** Configure a tip pool once on the Dexa website. At end-of-day, the manager runs a 4-step wizard on the POS tablet. The system pools credit card tips and distributes them fairly — by equal split, hours worked, percentage, or points. Each employee's net tips are correctly attributed for payroll. No workarounds, no add-ons.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Tip Pool** | A named configuration that collects a percentage of tips from contributing roles and redistributes to eligible roles |
| **Tip-Out Rule** | A directional rule where one role gives a portion of tips/sales to another role |
| **Distribution Session** | A single EOD close-out run that calculates and approves tip distribution for a date |
| **Distribution Method** | How pooled tips are divided: equal split, hours-weighted, percentage by role, or points |

## Architecture

```
DEXA WEBSITE (Configuration)              POS TABLET (Runtime)
+----------------------------+            +------------------------------------+
| Tip Pool Configs           |            | useTipDistributionStore            |
|   - distribution method    |            |   - Reads config (read-only)       |
|   - tip source             |  Supabase  |   - Manages wizard state           |
|   - source percentage      | ---------> |   - Cash tip declarations          |
|   - contributing roles     |    Sync    |   - Manual adjustments             |
|                            |            |                                    |
| Tip-Out Rules              |            | TipDistributionWizard              |
|   - from/to roles          |            |   - 4-step EOD flow                |
|   - type & value           |            |   - Preview & approve              |
|                            |            |                                    |
| Tip Pool Role Shares       |            | EodStepTips                        |
|   - role eligibility       |            |   - EOD integration                |
|   - share percentages      |            |                                    |
+----------------------------+            +------------------------------------+
             |                                          |
             v                                          v
+----------------------------+            +------------------------------------+
|      Supabase Database     |            | Supabase RPCs                      |
|      (Source of Truth)     | <--------- |   preview_tip_distribution         |
|                            |            |   calculate_tip_distribution_v2    |
|  tip_pool_configs          |            |   approve_tip_distribution         |
|  tip_pool_role_shares      |            |   rebuild_employee_daily_tips      |
|  tip_out_rules             |            +------------------------------------+
|  tip_distribution_sessions |
|  tip_distribution_details  |
|  employee_daily_tips       |
+----------------------------+
```

**Key architectural decision:** Tip pool configs, tip-out rules, and role shares are managed on the Dexa website (merchant dashboard), NOT the POS tablet. The POS app reads these configs and only handles the EOD distribution workflow.

## Database Tables

### tip_pool_configs

Pool definitions — how tips are collected and redistributed.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | text | Pool name (e.g., "Bar Tip Pool") |
| `description` | text | Optional description |
| `distribution_method` | text | `equal_split`, `hours_weighted`, `percentage`, `points` |
| `tip_source` | text | `charged_tips`, `all_tips`, `cash_only` |
| `source_percentage` | numeric | % of source tips that go into pool (0-100) |
| `contributing_role_codes` | text[] | Roles whose tips are pooled (e.g., `['merchant.bartender']`) |
| `is_active` | boolean | Enable/disable |
| `effective_date` | date | When rule takes effect |
| `end_date` | date | Optional expiration |

### tip_pool_role_shares

Which roles receive from each pool, and how much.

| Column | Type | Description |
|--------|------|-------------|
| `tip_pool_config_id` | UUID | FK to tip_pool_configs |
| `role_code` | text | Role (e.g., `merchant.bartender`) |
| `share_percentage` | numeric | % of pool for this role (for `percentage` method) |
| `points_per_hour` | numeric | Points weight (for `points` method) |
| `is_eligible` | boolean | Whether this role participates in distribution |

### tip_out_rules

Directional rules: one role gives a portion to another.

| Column | Type | Description |
|--------|------|-------------|
| `from_role_code` | text | Role that gives |
| `to_role_code` | text | Role that receives |
| `tip_out_type` | text | `percentage_of_tips`, `percentage_of_sales`, `flat_amount` |
| `tip_out_value` | numeric | The percentage or flat dollar amount |
| `is_active` | boolean | Enable/disable |
| `effective_date` / `end_date` | date | Validity window |

### tip_distribution_sessions

One row per EOD close-out run.

| Column | Type | Description |
|--------|------|-------------|
| `session_date` | date | Business date |
| `shift_period` | text | `full_day`, `lunch`, `dinner`, `custom` |
| `status` | text | `draft` → `preview` → `calculated` → `approved` → `exported` / `voided` |
| `sequence_number` | int | Multiple sessions per day (Session #1, #2, ...) |
| `total_tips_collected` | numeric | Sum of all individual tips |
| `total_tips_pooled` | numeric | Sum of pool contributions |
| `total_tip_outs` | numeric | Sum of tip-out given amounts |
| `total_distributed` | numeric | Sum of all net tips |
| `rounding_adjustment` | numeric | `collected - distributed` (penny correction) |
| `calculated_by` / `approved_by` | UUID | Audit trail |

### tip_distribution_details

Per-employee row within a session — the core breakdown.

| Column | Type | Description |
|--------|------|-------------|
| `staff_profile_id` | UUID | Employee |
| `staff_name` | text | Display name |
| `role_code` | text | Employee's role |
| `hours_worked` | numeric | Shift hours (minus unpaid breaks — FLSA compliant) |
| `gross_sales` | numeric | Total sales for this employee |
| `charged_tips` | numeric | Credit/debit card tips |
| `cash_tips` | numeric | Declared cash tips |
| `individual_tips_earned` | numeric | `charged_tips + cash_tips` |
| `tip_pool_contributed` | numeric | Amount given to pools |
| `tip_pool_received` | numeric | Amount received from pools |
| `tip_out_given` | numeric | Amount tipped out to other roles |
| `tip_out_received` | numeric | Amount received from tip-outs |
| `manual_adjustment` | numeric | Manager override (+/-) |
| `net_tips` | numeric | Final calculated tips for payroll |

### employee_daily_tips

Aggregated daily data from shifts and payments — input to the distribution calculation.

| Column | Type | Description |
|--------|------|-------------|
| `staff_profile_id` | UUID | Employee |
| `shift_date` | date | Business date |
| `charged_tips` | numeric | Sum of card tips from payments |
| `cash_tips_declared` | numeric | Cash declared at clock-out |
| `gross_sales` | numeric | Total sales attributed |
| `hours_worked` | numeric | Shift hours minus unpaid breaks |
| `is_verified` | boolean | Lock flag |

## Distribution Methods

| Method | How It Works | Best For |
|--------|-------------|----------|
| `equal_split` | Pool total / count of eligible employees | Two bartenders sharing a bar evenly |
| `hours_weighted` | Pool total * (employee hours / total hours) | Fair split when shift lengths differ |
| `percentage` | Pool split by role share %, then equally within role | FOH 70% / BOH 30% split |
| `points` | Pool * (role points_per_hour * hours) / total points | Complex multi-role weighting |

### Worked Example: Equal Split

Two bartenders, Alice and Bob. Alice rang up $500 in sales with $100 in card tips. Bob rang up $300 with $60 in card tips.

Pool config: `equal_split`, `charged_tips`, 100%.

```
Pool total = $100 + $60 = $160
Each gets = $160 / 2 = $80

Alice: earned $100, contributed $100, received $80 → net $80
Bob:   earned $60,  contributed $60,  received $80 → net $80
```

Both get $80 regardless of who rang what.

### Worked Example: Hours-Weighted

Same scenario, but Alice worked 8 hours, Bob worked 4 hours.

```
Pool total = $160, Total hours = 12

Alice: $160 * (8 / 12) = $106.67
Bob:   $160 * (4 / 12) = $53.33
```

Alice gets more because she worked longer.

### Worked Example: Percentage by Role

3 servers (70% share) and 2 bussers (30% share). Pool = $500.

```
Server pool: $500 * 70% = $350 / 3 servers = $116.67 each
Busser pool: $500 * 30% = $150 / 2 bussers = $75.00 each
```

## Tip Sources

| Source | What Goes Into Pool |
|--------|-------------------|
| `charged_tips` | Only credit/debit card tips |
| `all_tips` | Card tips + declared cash tips |
| `cash_only` | Only declared cash tips |

The `source_percentage` field (0-100) controls how much of the source is pooled. Set to 100 to pool everything, or 20 to pool only 20% (keeping 80% individual).

## Tip-Out Rules

Tip-outs are directional: `from_role` gives to `to_role`. The total given by all "from" employees is split equally among "to" employees.

| Type | Formula | Example |
|------|---------|---------|
| `percentage_of_tips` | `individual_tips * (value / 100)` | Bartenders tip out 10% of tips to bussers |
| `percentage_of_sales` | `gross_sales * (value / 100)` | Servers tip out 3% of sales to kitchen |
| `flat_amount` | `value` per employee | Each server tips out $5 flat to host |

**Example: 3% of sales tip-out**

Server sold $500, earned $100 in tips. Tip-out rule: 3% of sales to busser.

```
Tip-out given = $500 * 3% = $15
Server net = $100 - $15 = $85
Busser receives = $15 (split among all bussers)
```

## EOD Wizard Flow

```
Step 1: DECLARE            Step 2: PREVIEW           Step 3: REVIEW            Step 4: APPROVE
+--------------------+     +--------------------+    +--------------------+    +--------------------+
| Enter cash tips    |     | Dry-run RPC call   |    | Table view:        |    | Final calculation  |
| per employee       | --> | (no DB writes)     | -> | Employee | Role    | -> | written to DB      |
|                    |     |                    |    | Hours | Tips       |    |                    |
| Card tips auto-    |     | rebuild_employee_  |    | Pool In/Out        |    | Session approved   |
| populated from     |     | daily_tips called  |    | Net Tips           |    | with audit trail   |
| payment records    |     | internally         |    |                    |    |                    |
+--------------------+     +--------------------+    | Manual adjustments |    | Ready for payroll  |
                                                     | supported (+/-)    |    | export             |
                                                     +--------------------+    +--------------------+
```

### Step Details

1. **Declare** — Manager enters each employee's cash tips via numpad. Card tips are auto-populated from captured payments. Shows card + cash totals per employee.

2. **Preview** — System calls `preview_tip_distribution` RPC (a dry-run in a rolled-back subtransaction). Internally calls `rebuild_employee_daily_tips` to aggregate shift data. No writes to DB.

3. **Review** — Displays a table with each employee's breakdown: individual tips, pool contributions/receipts, tip-outs, and net tips. Manager can apply manual adjustments (+/-) via numpad.

4. **Approve** — Calls `calculate_tip_distribution_v2` (writes to DB), then `approve_tip_distribution`. Session is marked approved with timestamp and approver ID. Ready for payroll export.

### Multi-Session Support

Multiple close-outs per day are supported (e.g., lunch and dinner shifts). Each session has a `sequence_number` and optional `data_start_after`/`data_cutoff_at` time windows to prevent double-counting tips across sessions.

## Net Tips Formula

```
net_tips = individual_tips_earned
         - tip_pool_contributed
         + tip_pool_received
         - tip_out_given
         + tip_out_received
         + manual_adjustment
```

### Walkthrough: Bartender with Pool + Tip-Out

Alice: $100 charged tips, $500 sales. Pool: 100% equal split with Bob. Tip-out: 3% of sales to busser.

```
individual_tips_earned  =  100.00
- tip_pool_contributed  = -100.00   (100% of charged tips)
+ tip_pool_received     = + 80.00   ($160 pool / 2 bartenders)
- tip_out_given         = - 15.00   ($500 * 3%)
+ tip_out_received      = +  0.00
+ manual_adjustment     = +  0.00
                          --------
net_tips                =   65.00
```

## SQL Engine: calculate_tip_distribution_v2

The core distribution logic runs as a PostgreSQL RPC with 10 steps:

1. **Advisory lock** — Prevents concurrent runs for the same location/date
2. **Create/reset session** — Inserts or resets a `tip_distribution_sessions` row
3. **Populate employee data** — Joins `employee_daily_tips` with `staff_profiles` and `location_members`
4. **Calculate total collected** — Sum of all `individual_tips_earned`
5. **Create temp table** — For tracking per-pool contributions
6. **Process pool contributions** — For each active pool, calculates contribution per employee based on `tip_source` and `source_percentage`
7. **Update contributed totals** — Sums all pool contributions per employee
8. **Redistribute pools** — For each pool, distributes to eligible roles using the configured method (equal_split, hours_weighted, percentage, or points)
9. **Process tip-out rules** — Applies all three rule types (percentage_of_tips, percentage_of_sales, flat_amount)
10. **Calculate net tips** — Applies the net tips formula and aggregates session totals

The `rebuild_employee_daily_tips_v2` RPC (called during preview) aggregates shift data with FLSA-compliant break exclusion — `hours_worked` equals actual shift hours minus unpaid break duration.

## Key Files

### Components
- `components/tip-distribution/TipDistributionWizard.tsx` — 4-step EOD wizard
- `components/settings/end-of-day/steps/EodStepTips.tsx` — EOD step integration
- `app/(main)/settings/tip-settings.tsx` — Tip settings screen (presets, behavior toggles, active rules display)

### Store
- `stores/useTipDistributionStore.ts` — Zustand store with Immer middleware, manages config, sessions, wizard state, declarations

### Services
- `services/tipDistributionService.ts` — CRUD operations for tip pools and rules
- `services/tipAdjustService.ts` — Post-capture tip adjustment via `adjust_tips` RPC
- `services/cashTipDeclarationService.ts` — Cash tip declaration workflow
- `services/endOfDayService.ts` — `fetchTipDistributionRulesOverview()`, `fetchUnsettledTipSummary()`, `fetchTodaySessions()`

### Utilities
- `utils/computeEmployeeTipData.ts` — Offline tip computation from local order store
- `utils/money.ts` — `round2()` with PostgreSQL-compatible HALF_UP rounding

### SQL Migrations
- `utils/supabase/migrations/calculate_tip_distribution_v2.sql` — Core distribution RPC
- `utils/supabase/migrations/rebuild_employee_daily_tips_v2_break_exclusion.sql` — Daily tips aggregation with break exclusion
- `utils/supabase/migrations/adjust_tips.sql` — Post-capture tip adjustment RPC

### Types
- `database.types.ts` — Auto-generated Supabase types (all tip tables)

### Tests
- `__tests__/tip-distribution.test.ts` — 49 tests covering store, formula, scenarios, and edge cases

## Real-World Setup Examples

### 1. The Bartender Split

Two bartenders share a bar, alternating who rings up orders.

**Pool Config:**
- Name: "Bar Tip Pool"
- Distribution method: `equal_split`
- Tip source: `charged_tips`
- Source percentage: `100`
- Contributing roles: `['merchant.bartender']`

**Role Shares:**
- `merchant.bartender` — `is_eligible: true`

**Result:** Both bartenders get equal credit card tips regardless of who rang orders. Ready for payroll — no Venmo, no tax inequity.

### 2. Full-Service Restaurant

Servers pool tips and tip out to support staff.

**Pool Config:**
- Name: "Server Pool"
- Distribution method: `hours_weighted`
- Tip source: `all_tips`
- Source percentage: `100`
- Contributing roles: `['merchant.server']`

**Role Shares:**
- `merchant.server` — `is_eligible: true`

**Tip-Out Rules:**
- Servers → Bussers: 3% of sales (`percentage_of_sales`, value: 3)
- Servers → Bartenders: 1% of sales (`percentage_of_sales`, value: 1)

**Result:** Server tips are pooled proportional to hours worked. 3% of each server's sales goes to bussers, 1% to bartenders.

### 3. Points-Based Kitchen Inclusion

Restaurant pools a portion of tips for BOH staff using a points system.

**Pool Config:**
- Name: "Kitchen Share"
- Distribution method: `points`
- Tip source: `charged_tips`
- Source percentage: `20` (only 20% of charged tips pooled)
- Contributing roles: `['merchant.server']`

**Role Shares:**
- `merchant.server` — `points_per_hour: 1.0`, `is_eligible: true`
- `merchant.cook` — `points_per_hour: 0.5`, `is_eligible: true`
- `merchant.dishwasher` — `points_per_hour: 0.25`, `is_eligible: true`

**Result:** 20% of charged tips go to the pool. A cook working 8 hours earns 4 points; a server working 6 hours earns 6 points. Pool is split proportional to total points.

## Related Documentation

- [Payment Processing](PAYMENT_PROCESSING.md) — How tips are captured during payment
- [Orders Lifecycle](ORDERS_LIFECYCLE.md) — Order states and payment flow
- [State Management](STATE_MANAGEMENT.md) — Zustand store patterns used by tip distribution store
