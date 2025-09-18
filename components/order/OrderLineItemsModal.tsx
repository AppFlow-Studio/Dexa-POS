import React from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import OrderLineItemsView from "./OrderLineItemsView";

interface OrderLineItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
}

const OrderLineItemsModal: React.FC<OrderLineItemsModalProps> = ({
  isOpen,
  onClose,
  orderId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 bg-transparent w-[550px]">
        <OrderLineItemsView onClose={onClose} orderId={orderId} />
      </DialogContent>
    </Dialog>
  );
};

export default OrderLineItemsModal;
