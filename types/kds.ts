export interface KDSTicketModifier {
  modifier_name: string;
  modifier_group_name: string;
  price_modifier: number;
}

export interface KDSTicketItem {
  id: string;
  name: string;
  quantity: number;
  kitchen_status: string;
  special_instructions: string | null;
  modifiers: KDSTicketModifier[];
  category_name?: string;
  category_id?: string;
  menu_name?: string;
  menu_id?: string;
}

export interface KDSTicket {
  ticket_id: string;
  order_id: string;
  db_order_id: string;
  order_number: string | null;
  display_number: string | null;
  course_number: number;
  status: "pending" | "cooking" | "ready";
  order_type: string | null;
  table_name: string | null;
  customer_name: string | null;
  start_time: string | null;
  item_count: number;
  items: KDSTicketItem[];
}
