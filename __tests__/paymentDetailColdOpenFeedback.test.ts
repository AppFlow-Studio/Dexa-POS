import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "..", "components/menu/PaymentDetailBottomSheet.tsx"),
  "utf-8",
);

describe("payment detail cold-open feedback", () => {
  it("renders visible feedback while the lazy detail module loads", () => {
    expect(source).toContain("PaymentDetailLoadingFallback");
    expect(source).toContain("Opening payment details...");
    expect(source).toContain(
      "fallback={<PaymentDetailLoadingFallback />}",
    );
    expect(source).not.toContain("fallback={null}");
  });
});
