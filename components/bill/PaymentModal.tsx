import { usePaymentStore } from "@/stores/usePaymentStore";
import React from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import CardPaymentView from "./ paymentView/CardPaymentView";
import CashPaymentView from "./ paymentView/CashPaymentView";
import ItemsReviewView from "./ paymentView/ItemsReviewView";
import PaymentSuccessView from "./ paymentView/PaymentSuccessView";
import SplitPaymentView from "./ paymentView/SplitPaymentView";

const PaymentModal: React.FC = () => {
  const { isOpen, view, close } = usePaymentStore();

  const renderContent = () => {
    switch (view) {
      case "review":
        return <ItemsReviewView />;
      case "card":
        return <CardPaymentView />;
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
