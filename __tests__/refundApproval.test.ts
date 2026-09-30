import { parseRefundApproval } from "@/lib/refundApproval";

describe("parseRefundApproval", () => {
  it("extracts Castles approval fields from the nested transaction", () => {
    expect(
      parseRefundApproval({
        castles_transaction: {
          rrn: "623000499605",
          approvalCode: "A12345",
          referenceId: "castles-ref",
          stan: "4412",
          resultCode: "00000000",
          responseMessage: "APPROVED",
          cardType: "AMEX",
          last4: "1004",
          entryMode: "contactless",
          batch: "072",
          txnInvoiceNumber: "1909",
        },
      }),
    ).toEqual({
      rrn: "623000499605",
      authCode: "A12345",
      referenceId: "castles-ref",
      transactionNumber: "4412",
      resultCode: "00000000",
      responseMessage: "APPROVED",
      cardBrand: "AMEX",
      cardLast4: "1004",
      entryMode: "contactless",
      batchNumber: "072",
      invoiceNumber: "1909",
    });
  });

  it("preserves top-level Dejavoo-style fields", () => {
    const approval = parseRefundApproval({
      RRN: "refund-rrn",
      AuthCode: "AUTH9",
      ReferenceId: "ref-9",
      TransactionNumber: 77,
      BatchNumber: "12",
      InvoiceNumber: "800",
      GeneralResponse: { ResultCode: "0", Message: "Approved" },
    });

    expect(approval.rrn).toBe("refund-rrn");
    expect(approval.authCode).toBe("AUTH9");
    expect(approval.transactionNumber).toBe("77");
    expect(approval.resultCode).toBe("0");
    expect(approval.responseMessage).toBe("Approved");
  });
  it("reads a CodePay reversal (snake_case keys + codepay_transaction)", () => {
    const approval = parseRefundApproval({
      terminal_vendor: "codepay",
      terminal_type: "codepay",
      authorization_code: "A1B2C3",
      rrn: "627200123456",
      reference_number: "CPRF_1790690595087_cb79",
      transaction_number: "51126005503260929000031",
      card_last_four: "5478",
      card_type: "mastercard",
      entry_type: "contactless",
      result_code: "000",
      response_message: "Approved",
      codepay_transaction: { transNo: "51126005503260929000031" },
    });

    expect(approval).toMatchObject({
      rrn: "627200123456",
      authCode: "A1B2C3",
      referenceId: "CPRF_1790690595087_cb79",
      transactionNumber: "51126005503260929000031",
      resultCode: "000",
      responseMessage: "Approved",
      cardLast4: "5478",
    });
  });
});
