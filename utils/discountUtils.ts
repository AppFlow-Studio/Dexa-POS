import type { Discount, OrderAppliedDiscount, OrderProfile } from '@/lib/types'

/**
 * Transform backend order_discounts rows into OrderProfile discount fields.
 * Pure function — no store dependencies.
 *
 * Used by:
 * - orderTransformers.ts (eager load from initial queries)
 * - useOrderStore.ts (lazy load from syncOrderFromBackendComplete)
 */
export function restoreDiscountsFromBackend (
  orderDiscounts: any[]
): Pick<OrderProfile, 'checkDiscount' | 'applied_discounts'> {
  if (!orderDiscounts || orderDiscounts.length === 0) {
    return { checkDiscount: null, applied_discounts: [] }
  }

  // Build applied_discounts array
  const applied_discounts: OrderAppliedDiscount[] = orderDiscounts.map(
    (od: any) => ({
      local_id: `synced_${od.id}`,
      order_discount_id: od.id,
      discount_id: od.discount_id || null,
      discount_name: od.discount_name || 'Discount',
      discount_type:
        od.discount_type === 'percentage'
          ? 'percentage'
          : ('fixed_amount' as const),
      discount_value: od.discount_value,
      source: od.source || ('preset' as const),
      calculated_amount: od.calculated_amount || 0,
      pre_discount_subtotal: od.pre_discount_subtotal || 0,
      applied_by_staff_profiles_id: od.applied_by_staff_profiles_id || null,
      approved_by_staff_profiles_id: od.approved_by_staff_profiles_id || null,
      applied_at: od.applied_at || od.created_at,
      applied_to_item_ids: od.applied_to_item_ids || [],
      sync_status: 'synced' as const
    })
  )

  // Build checkDiscount from the first active discount
  // This is what the UI reads for the discount badge
  const primary = orderDiscounts[0]
  const checkDiscount: Discount = {
    id: primary.discount_id || primary.id,
    label: primary.discount_name || 'Discount',
    value:
      primary.discount_type === 'percentage'
        ? primary.discount_value / 100 // DB stores 5 for 5%, local needs 0.05
        : primary.discount_value,
    type: primary.discount_type === 'percentage' ? 'percentage' : 'fixed'
  }

  return { checkDiscount, applied_discounts }
}
