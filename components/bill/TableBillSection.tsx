import { images } from "@/lib/image";
import { CartItem } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { Image, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import Totals from "./Totals";

const TableBillSectionContent = ({ cart }: { cart: CartItem[] }) => {
    // State for managing expanded item
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    const handleToggleExpand = (itemId: string) => {
        setExpandedItemId(expandedItemId === itemId ? null : itemId);
    };

    return (
        <>
            <BillSummary
                cart={cart}
                expandedItemId={expandedItemId}
                onToggleExpand={handleToggleExpand}
            />
            <Totals cart={cart} />
        </>
    );
};

const TableBillSection = ({
    showOrderDetails = true,
}: {
    showOrderDetails?: boolean;
}) => {
    const { activeOrderId, orders } = useOrderStore();
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    const cart = activeOrder?.items || [];

    const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);

    const handleOpenDiscounts = () => {
        setDiscountOverlayVisible(true);
    };

    const handleCloseDiscounts = () => {
        setDiscountOverlayVisible(false);
    };

    return (
        <>
            <View className="max-w-96 bg-background-100 border-gray-200 flex-1">
                <Image source={images.topBar} className="w-full h-12" resizeMode="cover" />

                {showOrderDetails && <OrderDetails />}
                <TableBillSectionContent cart={cart} />
                <DiscountSection onOpenDiscounts={handleOpenDiscounts} />
                <DiscountOverlay
                    isVisible={isDiscountOverlayVisible}
                    onClose={handleCloseDiscounts}
                />
            </View>
        </>
    );
};

export default TableBillSection;
