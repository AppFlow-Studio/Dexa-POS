interface DiscountResult {
    success: boolean;
    error?: string;
    requires_approval?: boolean;
    action?: string;
    order_discount_id?: string;
    calculated_amount?: number;
    discount?: {
      id: string;
      discount_id: string | null;
      discount_name: string;
      discount_type: DiscountType;
      discount_value: number;
      source: DiscountSource;
      calculated_amount: number;
      applied_to_item_ids: string[] | null;
    };
    order?: OrderState;
    affected_items?: Array<{
      id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      cash_price: number;
      discount_amount: number;
      subtotal: number;
      cash_subtotal: number;
      tax_amount: number;
      cash_tax_amount: number;
    }>;
    active_discounts?: OrderDiscountRecord[];
  }