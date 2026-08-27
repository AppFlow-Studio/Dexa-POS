/**
 * Phase 3 / K8 — one definition of "sent", one definition of "unsent".
 *
 * The workflow-mode value (getKitchenSentStatus) and the unsent predicate
 * (isKitchenItemUnsent) must live in lib/kitchenStatusUtils.ts and be the ONLY
 * sources. Previously: the payment path hardcoded 'sent' (breaking 2-step), and
 * three components each carried their own copy of the unsent predicate.
 *
 * Structural assertions on real sources.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const storeSrc = readFileSync(join(repoRoot, "stores", "useOrderStore.ts"), "utf8");
const utilsSrc = readFileSync(
  join(repoRoot, "lib", "kitchenStatusUtils.ts"),
  "utf8",
);
const courseAccordion = readFileSync(
  join(repoRoot, "components", "bill", "CourseAccordion.tsx"),
  "utf8",
);
const tableOrderView = readFileSync(
  join(repoRoot, "components", "tables", "TableOrderView.tsx"),
  "utf8",
);
const tableBillSection = readFileSync(
  join(repoRoot, "components", "bill", "TableBillSection.tsx"),
  "utf8",
);
const guardScript = readFileSync(
  join(repoRoot, "scripts", "check-kitchen-status-literals.sh"),
  "utf8",
);
const pkg = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);

describe("K8 — mode-aware kitchen status everywhere", () => {
  it("exposes both helpers from the single module", () => {
    expect(utilsSrc).toContain("export function isKitchenItemUnsent(");
    expect(utilsSrc).toContain("export function isKitchenItemSent(");
    expect(utilsSrc).toContain("export function getKitchenSentStatus(");
  });

  it("uses getKitchenSentStatus() when a payment marks items sent", () => {
    // Both the allocation and FIFO branches previously hardcoded "sent".
    const markSites = storeSrc.match(/kitchen_status: getKitchenSentStatus\(\) as any/g);
    expect(markSites).not.toBeNull();
    expect(markSites!.length).toBeGreaterThanOrEqual(2);
  });

  it("uses getKitchenSentStatus() in updateItemInActiveOrder", () => {
    expect(storeSrc).toContain(
      "updatedItem.kitchen_status = getKitchenSentStatus() as any;",
    );
    // No hardcoded assignment remains:
    expect(storeSrc).not.toContain(
      'updatedItem.kitchen_status = "sent";',
    );
  });
});

describe("Phase 3 — one unsent predicate", () => {
  it("imports isKitchenItemUnsent in CourseAccordion and keeps no local copy", () => {
    expect(courseAccordion).toContain(
      'import { isKitchenItemUnsent } from "@/lib/kitchenStatusUtils";',
    );
    expect(courseAccordion).not.toMatch(
      /function isKitchenItemUnsent\(item: CartItem\): boolean/,
    );
  });

  it("imports isKitchenItemUnsent in TableOrderView and keeps no local copy", () => {
    expect(tableOrderView).toContain("isKitchenItemUnsent,");
    expect(tableOrderView).not.toMatch(
      /const isKitchenItemUnsent = \(item: \{ kitchen_status\?: string \| null \}\)/,
    );
  });

  it("imports isKitchenItemSent in TableBillSection and keeps no local copy", () => {
    expect(tableBillSection).toContain(
      "import { isKitchenItemSent } from '@/lib/kitchenStatusUtils'",
    );
    expect(tableBillSection).not.toMatch(
      /function isSentToKitchen \(item: CartItem\): boolean/,
    );
    expect(tableBillSection).not.toContain("isSentToKitchen");
  });
});

describe("Phase 3 — guard against regression", () => {
  it("ships the kitchen-status literal check", () => {
    expect(guardScript).toContain("kds-status-allow:");
    expect(guardScript).toContain("kitchen_status");
    expect(guardScript).toContain("getKitchenSentStatus()");
    expect(pkg.scripts["check:kitchen-status"]).toContain(
      "check-kitchen-status-literals.sh",
    );
  });

  it("watches the operational files", () => {
    expect(guardScript).toContain("stores/useOrderStore.ts");
    expect(guardScript).toContain("services/preAuthService.ts");
    expect(guardScript).toContain(
      "services/sessionEffects/sendToKitchenEffect.ts",
    );
  });
});
