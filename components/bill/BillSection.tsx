import React from "react";
import { ScrollView } from "react-native";
import BillSummary from "./BillSummary";
import DiscountSection from "./DiscountSection";
import OrderDetails from "./OrderDetails";
import PaymentActions from "./PaymentActions";
import Totals from "./Totals";

const BillSection = () => {
  return (
    <ScrollView
      className="max-w-96 bg-background-100 border-gray-200"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <OrderDetails />
      <BillSummary />
      <Totals />
      <DiscountSection />
      <PaymentActions />
    </ScrollView>
  );
};

export default BillSection;
