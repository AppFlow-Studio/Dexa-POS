import { usePaymentStore } from "@/stores/usePaymentStore";
import React from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import CardPaymentView from "./ paymentView/CardPaymentView";
import CashPaymentView from "./ paymentView/CashPaymentView";
import ItemsReviewView from "./ paymentView/ItemsReviewView";
import PaymentSuccessView from "./ paymentView/PaymentSuccessView";
import SplitPaymentView from "./ paymentView/SplitPaymentView";
import CardPaymentOptions from "./paymentView/CardPaymentOptions";
import ManualCardEntryView from "./paymentView/ManualCardEntryView";

const PaymentModal: React.FC = () => {
  const isOpen = usePaymentStore((s) => s.isOpen);
  const view = usePaymentStore((s) => s.view);
  const close = usePaymentStore((s) => s.close);

  const renderContent = () => {
    switch (view) {
      case "review":
        return;
      case "cardOptions": // New case
        return <CardPaymentOptions />;
      case "card":
        return <CardPaymentView />;
      case "manual": // New case for manual entry
        return <ManualCardEntryView />;
      case "cash":
        return <CashPaymentView />;
      case "split":
        return <SplitPaymentView />;
      case "success":
        return <PaymentSuccessView />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="bg-transparent border-none shadow-none">
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
