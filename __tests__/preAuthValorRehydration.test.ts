// Guards the Valor pre-auth rehydration P0: a Valor hold read back from the
// backend must keep preAuthTerminalType='valor' and its preAuthTranNo (the
// completion/void reference) even when the flat card columns are still null
// (pre-v4). A regression here silently breaks Close/Release after any refresh.

import { transformBroadcastPaymentsToProfile } from "@/utils/orderTransformers";

// A Valor pre-auth row as it comes back from order_payments BEFORE process_preauth_v4
// populates the flat columns: card_last_four/card_type/rrn/authorization_code are null;
// the truth lives in processor_response.valor_transaction.
const valorPreAuthRow: any = {
  id: "op-valor-1",
  amount: 50,
  tip_amount: 0,
  total_amount: 50,
  status: "authorized",
  payment_method: "card",
  card_type: null,
  card_last_four: null,
  rrn: null,
  authorization_code: null,
  reference_number: null,
  terminal_type: null, // pre-v4: enum column not yet stamped for pre-auth
  terminal_response: null,
  processor_response: {
    terminal_vendor: "valor",
    valor_transaction: {
      tranNo: "42",
      rrn: "123456789012",
      approvalCode: "RA1234",
      reqTxnId: "000123",
      cardLast4: "1111",
      cardType: "VISA",
      entryMode: "chip",
    },
  },
  created_at: "2026-07-24T00:00:00Z",
  authorized_at: "2026-07-24T00:00:00Z",
};

describe("Valor pre-auth rehydration (transformBroadcastPaymentsToProfile)", () => {
  it("keeps terminalType=valor + tranNo + last4 when flat columns are null", () => {
    const [p] = transformBroadcastPaymentsToProfile([valorPreAuthRow]);

    expect(p.isPreAuth).toBe(true);
    expect(p.status).toBe("authorized");
    // The P0: must NOT coerce to 'dejavoo'/undefined.
    expect(p.preAuthTerminalType).toBe("valor");
    // The completion/void reference must survive the round-trip.
    expect(p.preAuthTranNo).toBe("42");
    // last4 (the CARD_NO fallback) recovered from the JSONB, not the null column.
    expect(p.last4).toBe("1111");
    expect(p.preAuthRrn).toBe("123456789012");
    expect(p.preAuthAuthCode).toBe("RA1234");
  });

  it("still recovers a captured (post-v4) Valor row from flat columns", () => {
    const captured: any = {
      ...valorPreAuthRow,
      status: "captured",
      terminal_type: "valor",
      card_last_four: "1111",
      card_type: "VISA",
    };
    const [p] = transformBroadcastPaymentsToProfile([captured]);
    expect(p.status).toBe("captured");
    expect(p.last4).toBe("1111");
  });
});
