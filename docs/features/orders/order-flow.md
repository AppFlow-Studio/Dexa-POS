# Optimized Order Functions - Pre-Calculated Prices

## 🎯 Why Pass Prices from POS?

### The Old Way (Redundant)
```
POS: get_menu_with_categories() → calculates effective_price
POS: Shows $12.99 to cashier
Cashier: Adds item to order
DB: add_order_item() → recalculates price with 5-level hierarchy joins
Result: Same $12.99 (wasted database work!)
```

### The New Way (Optimized)
```
POS: get_menu_with_categories() → calculates effective_price ($12.99)
POS: Shows $12.99 to cashier
Cashier: Adds item to order
DB: add_order_item(price=$12.99) → stores it directly
Result: $12.99 (fast, no redundant joins!)
```

-

## 📋 Updated Function Signatures

### `add_order_item()` - Now accepts pre-calculated prices

```sql
public.add_order_item(
  -- Order reference
  p_order_id UUID,
  
  -- Item identification (for audit/reference)
  p_menu_item_id UUID,                    -- Optional: link to menu_items
  p_location_exclusive_item_id UUID,      -- Optional: link to location_exclusive_items
  
  -- PRE-CALCULATED from get_menu_with_categories:
  p_item_name TEXT,                       -- menu_item.name
  p_item_description TEXT,                -- menu_item.description
  p_category_name TEXT,                   -- category.name
  p_unit_price NUMERIC(10,2),             -- effective_price
  p_cash_price NUMERIC(10,2),             -- effective_cash_price
  p_use_cash_price BOOLEAN DEFAULT TRUE,  -- Which price to use
  
  -- Quantity
  p_quantity INTEGER DEFAULT 1,
  
  -- Size (pre-calculated)
  p_selected_size_id UUID,
  p_selected_size_name TEXT,
  p_size_price_modifier NUMERIC(10,2),
  
  -- Instructions
  p_special_instructions TEXT,
  
  -- Modifiers (pre-calculated prices!)
  p_modifiers JSONB,
  
  -- Optional prep info
  p_prep_station TEXT,
  p_course_number INTEGER
)
```

---

## 💻 React Native Usage Examples

### Example 1: Add Single Item

```typescript
// Item from get_menu_with_categories (already has effective prices)
const menuItem = {
  id: 'item-uuid',
  menu_item: {
    id: 'menu-item-uuid',
    name: 'Margherita Pizza',
    description: 'Classic tomato and mozzarella',
    effective_price: 14.99,        // ← Already calculated!
    effective_cash_price: 13.99,   // ← Already calculated!
    modifier_groups: [...]
  },
  category: {
    id: 'cat-uuid',
    name: 'Pizzas'
  }
};

// Selected modifiers (prices already from get_menu_with_categories)
const selectedModifiers = [
  {
    modifier_group_id: 'group-uuid-1',
    modifier_item_id: 'mod-uuid-1',
    modifier_group_name: 'Extra Toppings',
    modifier_name: 'Pepperoni',
    price_modifier: 2.50,  // ← Pre-calculated from POS
    quantity: 1
  },
  {
    modifier_group_id: 'group-uuid-2',
    modifier_item_id: 'mod-uuid-2',
    modifier_group_name: 'Size',
    modifier_name: 'Large',
    price_modifier: 4.00,  // ← Pre-calculated from POS
    quantity: 1
  }
];

// Call the function - pass the pre-calculated prices
const { data, error } = await supabase.rpc('add_order_item', {
  p_order_id: orderId,
  p_menu_item_id: menuItem.menu_item.id,
  p_item_name: menuItem.menu_item.name,
  p_item_description: menuItem.menu_item.description,
  p_category_name: menuItem.category.name,
  p_unit_price: menuItem.menu_item.effective_price,      // PRE-CALCULATED
  p_cash_price: menuItem.menu_item.effective_cash_price, // PRE-CALCULATED
  p_use_cash_price: true,  // Use cash price (dual pricing)
  p_quantity: 2,
  p_modifiers: selectedModifiers
});

// Result:
// {
//   success: true,
//   order_item_id: 'uuid',
//   item_name: 'Margherita Pizza',
//   quantity: 2,
//   unit_price: 14.99,
//   cash_price: 13.99,
//   price_paid: 13.99,  // Used cash price
//   modifier_total: 6.50,
//   subtotal: 40.98  // (13.99 + 6.50) * 2
// }
```

### Example 2: Add Multiple Items (Batch)

```typescript
// More efficient for adding multiple items at once
const cartItems = [
  {
    menu_item_id: 'item-1',
    item_name: 'Margherita Pizza',
    item_description: 'Classic',
    category_name: 'Pizzas',
    unit_price: 14.99,
    cash_price: 13.99,
    use_cash_price: true,
    quantity: 1,
    modifiers: [
      { modifier_name: 'Extra Cheese', price_modifier: 2.00, quantity: 1 }
    ]
  },
  {
    menu_item_id: 'item-2',
    item_name: 'Caesar Salad',
    item_description: 'Fresh romaine',
    category_name: 'Salads',
    unit_price: 9.99,
    cash_price: 8.99,
    use_cash_price: true,
    quantity: 2,
    modifiers: []
  },
  {
    menu_item_id: 'item-3',
    item_name: 'Coke',
    category_name: 'Beverages',
    unit_price: 2.99,
    cash_price: 2.49,
    use_cash_price: true,
    quantity: 2,
    modifiers: []
  }
];

// Single call adds all items
const { data, error } = await supabase.rpc('add_order_items_batch', {
  p_order_id: orderId,
  p_items: cartItems
});

// Result:
// {
//   success: true,
//   order_id: 'uuid',
//   items_added: 3,
//   item_ids: ['uuid-1', 'uuid-2', 'uuid-3'],
//   batch_total: 42.95
// }
```

### Example 3: Full Order Flow

```typescript
// 1. Create order
const orderResult = await supabase.rpc('create_order', {
  p_merchant_id: merchantId,
  p_location_id: locationId,
  p_order_type: 'dine_in',
  p_table_number: '12'
});
const orderId = orderResult.data.order_id;

// 2. Add items from cart (prices pre-calculated by get_menu_with_categories)
for (const cartItem of cart) {
  await supabase.rpc('add_order_item', {
    p_order_id: orderId,
    p_menu_item_id: cartItem.menuItemId,
    p_item_name: cartItem.name,
    p_unit_price: cartItem.effectivePrice,      // From menu
    p_cash_price: cartItem.effectiveCashPrice,  // From menu
    p_use_cash_price: useDualPricing,
    p_quantity: cartItem.quantity,
    p_modifiers: cartItem.selectedModifiers.map(m => ({
      modifier_group_id: m.groupId,
      modifier_item_id: m.itemId,
      modifier_group_name: m.groupName,
      modifier_name: m.name,
      price_modifier: m.price,  // Already from menu
      quantity: m.quantity
    }))
  });
}

// 3. Calculate tax
await supabase.rpc('calculate_order_tax', {
  p_order_id: orderId,
  p_tax_rate: 0.08875  // NYC rate
});

// 4. Send to kitchen
await supabase.rpc('update_order_status', {
  p_order_id: orderId,
  p_new_status: 'pending'
});

// 5. Process payment
await supabase.rpc('process_payment', {
  p_order_id: orderId,
  p_payment_method: 'cash',
  p_amount: totalAmount,
  p_tip_amount: tipAmount
});
```

---

## 📊 Modifier Format

The `p_modifiers` JSONB array expects this structure:

```typescript
interface OrderModifier {
  modifier_group_id: string;      // UUID of modifier group
  modifier_item_id: string;       // UUID of modifier item
  modifier_group_name: string;    // "Extra Toppings" (denormalized)
  modifier_name: string;          // "Pepperoni" (denormalized)
  price_modifier: number;         // 2.50 (PRE-CALCULATED from menu!)
  quantity: number;               // 1
}
```

**Important:** The `price_modifier` comes directly from `get_menu_with_categories`:
```json
{
  "modifier_groups": [{
    "items": [{
      "id": "mod-uuid",
      "name": "Pepperoni",
      "price_modifier": 2.50  // ← Use this value!
    }]
  }]
}
```

---

## 🔄 Price Cascade Reference

Your `get_menu_with_categories` already calculates prices using the 5-level hierarchy:

```sql
-- L5 > L4 > L3 > L2 > L1
effective_price = COALESCE(
  lmio.custom_price,           -- L5: Location + Menu + Item
  lcio.custom_price,           -- L4: Location + Category + Item
  ci.custom_price,             -- L3: Category + Item
  -- L2: Location + Item (with modifier logic)
  CASE 
    WHEN lio.price_modifier_type = 'add' THEN mi.price + lio.price_modifier
    WHEN lio.price_modifier_type = 'percent' THEN mi.price * (1 + lio.price_modifier/100)
    WHEN lio.custom_price IS NOT NULL THEN lio.custom_price
    ELSE NULL
  END,
  mi.price                     -- L1: Base price
)
```

**The POS shows this `effective_price` to the cashier - that's what gets passed to `add_order_item()`.**

---

## ✅ Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| **Speed** | No complex joins on every item add |
| **Simplicity** | Function just stores what it receives |
| **Consistency** | Price shown = price charged |
| **Accuracy** | Snapshot of price at time of order |
| **Audit Trail** | Still stores menu_item_id for reference |
| **Flexibility** | Can handle any pricing structure |

---

## 🛡️ What About Stale Prices?

Q: *What if the menu price changed between when the POS loaded the menu and when they added the item?*

A: This is actually the **correct behavior** for a POS:
- The cashier sees $14.99
- The customer sees $14.99 on the display
- The receipt should show $14.99
- Even if the menu changed 1 minute ago, honor the displayed price

This is standard POS behavior - you always charge what was displayed.

For extra safety, you could:
1. Refresh menu periodically (every 5-15 minutes)
2. Add a `menu_version` field to track when menu was loaded
3. Force refresh at start of each shift

---

## 📝 Summary

**Old approach (redundant):**
```
Menu → POS calculates price → DB recalculates same price → Store
```

**New approach (optimized):**
```
Menu → POS calculates price → DB stores it directly
```

**Why it's correct:**
1. POS is a trusted client
2. get_menu_with_categories already did the work
3. Speed matters at checkout
4. Price displayed = price charged (good UX)
5. Denormalized data preserves order history

**Just pass `effective_price` and `effective_cash_price` from the menu to `add_order_item()`!**