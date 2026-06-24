import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { useWindowDimensions } from "react-native";
import { Dialog, DialogContent } from "../ui/dialog";
import OrderLineItemsView from "./OrderLineItemsView";

interface OrderLineItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  onMarkDone?: () => void;
  onRetrieve?: () => void;
  onRefund?: () => void;
}

const OrderLineItemsModal: React.FC<OrderLineItemsModalProps> = ({
  isOpen,
  onClose,
  orderId,
  onMarkDone,
  onRetrieve,
  onRefund,
}) => {
  const { height } = useWindowDimensions();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-0 bg-transparent"
        style={{ height: height * 0.88, width: s(500), maxWidth: "94%" }}
      >
        <OrderLineItemsView
          onClose={onClose}
          orderId={orderId}
          onMarkDone={onMarkDone}
          onRetrieve={onRetrieve}
          onRefund={onRefund}
        />
      </DialogContent>
    </Dialog>
  );
};

export default OrderLineItemsModal;
