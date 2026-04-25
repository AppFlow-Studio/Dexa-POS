/**
 * Tip Distribution Tests
 *
 * Tests the tip distribution store, net tips formula, computeEmployeeTipData
 * utility, and validates mock scenarios matching SQL distribution logic.
 *
 * NOTE: The actual distribution math runs in the SQL RPC
 * `calculate_tip_distribution_v2`. These tests validate the TypeScript store
 * layer, the net tips formula used in `updateDetailAdjustment`, and the
 * offline tip computation utility.
 */

import {
  TipDistributionDetail,
  TipDistributionSession,
  TipPoolConfig,
  TipPoolRoleShare,
  TipOutRule,
  useTipDistributionStore,
} from "@/stores/useTipDistributionStore";
import {
  computeEmployeeTipData,
  EmployeeTipSummary,
} from "@/utils/computeEmployeeTipData";
import { round2 } from "@/utils/money";
import { OrderProfile, OrderProfilePayment } from "@/lib/types";

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockDistributionDetail = (
  overrides: Partial<TipDistributionDetail> = {}
): TipDistributionDetail => ({
  id: `detail_${Math.random().toString(36).slice(2)}`,
  sessionId: "session_1",
  staffProfileId: `staff_${Math.random().toString(36).slice(2)}`,
  staffName: "Test Employee",
  roleCode: "merchant.bartender",
  grossSales: 0,
  cashTips: 0,
  chargedTips: 0,
  individualTipsEarned: 0,
  tipOutGiven: 0,
  tipOutReceived: 0,
  tipPoolContributed: 0,
  tipPoolReceived: 0,
  manualAdjustment: 0,
  netTips: 0,
  hoursWorked: 0,
  ...overrides,
});

const createMockSession = (
  overrides: Partial<TipDistributionSession> = {},
  details: TipDistributionDetail[] = []
): TipDistributionSession => ({
  id: "session_1",
  locationId: "loc_1",
  sessionDate: "2026-04-24",
  status: "calculated",
  sequenceNumber: 1,
  dataStartAfter: null,
  dataCutoffAt: null,
  totalTipsCollected: 0,
  totalTipsPooled: 0,
  totalTipOuts: 0,
  totalDistributed: 0,
  roundingAdjustment: 0,
  details,
  ...overrides,
});

const createMockTipPoolConfig = (
  overrides: Partial<TipPoolConfig> = {}
): TipPoolConfig => ({
  id: `pool_${Math.random().toString(36).slice(2)}`,
  name: "Bar Tip Pool",
  distributionMethod: "equal_split",
  tipSource: "charged_tips",
  sourcePercentage: 100,
  contributingRoleCodes: ["merchant.bartender"],
  isActive: true,
  effectiveDate: "2026-01-01",
  ...overrides,
});

const createMockTipOutRule = (
  overrides: Partial<TipOutRule> = {}
): TipOutRule => ({
  id: `rule_${Math.random().toString(36).slice(2)}`,
  fromRoleCode: "merchant.bartender",
  toRoleCode: "merchant.busser",
  tipOutType: "percentage_of_sales",
  tipOutValue: 3,
  isActive: true,
  effectiveDate: "2026-01-01",
  ...overrides,
});

const createMockOrder = (
  overrides: Partial<OrderProfile> = {}
): OrderProfile => ({
  id: `order_${Math.random().toString(36).slice(2)}`,
  service_location_id: null,
  order_status: "completed",
  check_status: "Closed",
  paid_status: "Paid",
  items: [],
  opened_at: "2026-04-24T10:00:00Z",
  payments: [],
  ...overrides,
});

const createMockPayment = (
  overrides: Partial<OrderProfilePayment> = {}
): OrderProfilePayment => ({
  id: `pay_${Math.random().toString(36).slice(2)}`,
  amount: 50,
  method: "Card",
  tip_amount: 10,
  total_collected: 60,
  itemsCovered: [],
  status: "captured",
  timestamp: "2026-04-24T22:00:00Z",
  ...overrides,
});

// ============================================================================
// HELPERS
// ============================================================================

/** Reset store to defaults before each test */
const resetStore = () => {
  const store = useTipDistributionStore.getState();
  store.reset();
};

// ============================================================================
// Scenario 1: Store Initialization
// ============================================================================

describe("Scenario 1: Store Initialization", () => {
  beforeEach(resetStore);

  it("initializes with empty config arrays", () => {
    const state = useTipDistributionStore.getState();
    expect(state.tipOutRules).toEqual([]);
    expect(state.tipPoolConfigs).toEqual([]);
    expect(state.tipPoolRoleShares).toEqual([]);
  });

  it("initializes with null session and declare step", () => {
    const state = useTipDistributionStore.getState();
    expect(state.currentSession).toBeNull();
    expect(state.wizardStep).toBe("declare");
  });

  it("initializes with empty declarations", () => {
    const state = useTipDistributionStore.getState();
    expect(state.cashTipDeclarations).toEqual({});
  });

  it("initializes with no errors", () => {
    const state = useTipDistributionStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isCalculating).toBe(false);
    expect(state.error).toBeNull();
  });
});

// ============================================================================
// Scenario 2: Cash Tip Declarations
// ============================================================================

describe("Scenario 2: Cash Tip Declarations", () => {
  beforeEach(resetStore);

  it("sets cash tip for a staff member", () => {
    useTipDistributionStore.getState().declareCashTips("staff_alice", 25);
    const state = useTipDistributionStore.getState();
    expect(state.cashTipDeclarations["staff_alice"]).toBe(25);
  });

  it("sets _wizardSessionDate on first declaration", () => {
    const today = new Date().toISOString().split("T")[0];
    useTipDistributionStore.getState().declareCashTips("staff_alice", 25);
    const state = useTipDistributionStore.getState();
    expect(state._wizardSessionDate).toBe(today);
  });

  it("supports multiple staff declarations", () => {
    const store = useTipDistributionStore.getState();
    store.declareCashTips("staff_alice", 25);
    store.declareCashTips("staff_bob", 40);
    const state = useTipDistributionStore.getState();
    expect(state.cashTipDeclarations["staff_alice"]).toBe(25);
    expect(state.cashTipDeclarations["staff_bob"]).toBe(40);
  });

  it("overwrites existing declaration for same staff", () => {
    const store = useTipDistributionStore.getState();
    store.declareCashTips("staff_alice", 25);
    store.declareCashTips("staff_alice", 50);
    const state = useTipDistributionStore.getState();
    expect(state.cashTipDeclarations["staff_alice"]).toBe(50);
  });

  it("clearDeclarations empties all declarations", () => {
    const store = useTipDistributionStore.getState();
    store.declareCashTips("staff_alice", 25);
    store.declareCashTips("staff_bob", 40);
    store.clearDeclarations();
    const state = useTipDistributionStore.getState();
    expect(state.cashTipDeclarations).toEqual({});
  });
});

// ============================================================================
// Scenario 3: Net Tips Formula (updateDetailAdjustment)
// ============================================================================

describe("Scenario 3: Net Tips Formula", () => {
  beforeEach(resetStore);

  /**
   * The formula in updateDetailAdjustment (store lines 213-219):
   *   net = individualTipsEarned
   *       - tipOutGiven + tipOutReceived
   *       - tipPoolContributed + tipPoolReceived
   *       + manualAdjustment
   */

  it("no adjustment: net equals individual tips earned", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      netTips: 100,
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("d1", 0);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    expect(updated.netTips).toBe(100);
    expect(updated.manualAdjustment).toBe(0);
  });

  it("with pool: contributes and receives", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      tipPoolContributed: 100,
      tipPoolReceived: 80,
      netTips: 80,
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("d1", 0);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    // 100 - 100 + 80 = 80
    expect(updated.netTips).toBe(80);
  });

  it("with tip-outs: gives and receives", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      tipOutGiven: 15,
      tipOutReceived: 0,
      netTips: 85,
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("d1", 0);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    // 100 - 15 + 0 = 85
    expect(updated.netTips).toBe(85);
  });

  it("combined: pool + tip-outs + manual adjustment", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      tipPoolContributed: 100,
      tipPoolReceived: 80,
      tipOutGiven: 10,
      tipOutReceived: 5,
      netTips: 0, // will be recalculated
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("d1", 3);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    // 100 - 100 + 80 - 10 + 5 + 3 = 78
    expect(updated.netTips).toBe(78);
    expect(updated.manualAdjustment).toBe(3);
  });

  it("negative manual adjustment reduces net", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      netTips: 100,
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("d1", -10);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    expect(updated.netTips).toBe(90);
  });

  it("does nothing if session is null", () => {
    useTipDistributionStore.setState({ currentSession: null });
    // Should not throw
    useTipDistributionStore.getState().updateDetailAdjustment("d1", 5);
    expect(useTipDistributionStore.getState().currentSession).toBeNull();
  });

  it("does nothing if detailId not found", () => {
    const detail = createMockDistributionDetail({
      id: "d1",
      individualTipsEarned: 100,
      netTips: 100,
    });
    const session = createMockSession({}, [detail]);

    useTipDistributionStore.setState({ currentSession: session });
    useTipDistributionStore.getState().updateDetailAdjustment("nonexistent", 5);

    const updated = useTipDistributionStore.getState().currentSession!.details[0];
    expect(updated.netTips).toBe(100); // unchanged
  });
});

// ============================================================================
// Scenario 4: Wizard Step Navigation
// ============================================================================

describe("Scenario 4: Wizard Step Navigation", () => {
  beforeEach(resetStore);

  it("transitions to review step", () => {
    useTipDistributionStore.getState().setWizardStep("review");
    expect(useTipDistributionStore.getState().wizardStep).toBe("review");
  });

  it("transitions through all steps", () => {
    const steps = ["declare", "calculate", "review", "approve"] as const;
    for (const step of steps) {
      useTipDistributionStore.getState().setWizardStep(step);
      expect(useTipDistributionStore.getState().wizardStep).toBe(step);
    }
  });
});

// ============================================================================
// Scenario 5: Reset Behavior
// ============================================================================

describe("Scenario 5: Reset Behavior", () => {
  beforeEach(resetStore);

  it("reset() clears everything", () => {
    // Set up some state
    useTipDistributionStore.getState().declareCashTips("staff_1", 50);
    useTipDistributionStore.getState().setWizardStep("review");
    useTipDistributionStore.setState({
      currentSession: createMockSession(),
      previousSessions: [{ id: "s1", sequenceNumber: 1, status: "approved", totalDistributed: 100, dataStartAfter: null, dataCutoffAt: null, approvedAt: "2026-04-24" }],
      error: "some error",
    });

    useTipDistributionStore.getState().reset();
    const state = useTipDistributionStore.getState();

    expect(state.currentSession).toBeNull();
    expect(state.previousSessions).toEqual([]);
    expect(state.wizardStep).toBe("declare");
    expect(state.cashTipDeclarations).toEqual({});
    expect(state._wizardSessionDate).toBeNull();
    expect(state.isCalculating).toBe(false);
    expect(state.error).toBeNull();
  });

  it("resetForNewSession() keeps date and previous sessions", () => {
    useTipDistributionStore.getState().declareCashTips("staff_1", 50);
    useTipDistributionStore.getState().setWizardStep("review");
    const prevSessions = [{ id: "s1", sequenceNumber: 1, status: "approved", totalDistributed: 100, dataStartAfter: null, dataCutoffAt: null, approvedAt: "2026-04-24" }];
    useTipDistributionStore.setState({
      currentSession: createMockSession(),
      previousSessions: prevSessions,
      _wizardSessionDate: "2026-04-24",
    });

    useTipDistributionStore.getState().resetForNewSession();
    const state = useTipDistributionStore.getState();

    expect(state.currentSession).toBeNull();
    expect(state.wizardStep).toBe("declare");
    expect(state.cashTipDeclarations).toEqual({});
    // These should be preserved
    expect(state._wizardSessionDate).toBe("2026-04-24");
    expect(state.previousSessions).toEqual(prevSessions);
  });
});

// ============================================================================
// Scenario 6: Two Bartenders — Equal Split (The Toast Scenario)
// ============================================================================

describe("Scenario 6: Two Bartenders — Equal Split", () => {
  /**
   * Real-world scenario: Two bartenders share a bar. One rings up all orders
   * that night. With Dexa tip pooling (equal_split, charged_tips, 100%),
   * both get equal credit card tips regardless of who rang them in.
   *
   * Alice: $500 sales, $100 charged tips, 8 hours
   * Bob:   $300 sales, $60 charged tips, 4 hours
   * Pool:  100% of charged tips = $160, split equally = $80 each
   */

  let aliceDetail: TipDistributionDetail;
  let bobDetail: TipDistributionDetail;

  beforeEach(() => {
    resetStore();

    aliceDetail = createMockDistributionDetail({
      id: "alice_detail",
      staffProfileId: "staff_alice",
      staffName: "Alice",
      roleCode: "merchant.bartender",
      grossSales: 500,
      chargedTips: 100,
      cashTips: 0,
      individualTipsEarned: 100,
      tipPoolContributed: 100, // 100% of charged tips
      tipPoolReceived: 80,     // 160 / 2
      hoursWorked: 8,
      netTips: 80,             // 100 - 100 + 80
    });

    bobDetail = createMockDistributionDetail({
      id: "bob_detail",
      staffProfileId: "staff_bob",
      staffName: "Bob",
      roleCode: "merchant.bartender",
      grossSales: 300,
      chargedTips: 60,
      cashTips: 0,
      individualTipsEarned: 60,
      tipPoolContributed: 60,  // 100% of charged tips
      tipPoolReceived: 80,     // 160 / 2
      hoursWorked: 4,
      netTips: 80,             // 60 - 60 + 80
    });
  });

  it("pool total equals sum of all charged tips", () => {
    const poolTotal = aliceDetail.tipPoolContributed + bobDetail.tipPoolContributed;
    expect(poolTotal).toBe(160);
  });

  it("equal split gives each bartender the same amount", () => {
    expect(aliceDetail.tipPoolReceived).toBe(80);
    expect(bobDetail.tipPoolReceived).toBe(80);
  });

  it("net tips are equal despite unequal ring-ups", () => {
    expect(aliceDetail.netTips).toBe(80);
    expect(bobDetail.netTips).toBe(80);
  });

  it("net tips formula holds for both bartenders", () => {
    // Alice: 100 - 100 + 80 - 0 + 0 + 0 = 80
    const aliceNet =
      aliceDetail.individualTipsEarned -
      aliceDetail.tipPoolContributed +
      aliceDetail.tipPoolReceived -
      aliceDetail.tipOutGiven +
      aliceDetail.tipOutReceived +
      aliceDetail.manualAdjustment;
    expect(aliceNet).toBe(80);

    // Bob: 60 - 60 + 80 - 0 + 0 + 0 = 80
    const bobNet =
      bobDetail.individualTipsEarned -
      bobDetail.tipPoolContributed +
      bobDetail.tipPoolReceived -
      bobDetail.tipOutGiven +
      bobDetail.tipOutReceived +
      bobDetail.manualAdjustment;
    expect(bobNet).toBe(80);
  });

  it("manual adjustment updates net tips correctly via store", () => {
    const session = createMockSession(
      { totalTipsCollected: 160, totalDistributed: 160 },
      [aliceDetail, bobDetail]
    );
    useTipDistributionStore.setState({ currentSession: session });

    // Manager adds $5 adjustment for Alice
    useTipDistributionStore.getState().updateDetailAdjustment("alice_detail", 5);

    const details = useTipDistributionStore.getState().currentSession!.details;
    const alice = details.find((d) => d.id === "alice_detail")!;
    const bob = details.find((d) => d.id === "bob_detail")!;

    expect(alice.netTips).toBe(85); // 100 - 100 + 80 + 5
    expect(alice.manualAdjustment).toBe(5);
    expect(bob.netTips).toBe(80); // unchanged
  });

  it("total distributed equals sum of net tips", () => {
    const totalDistributed = aliceDetail.netTips + bobDetail.netTips;
    expect(totalDistributed).toBe(160);
  });
});

// ============================================================================
// Scenario 7: Two Bartenders — Hours-Weighted
// ============================================================================

describe("Scenario 7: Two Bartenders — Hours-Weighted", () => {
  /**
   * Same bartenders, but tips distributed proportional to hours worked.
   * Alice: 8 hours, Bob: 4 hours, total: 12 hours
   * Pool: $160
   * Alice: 160 * 8/12 = 106.67
   * Bob:   160 * 4/12 = 53.33
   */

  it("distributes proportional to hours worked", () => {
    const poolTotal = 160;
    const aliceHours = 8;
    const bobHours = 4;
    const totalHours = aliceHours + bobHours;

    const aliceReceived = round2(poolTotal * (aliceHours / totalHours));
    const bobReceived = round2(poolTotal * (bobHours / totalHours));

    expect(aliceReceived).toBe(106.67);
    expect(bobReceived).toBe(53.33);
  });

  it("net tips reflect hours-weighted distribution", () => {
    const aliceDetail = createMockDistributionDetail({
      id: "alice_hw",
      individualTipsEarned: 100,
      tipPoolContributed: 100,
      tipPoolReceived: 106.67,
      hoursWorked: 8,
    });

    const bobDetail = createMockDistributionDetail({
      id: "bob_hw",
      individualTipsEarned: 60,
      tipPoolContributed: 60,
      tipPoolReceived: 53.33,
      hoursWorked: 4,
    });

    // Alice net: 100 - 100 + 106.67 = 106.67
    const aliceNet = round2(
      aliceDetail.individualTipsEarned -
      aliceDetail.tipPoolContributed +
      aliceDetail.tipPoolReceived
    );
    expect(aliceNet).toBe(106.67);

    // Bob net: 60 - 60 + 53.33 = 53.33
    const bobNet = round2(
      bobDetail.individualTipsEarned -
      bobDetail.tipPoolContributed +
      bobDetail.tipPoolReceived
    );
    expect(bobNet).toBe(53.33);
  });

  it("total distributed equals pool total", () => {
    // 106.67 + 53.33 = 160.00
    expect(round2(106.67 + 53.33)).toBe(160);
  });
});

// ============================================================================
// Scenario 8: Kitchen Tip-Out
// ============================================================================

describe("Scenario 8: Kitchen Tip-Out", () => {
  /**
   * Bartender tips out 3% of gross sales to bussers.
   * Alice: $500 sales, $100 tips → tip-out = $500 * 3% = $15
   * Busser receives: $15
   */

  it("calculates percentage_of_sales tip-out correctly", () => {
    const grossSales = 500;
    const tipOutPercentage = 3;
    const tipOutGiven = round2(grossSales * (tipOutPercentage / 100));
    expect(tipOutGiven).toBe(15);
  });

  it("tip-out reduces net tips for giver", () => {
    const alice = createMockDistributionDetail({
      id: "alice_tipout",
      individualTipsEarned: 100,
      tipOutGiven: 15,
      netTips: 85, // 100 - 15
    });

    const aliceNet =
      alice.individualTipsEarned -
      alice.tipPoolContributed +
      alice.tipPoolReceived -
      alice.tipOutGiven +
      alice.tipOutReceived +
      alice.manualAdjustment;
    expect(aliceNet).toBe(85);
  });

  it("tip-out increases net tips for receiver", () => {
    const busser = createMockDistributionDetail({
      id: "busser_tipout",
      roleCode: "merchant.busser",
      individualTipsEarned: 0,
      tipOutReceived: 15,
      netTips: 15,
    });

    const busserNet =
      busser.individualTipsEarned -
      busser.tipPoolContributed +
      busser.tipPoolReceived -
      busser.tipOutGiven +
      busser.tipOutReceived +
      busser.manualAdjustment;
    expect(busserNet).toBe(15);
  });

  it("percentage_of_tips tip-out uses tips not sales", () => {
    const individualTips = 100;
    const tipOutPercentage = 10; // 10% of tips
    const tipOutGiven = round2(individualTips * (tipOutPercentage / 100));
    expect(tipOutGiven).toBe(10);
  });

  it("flat_amount tip-out is fixed per employee", () => {
    const flatAmount = 5;
    const giverCount = 3; // 3 servers
    const receiverCount = 2; // 2 bussers
    const totalGiven = flatAmount * giverCount; // $15 total
    const perReceiver = round2(totalGiven / receiverCount); // $7.50 each
    expect(totalGiven).toBe(15);
    expect(perReceiver).toBe(7.5);
  });
});

// ============================================================================
// Scenario 9: computeEmployeeTipData (Pure Function)
// ============================================================================

describe("Scenario 9: computeEmployeeTipData", () => {
  const staffId = "staff_alice";
  const startUtc = "2026-04-24T04:00:00Z"; // business day start
  const endUtc = "2026-04-25T04:00:00Z";   // business day end

  it("sums card tips from completed orders", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [
          createMockPayment({ method: "Card", tip_amount: 10 }),
        ],
      }),
      o2: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 30,
        opened_at: "2026-04-24T14:00:00Z",
        payments: [
          createMockPayment({ method: "Card", tip_amount: 8 }),
        ],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(18);
    expect(result.cashPaymentTips).toBe(0);
  });

  it("separates cash tips from card tips", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [
          createMockPayment({ method: "Card", tip_amount: 10 }),
          createMockPayment({ method: "Cash", tip_amount: 5 }),
        ],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(10);
    expect(result.cashPaymentTips).toBe(5);
  });

  it("accumulates gross sales from total_amount", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
      }),
      o2: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 75,
        opened_at: "2026-04-24T15:00:00Z",
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.grossSales).toBe(125);
  });

  it("excludes void/cancelled/refunded orders", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        order_status: "void",
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [createMockPayment({ method: "Card", tip_amount: 10 })],
      }),
      o2: createMockOrder({
        created_by_staff_profile_id: staffId,
        order_status: "cancelled",
        total_amount: 30,
        opened_at: "2026-04-24T14:00:00Z",
        payments: [createMockPayment({ method: "Card", tip_amount: 5 })],
      }),
      o3: createMockOrder({
        created_by_staff_profile_id: staffId,
        order_status: "refunded",
        total_amount: 20,
        opened_at: "2026-04-24T16:00:00Z",
        payments: [createMockPayment({ method: "Card", tip_amount: 3 })],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(0);
    expect(result.grossSales).toBe(0);
  });

  it("excludes voided payments", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [
          createMockPayment({ method: "Card", tip_amount: 10, status: "voided" }),
          createMockPayment({ method: "Card", tip_amount: 7, status: "captured" }),
        ],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(7); // only non-voided
  });

  it("filters by date boundaries", () => {
    const ordersById: Record<string, OrderProfile> = {
      before: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-23T23:00:00Z", // before start
        payments: [createMockPayment({ method: "Card", tip_amount: 10 })],
      }),
      inside: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 30,
        opened_at: "2026-04-24T12:00:00Z", // inside
        payments: [createMockPayment({ method: "Card", tip_amount: 5 })],
      }),
      after: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 20,
        opened_at: "2026-04-25T05:00:00Z", // after end
        payments: [createMockPayment({ method: "Card", tip_amount: 3 })],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(5);
    expect(result.grossSales).toBe(30);
  });

  it("only includes orders for the specified staff member", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [createMockPayment({ method: "Card", tip_amount: 10 })],
      }),
      o2: createMockOrder({
        created_by_staff_profile_id: "staff_bob",
        total_amount: 80,
        opened_at: "2026-04-24T14:00:00Z",
        payments: [createMockPayment({ method: "Card", tip_amount: 15 })],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(10);
    expect(result.grossSales).toBe(50);
  });

  it("returns zeros for employee with no orders", () => {
    const result = computeEmployeeTipData(staffId, {}, startUtc, endUtc);
    expect(result.cardTips).toBe(0);
    expect(result.cashPaymentTips).toBe(0);
    expect(result.grossSales).toBe(0);
  });

  it("skips payments with zero or negative tips", () => {
    const ordersById: Record<string, OrderProfile> = {
      o1: createMockOrder({
        created_by_staff_profile_id: staffId,
        total_amount: 50,
        opened_at: "2026-04-24T12:00:00Z",
        payments: [
          createMockPayment({ method: "Card", tip_amount: 0 }),
          createMockPayment({ method: "Card", tip_amount: -5 }),
          createMockPayment({ method: "Card", tip_amount: 12 }),
        ],
      }),
    };

    const result = computeEmployeeTipData(staffId, ordersById, startUtc, endUtc);
    expect(result.cardTips).toBe(12);
  });
});

// ============================================================================
// Scenario 10: Edge Cases
// ============================================================================

describe("Scenario 10: Edge Cases", () => {
  beforeEach(resetStore);

  it("zero tips: no division by zero in equal split", () => {
    const detail = createMockDistributionDetail({
      id: "d_zero",
      individualTipsEarned: 0,
      tipPoolContributed: 0,
      tipPoolReceived: 0,
      netTips: 0,
    });

    const net =
      detail.individualTipsEarned -
      detail.tipPoolContributed +
      detail.tipPoolReceived -
      detail.tipOutGiven +
      detail.tipOutReceived +
      detail.manualAdjustment;
    expect(net).toBe(0);
  });

  it("single employee gets 100% of pool back", () => {
    const soloDetail = createMockDistributionDetail({
      id: "solo",
      individualTipsEarned: 200,
      tipPoolContributed: 200, // 100% in
      tipPoolReceived: 200,    // only eligible employee
      netTips: 200,
    });

    const net =
      soloDetail.individualTipsEarned -
      soloDetail.tipPoolContributed +
      soloDetail.tipPoolReceived;
    expect(net).toBe(200);
  });

  it("empty session details: updateDetailAdjustment is safe", () => {
    const session = createMockSession({}, []);
    useTipDistributionStore.setState({ currentSession: session });

    // Should not throw
    useTipDistributionStore.getState().updateDetailAdjustment("nonexistent", 10);

    expect(useTipDistributionStore.getState().currentSession!.details).toHaveLength(0);
  });

  it("hours_weighted with zero total hours returns zero", () => {
    const poolTotal = 100;
    const totalHours = 0;
    // SQL handles this with IF v_total_hours > 0, no one gets anything
    const received = totalHours > 0 ? round2(poolTotal * (0 / totalHours)) : 0;
    expect(received).toBe(0);
  });

  it("rounding adjustment captures penny differences", () => {
    // 3 employees splitting $100 equally = $33.33 each = $99.99 total
    const poolTotal = 100;
    const perEmployee = round2(poolTotal / 3);
    expect(perEmployee).toBe(33.33);

    const totalDistributed = round2(perEmployee * 3);
    expect(totalDistributed).toBe(99.99);

    const roundingAdjustment = round2(poolTotal - totalDistributed);
    expect(roundingAdjustment).toBe(0.01);
  });

  it("config setters store data correctly", () => {
    const pool = createMockTipPoolConfig({ id: "pool_1", name: "Test Pool" });
    const rule = createMockTipOutRule({ id: "rule_1" });
    const share: TipPoolRoleShare = {
      id: "share_1",
      tipPoolConfigId: "pool_1",
      roleCode: "merchant.bartender",
      sharePercentage: 100,
      isEligible: true,
    };

    useTipDistributionStore.getState().setTipPoolConfigs([pool]);
    useTipDistributionStore.getState().setTipOutRules([rule]);
    useTipDistributionStore.getState().setTipPoolRoleShares([share]);

    const state = useTipDistributionStore.getState();
    expect(state.tipPoolConfigs).toHaveLength(1);
    expect(state.tipPoolConfigs[0].name).toBe("Test Pool");
    expect(state.tipOutRules).toHaveLength(1);
    expect(state.tipPoolRoleShares).toHaveLength(1);
    expect(state.tipPoolRoleShares[0].sharePercentage).toBe(100);
  });
});
