// utils/orderCalculations.ts

import { CartItem } from "@/lib/types";

interface OrderTotals {
    // Card pricing (default)
    subtotal: number;
    taxAmount: number;
    total: number;
    
    // Cash pricing
    cashSubtotal: number;
    cashTaxAmount: number;
    cashTotal: number;
    
    // Outstanding (unpaid)
    outstandingSubtotal: number;
    outstandingTax: number;
    outstandingTotal: number;
    cashOutstandingSubtotal: number;
    cashOutstandingTax: number;
    cashOutstandingTotal: number;
    
    // Discounts
    discountAmount: number;
    
    // Savings
    cashSavings: number;
  }
  
  /**
   * SIMPLIFIED: Calculate order totals from pre-calculated item values
   * No per-item tax lookup needed - tax captured at add time
   */
  export function calculateOrderTotals(
    items: CartItem[],
    checkDiscount: { value: number } | null = null,
    serviceCharge: number = 0
  ): OrderTotals {
    const activeItems = items.filter(item => !item.is_voided);
    
    // 1. Sum pre-calculated values (no tax lookup needed!)
    let cardSubtotal = 0;
    let cashSubtotal = 0;
    let cardTax = 0;
    let cashTax = 0;
    let itemDiscounts = 0;
    
    // Outstanding (unpaid portions)
    let outstandingSubtotal = 0;
    let outstandingTax = 0;
    let cashOutstandingSubtotal = 0;
    let cashOutstandingTax = 0;
    
    for (const item of activeItems) {
      // Use pre-calculated values
      cardSubtotal += item.subtotal || (item.price * item.quantity);
      cashSubtotal += item.cashSubtotal || (item.cashPrice || item.price) * item.quantity;
      cardTax += item.taxAmount || 0;
      cashTax += item.cashTaxAmount || 0;
      
      // Item-level discounts
      if (item.appliedDiscount) {
        itemDiscounts += item.originalPrice * item.appliedDiscount.value * item.quantity;
      }
      
      // Outstanding (unpaid quantity)
      const unpaidQty = item.quantity - (item.paidQuantity || 0);
      if (unpaidQty > 0) {
        const unpaidRatio = unpaidQty / item.quantity;
        outstandingSubtotal += (item.subtotal || item.price * item.quantity) * unpaidRatio;
        outstandingTax += (item.taxAmount || 0) * unpaidRatio;
        cashOutstandingSubtotal += (item.cashSubtotal || (item.cashPrice || item.price) * item.quantity) * unpaidRatio;
        cashOutstandingTax += (item.cashTaxAmount || 0) * unpaidRatio;
      }
    }
    
    // 2. Apply check-level discount
    let checkDiscountAmount = 0;
    if (checkDiscount && cardSubtotal > 0) {
      checkDiscountAmount = cardSubtotal * checkDiscount.value;
    }
    const totalDiscount = itemDiscounts + checkDiscountAmount;
    
    // 3. Adjust for discounts
    cardSubtotal = Math.max(0, cardSubtotal - totalDiscount);
    cashSubtotal = Math.max(0, cashSubtotal - totalDiscount);
    
    // Proportionally reduce tax
    const discountRatio = totalDiscount / (cardSubtotal + totalDiscount) || 0;
    cardTax = round2(cardTax * (1 - discountRatio));
    cashTax = round2(cashTax * (1 - discountRatio));
    
    // 4. Calculate totals
    const cardTotal = cardSubtotal + cardTax + serviceCharge;
    const cashTotal = cashSubtotal + cashTax + serviceCharge;
    
    // Outstanding totals
    const outstandingDiscountRatio = cardSubtotal > 0 ? outstandingSubtotal / cardSubtotal : 0;
    const outstandingDiscount = totalDiscount * outstandingDiscountRatio;
    outstandingSubtotal = Math.max(0, outstandingSubtotal - outstandingDiscount);
    outstandingTax = round2(outstandingTax * (1 - discountRatio));
    cashOutstandingSubtotal = Math.max(0, cashOutstandingSubtotal - outstandingDiscount);
    cashOutstandingTax = round2(cashOutstandingTax * (1 - discountRatio));
    
    return {
      subtotal: round2(cardSubtotal),
      taxAmount: round2(cardTax),
      total: round2(cardTotal),
      
      cashSubtotal: round2(cashSubtotal),
      cashTaxAmount: round2(cashTax),
      cashTotal: round2(cashTotal),
      
      outstandingSubtotal: round2(outstandingSubtotal),
      outstandingTax: round2(outstandingTax),
      outstandingTotal: round2(outstandingSubtotal + outstandingTax),
      cashOutstandingSubtotal: round2(cashOutstandingSubtotal),
      cashOutstandingTax: round2(cashOutstandingTax),
      cashOutstandingTotal: round2(cashOutstandingSubtotal + cashOutstandingTax),
      
      discountAmount: round2(totalDiscount),
      cashSavings: round2(cardTotal - cashTotal),
    };
  }
  
  function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }