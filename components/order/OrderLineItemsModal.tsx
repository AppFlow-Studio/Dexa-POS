import { useOrderStore } from "@/stores/useOrderStore";
import React, { useEffect } from "react";
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
  const { setActiveOrder } = useOrderStore();

  // This effect ensures that the payment modal's context is set to this order
  // so that the ItemsReviewView shows the correct data.
  useEffect(() => {
    if (isOpen && orderId) {
      setActiveOrder(orderId);
    }
    return () => setActiveOrder(null); // Clean up on close
  }, [isOpen, orderId, setActiveOrder]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 bg-transparent w-[550px]">
        <OrderLineItemsView onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
};

export default OrderLineItemsModal;
