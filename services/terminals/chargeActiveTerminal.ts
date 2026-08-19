// ============================================================
// chargeActiveTerminal — UI-free "charge the active terminal" helper
// File: services/terminals/chargeActiveTerminal.ts
// ============================================================
// Mirrors the four POS charge branches in
// `components/bill/ paymentView/CardPaymentView.tsx` (Castles / Valor / ATOM /
// Dejavoo) but with NO UI, CFD, or payment-sheet coupling — so the self-service
// kiosk can charge a card exactly the way a POS station does.
//
// Terminal routing goes through `resolveActiveProcessor()` (the POS's single
// source of truth, honouring the ATOM on-device preference) instead of reading
// `selectedStation.payment_terminal` directly.
//
// Returns a normalized result the kiosk feeds straight into `payFullCard`:
//   { ok, terminalResponse?, terminalId?, indeterminate?, message? }
// `indeterminate: true` means the charge MAY have landed (Valor/ATOM socket died
// after the card read, or a partial approval) — the caller MUST NOT void or
// re-charge; it should route the customer to a staff member.
//
// The `terminalResponse` shape per processor matches what the backend stores for
// a POS sale: Castles/Valor/ATOM pass the service's pre-built JSONB
// (`castles_transaction` / `valor_transaction` / `atom_transaction`); Dejavoo
// builds the same flattened `dejavoo_transaction` object `syncPaymentToBackend`
// produces.
// ============================================================

import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { atomBringPosToForeground } from "@/native/AtomBridge";
import {
  extractLast4,
  parseCastlesReturnCode,
} from "@/services/terminals/castles-response-mapper";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import { getSharedAtomService } from "@/services/terminals/atom-service";
import {
  resumeAtomLoopbackProbing,
  suspendAtomLoopbackProbing,
} from "@/services/terminals/atomLoopbackDetector";
import { getSharedValorService } from "@/services/terminals/valor-service";
import { getOrCreateValorCounter } from "@/services/terminals/valor-txn-counter";
import {
  failPaymentJournal,
  updatePaymentJournal,
  writePaymentJournal,
} from "@/services/paymentJournal";
import { resolveActiveProcessor } from "@/hooks/useActiveProcessor";
import { useAtomTerminalStore } from "@/stores/useAtomTerminalStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { ATOM_LOOPBACK_HOST, ATOM_SALE_TIMEOUT_MS } from "@/types/atom";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { generateRefId } from "@/types/dejavoo-spin-api";
import { VALOR_DEFAULT_PORT } from "@/types/valor";
import { v4 as uuidv4 } from "uuid";

/** Normalized result of charging the active terminal. */
export interface ChargeActiveTerminalResult {
  /** True only when the card was approved and the charge is confirmed. */
  ok: boolean;
  /**
   * The charge MAY have landed but we can't confirm (socket died after the card
   * read, or a partial approval). Caller MUST NOT void the order or re-charge.
   */
  indeterminate?: boolean;
  /** Human message for a decline / error / indeterminate. */
  message?: string;
  /** JSONB handed to `payFullCard` as `p_terminal_response`. */
  terminalResponse?: Record<string, unknown>;
  /** DB id of the terminal that ran the sale (for settlement routing). */
  terminalId?: string;
}

export interface ChargeActiveTerminalArgs {
  /** Grand total to charge in dollars, INCLUDING tip (kiosk convention). */
  amount: number;
  /** Tip portion in dollars (0 if none). */
  tipAmount: number;
  /** Local order id (store key) — for the crash-recovery journal. */
  orderId: string;
  /** Backend order id, if known — for the journal. */
  dbOrderId?: string;
  /** Live Supabase client (for the terminal txn counters + Dejavoo creds). */
  supabase: ReturnType<typeof useSupabaseClient>;
}

const INDETERMINATE_MESSAGE =
  "Payment is being verified. Please see a staff member before trying again.";

/**
 * Charge the card on the station's active terminal, mirroring the POS.
 * Falls back to an 800 ms simulated approval when no terminal is configured, so
 * dev / no-hardware kiosks still complete an order.
 */
export async function chargeActiveTerminal(
  args: ChargeActiveTerminalArgs,
): Promise<ChargeActiveTerminalResult> {
  const { amount, tipAmount, orderId, dbOrderId, supabase } = args;
  // Base (pre-tip) amount — the terminal adds the tip on top for Castles/Valor/
  // ATOM; Dejavoo takes the grand total plus a tip breakdown.
  const base = Math.max(0, amount - tipAmount);

  const terminal = resolveActiveProcessor().activeTerminal;

  // No configured terminal — simulate (unchanged legacy behaviour).
  if (!terminal) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, terminalResponse: { simulated: true, amount } };
  }

  const journalKey = uuidv4();
  const writeJournal = () =>
    writePaymentJournal({
      orderId,
      dbOrderId: dbOrderId ?? undefined,
      amount: base,
      tipAmount,
      paymentMethod: "Card",
      idempotencyKey: journalKey,
    });
  const journalHandle = (id: string) => ({ id, idempotencyKey: journalKey });

  // ============ CASTLES ============
  if (terminal.terminal_type === "castles") {
    const isUsb = terminal.connection_type === "usb";
    const host = isUsb ? undefined : terminal.ip_address;
    if (!isUsb && !host) {
      return { ok: false, message: "Castles terminal has no IP address configured." };
    }
    const port = isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT);

    const service = getSharedCastlesService();
    await service.connect({
      connectionType: isUsb ? "usb" : "local_socket",
      host,
      port,
      timeout: 120_000,
      terminalId: terminal.id,
    });
    await service.resetTerminalState();

    const counter = getOrCreateCounter({
      terminalId: terminal.id,
      supabaseClient: supabase,
    });
    if (!counter.isInitialized) await counter.initialize();
    const referenceId = counter.next();

    const journalId = writeJournal();
    const result = await service.processSale({ amount: base, tipAmount, referenceId });

    updatePaymentJournal(journalId, {
      status: "terminal_approved",
      terminalTxnId: referenceId,
      ...(dbOrderId ? { dbOrderId } : {}),
    });

    if (!result.success) {
      const info = result.raw?.txnReturnCode
        ? parseCastlesReturnCode(result.raw.txnReturnCode)
        : { message: result.error || "Transaction failed" };
      failPaymentJournal(journalId, `terminal_declined: ${info.message}`);
      return { ok: false, message: info.message };
    }

    const last4 = result.raw
      ? extractLast4(
          result.raw.txnMaskedCardNum ?? result.raw.txnCardMaskedPan ?? "",
        )
      : undefined;

    return {
      ok: true,
      terminalId: terminal.id,
      terminalResponse: {
        castles_transaction: {
          cardLast4: last4,
          approvalCode: result.raw?.txnApprovalCode,
          cardType: result.raw?.txnCardBrand ?? result.raw?.txnCardType,
          rrn: result.raw?.txnRrn ?? result.raw?.txnRRN,
          cardAID: result.raw?.txnCardAid,
        },
        transactionId: referenceId,
        paymentJournalHandle: journalHandle(journalId),
      },
    };
  }

  // ============ VALOR ============
  if (terminal.terminal_type === "valor") {
    const isUsb = terminal.connection_type === "usb";
    const host = isUsb ? undefined : terminal.ip_address;
    if (!isUsb && !host) {
      return { ok: false, message: "Valor terminal has no IP address configured." };
    }
    const port = isUsb ? undefined : (terminal.port ?? VALOR_DEFAULT_PORT);

    const service = getSharedValorService();
    await service.connect({
      connectionType: isUsb ? "usb" : "local_socket",
      host,
      port,
      cancelPort: terminal.cancel_port,
      epi: terminal.epi,
      timeout: 120_000,
      terminalId: terminal.id,
    });

    const counter = getOrCreateValorCounter({
      terminalId: terminal.id,
      supabaseClient: supabase,
    });
    if (!counter.isInitialized) await counter.initialize();
    const referenceId = counter.next();

    const journalId = writeJournal();
    const amountCents = Math.round((base + Number.EPSILON) * 100);
    const tipCents = Math.round((tipAmount + Number.EPSILON) * 100);

    const result = await service.processSale({
      amount: amountCents,
      tipAmount: tipCents,
      referenceId,
      // STAN captured at S2 (before card) — persist for TRAN_MODE 90 recovery.
      onStan: (stan) => {
        updatePaymentJournal(journalId, {
          status: "terminal_approved",
          terminalTxnId: stan,
          ...(dbOrderId ? { dbOrderId } : {}),
        });
      },
    });

    const valorTx = result.terminalResponse?.valor_transaction as
      | Record<string, string>
      | undefined;

    // INDETERMINATE — terminal may have charged. Leave journal for reconcile.
    if (result.indeterminate) {
      updatePaymentJournal(journalId, {
        status: "terminal_approved",
        terminalTxnId: result.stan ?? referenceId,
      });
      return { ok: false, indeterminate: true, message: INDETERMINATE_MESSAGE };
    }

    // Clean decline.
    if (!result.success) {
      failPaymentJournal(journalId, `terminal_declined: ${result.error ?? "Declined"}`);
      return { ok: false, message: result.error || "Payment declined." };
    }

    // PARTIAL — money WAS captured for a portion; the kiosk can't collect the
    // rest unattended. Treat like indeterminate: don't void, route to staff.
    if (result.partial) {
      updatePaymentJournal(journalId, {
        status: "terminal_approved",
        terminalTxnId: result.stan ?? referenceId,
      });
      const approved = ((result.approvedAmount ?? 0) / 100).toFixed(2);
      return {
        ok: false,
        indeterminate: true,
        message: `Only $${approved} was approved. Please see a staff member to finish your payment.`,
      };
    }

    return {
      ok: true,
      terminalId: terminal.id,
      terminalResponse: {
        ...(result.terminalResponse ?? { valor_transaction: valorTx }),
        transactionId: referenceId,
        paymentJournalHandle: journalHandle(journalId),
      },
    };
  }

  // ============ ATOM (on-device loopback) ============
  if (terminal.terminal_type === "atom") {
    const host = terminal.ip_address ?? ATOM_LOOPBACK_HOST;
    const port =
      terminal.port ?? useAtomTerminalStore.getState().port ?? undefined;
    if (!port) {
      return { ok: false, message: "ATOM terminal port not detected." };
    }

    const service = getSharedAtomService();
    service.configure({
      host,
      port,
      terminalId: terminal.id,
      timeout: ATOM_SALE_TIMEOUT_MS,
    });

    const staSuffix =
      useStoreSettingsStore.getState().selectedStation?.id?.slice(-4) ?? "";
    const referenceId = `ATOM_${Date.now()}_${staSuffix}`;

    const journalId = writeJournal();

    // ATOM is single-session; pause background probing for the whole sale, and
    // bring ourselves back to the front afterward (it foregrounds itself).
    suspendAtomLoopbackProbing();
    const result = await service
      .processSale({
        amount: base,
        ...(tipAmount > 0 ? { tipAmount } : {}),
        referenceId,
        posData: {
          industryData: { type: "RESTAURANT", checkNumber: referenceId },
        },
      })
      .finally(() => resumeAtomLoopbackProbing());
    void atomBringPosToForeground();

    const atomTx = result.terminalResponse?.atom_transaction as
      | Record<string, string>
      | undefined;

    if (result.indeterminate) {
      updatePaymentJournal(journalId, {
        status: "terminal_approved",
        terminalTxnId: result.paymentId ?? referenceId,
      });
      return { ok: false, indeterminate: true, message: INDETERMINATE_MESSAGE };
    }

    if (result.aborted) {
      failPaymentJournal(journalId, `terminal_aborted: ${result.errorCode ?? "cancelled"}`);
      return {
        ok: false,
        message: result.error || "Payment cancelled — no charge. Please try again.",
      };
    }

    if (!result.success) {
      failPaymentJournal(journalId, `terminal_declined: ${result.error ?? "Declined"}`);
      return { ok: false, message: result.error || "Payment declined." };
    }

    updatePaymentJournal(journalId, {
      status: "terminal_approved",
      terminalTxnId: result.paymentId ?? referenceId,
      ...(dbOrderId ? { dbOrderId } : {}),
    });

    return {
      ok: true,
      terminalId: terminal.id,
      terminalResponse: {
        ...(result.terminalResponse ?? { atom_transaction: atomTx }),
        transactionId: result.paymentId ?? referenceId,
        paymentJournalHandle: journalHandle(journalId),
      },
    };
  }

  // ============ DEJAVOO (default) ============
  if (terminal.terminal_type === "dejavoo") {
    const api = new DejavooSpinAPI(supabase);
    const loaded = await api.loadTerminal(terminal.id || "", terminal);
    if (!loaded) {
      return { ok: false, message: "Failed to load terminal credentials." };
    }

    const settings = useStoreSettingsStore.getState();
    const locSuffix = settings.selectedStore?.id?.slice(-4) ?? "";
    const staSuffix = settings.selectedStation?.id?.slice(-4) ?? "";
    const refId = generateRefId("CARD", undefined, locSuffix, staSuffix);

    const journalId = writeJournal();
    const result = await api
      .sale()
      .amount(amount) // grand total incl. tip
      .tip(tipAmount)
      .paymentType("Credit")
      .refId(refId)
      .execute();

    updatePaymentJournal(journalId, {
      status: "terminal_approved",
      terminalTxnId: refId,
      ...(dbOrderId ? { dbOrderId } : {}),
    });

    if (!result.success) {
      const message =
        result.helpers?.getMessage() || result.error || "Payment declined.";
      failPaymentJournal(journalId, `terminal_declined: ${message}`);
      return { ok: false, message };
    }

    const raw = result.rawResponse as Record<string, any> | undefined;
    const general = raw?.GeneralResponse;
    const cardData = raw?.CardData;
    const emvRaw = raw?.EMVData;
    const amountsRaw = raw?.Amounts;
    const amounts = {
      totalAmount: amountsRaw?.TotalAmount ?? result.helpers?.getTotalAmount(),
      amount: amountsRaw?.Amount ?? result.helpers?.getBaseAmount(),
      tipAmount: amountsRaw?.TipAmount ?? result.helpers?.getTipAmount(),
      feeAmount: amountsRaw?.FeeAmount,
      taxAmount: amountsRaw?.TaxAmount,
    };
    const emvData = emvRaw
      ? {
          applicationName: emvRaw?.ApplicationName,
          aid: emvRaw?.AID,
          tvr: emvRaw?.TVR,
          tsi: emvRaw?.TSI,
          iad: emvRaw?.IAD,
          arc: emvRaw?.ARC,
        }
      : undefined;

    const dejavooTransaction = {
      referenceId: result.helpers?.getReferenceId() ?? raw?.ReferenceId,
      transactionNumber:
        result.helpers?.getTransactionNumber() ?? raw?.TransactionNumber,
      invoiceNumber: result.helpers?.getInvoiceNumber() ?? raw?.InvoiceNumber,
      batchNumber: result.helpers?.getBatchNumber() ?? raw?.BatchNumber,
      authCode: result.helpers?.getAuthCode() ?? raw?.AuthCode,
      totalAmount: amounts.totalAmount,
      baseAmount: amounts.amount,
      tipAmount: amounts.tipAmount,
      cardType: result.helpers?.getCardType() ?? cardData?.CardType,
      cardLast4: result.helpers?.getCardLast4() ?? cardData?.Last4,
      entryMode: result.helpers?.getEntryMode() ?? cardData?.EntryType,
      entryType: cardData?.EntryType,
      resultCode: result.helpers?.getResultCode() ?? general?.ResultCode,
      statusCode: result.helpers?.getStatusCode() ?? general?.StatusCode,
      message: result.helpers?.getMessage() ?? general?.Message,
      rrn: result.helpers?.getRRN() ?? raw?.RRN,
      pnReferenceId: raw?.PNRef ?? raw?.PNReferenceId,
      transactionType:
        result.helpers?.getTransactionType() ?? raw?.TransactionType,
      serialNumber: raw?.SerialNumber,
      hostResponseCode: general?.HostResponseCode ?? general?.StatusCode,
      hostResponseMessage: general?.HostResponseMessage ?? general?.Message,
      resultMessage: general?.Message,
      amounts,
      emvData,
    };

    // Same flattened JSONB `syncPaymentToBackend` builds for a POS Dejavoo sale.
    const terminalResponse: Record<string, unknown> = {
      terminal_type: "dejavoo",
      authorization_code: dejavooTransaction.authCode,
      card_type: dejavooTransaction.cardType,
      card_last_four: dejavooTransaction.cardLast4,
      transaction_id: dejavooTransaction.referenceId ?? refId,
      reference_id: dejavooTransaction.referenceId,
      rrn: dejavooTransaction.rrn,
      pn_reference_id: dejavooTransaction.pnReferenceId,
      auth_code: dejavooTransaction.authCode,
      batch_number: dejavooTransaction.batchNumber,
      transaction_number: dejavooTransaction.transactionNumber,
      invoice_number: dejavooTransaction.invoiceNumber,
      transaction_type: dejavooTransaction.transactionType,
      serial_number: dejavooTransaction.serialNumber,
      entry_type: dejavooTransaction.entryType ?? dejavooTransaction.entryMode,
      result_code: dejavooTransaction.resultCode,
      status_code: dejavooTransaction.statusCode,
      result_message: dejavooTransaction.message ?? dejavooTransaction.resultMessage,
      host_response_code: dejavooTransaction.hostResponseCode,
      host_response_message: dejavooTransaction.hostResponseMessage,
      amounts,
      emv_data: emvData,
      dejavoo_transaction: dejavooTransaction,
      paymentJournalHandle: journalHandle(journalId),
    };

    return { ok: true, terminalId: terminal.id, terminalResponse };
  }

  // Unknown / unsupported terminal type — simulate rather than block the order.
  await new Promise((r) => setTimeout(r, 800));
  return { ok: true, terminalResponse: { simulated: true, amount } };
}
