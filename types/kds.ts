export interface KDSTicketModifier {
  modifier_name: string
  modifier_group_name: string
  price_modifier: number
  is_no?: boolean
}

export interface KDSTicketItem {
  id: string
  name: string
  quantity: number
  kitchen_status: string
  special_instructions: string | null
  modifiers: KDSTicketModifier[]
  category_name?: string
  category_id?: string
  menu_name?: string
  menu_id?: string
  prep_station?: string | null
  rush?: boolean
  is_prioritized?: boolean
  recalled?: boolean
  seat_number?: number | null
  is_voided?: boolean
  acknowledged?: boolean
  is_refunded?: boolean
  refunded_quantity?: number
}

export interface KDSTicket {
  ticket_id: string
  order_id: string
  db_order_id: string
  order_number: string | null
  display_number: string | null
  course_number: number
  status: 'pending' | 'cooking' | 'ready' | 'done'
  order_type: string | null
  order_source?: string | null
  delivery_platform?: string | null
  table_name: string | null
  customer_name: string | null
  order_notes?: string | null
  start_time: string | null
  start_time_epoch: number
  done_time_epoch?: number
  item_count: number
  items: KDSTicketItem[]
  prioritized?: boolean
  session_id?: string | null
}

export interface KDSDisplayConfig {
  displayName: string
  columns: number | null
  alertMinutes: number | null
  warningMinutes: number | null
  autoBumpMinutes: number | null
  soundOnNewOrder: boolean | null
  soundOnRush: boolean | null
  soundConfig: import('@/services/kds/kdsSoundService').KDSSoundConfig | null
  showAllergyFlags: boolean | null
  showOrderNotes: boolean | null
  showServerName: boolean | null
  fontScale: number | null
  showAllItems: boolean | null
}

export interface KDSRoutingRule {
  rule_type: 'prep_station' | 'category' | 'order_type'
  rule_value: string
}

export interface KDSEnrichedRoutingRule extends KDSRoutingRule {
  label: string
}
