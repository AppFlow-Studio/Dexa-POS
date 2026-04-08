# Order Item CRUD Operations
## RPC Functions, Offline Support & Best Practices

### When to Use Each

| Use Case | Recommendation |
|----------|----------------|
| Simple read (list items) | `supabase.from().select()` ✅ |
| Simple create (no calculations) | Either works |
| Update with calculations | `supabase.rpc()` ✅ |
| Multi-table operations | `supabase.rpc()` ✅ |
| Operations needing validation | `supabase.rpc()` ✅ |
| Batch operations | `supabase.rpc()` ✅ |

---

## 📋 New RPC Functions Summary

| Function | Purpose | Key Feature |
|----------|---------|-------------|
| `update_order_item_quantity()` | Change quantity | Auto-recalculates subtotal |
| `update_order_item()` | Update multiple fields | Supports price override |
| `replace_order_item_modifiers()` | Swap all modifiers | Atomic replacement |
| `add_order_item_modifier()` | Add one modifier | Updates subtotal |
| `remove_order_item_modifier()` | Remove one modifier | Updates subtotal |
| `get_order_item()` | Get item + modifiers | Full details |
| `duplicate_order_item()` | Copy item | Includes modifiers |
| `clear_order_item_instructions()` | Clear notes | Simple operation |

---

## 💻 Usage Examples

### Update Quantity
```typescript
// Simple - just pass item ID and new quantity
const { data } = await supabase.rpc('update_order_item_quantity', {
  p_order_item_id: itemId,
  p_quantity: 3
});

// Response includes recalculated subtotal
console.log(data);
// {
//   success: true,
//   order_item_id: "uuid",
//   quantity: 3,
//   price_paid: 12.99,
//   modifier_total: 2.50,
//   new_subtotal: 46.47  // (3 × 12.99) + (3 × 2.50)
// }
```

### Update Multiple Fields
```typescript
const { data } = await supabase.rpc('update_order_item', {
  p_order_item_id: itemId,
  p_quantity: 2,
  p_special_instructions: 'Extra crispy, no onions',
  p_prep_station: 'Grill',
  p_course_number: 2
});
```

### Manager Price Override
```typescript
// Requires 'location.orders.override_price' or 'merchant.orders.manage' permission
const { data } = await supabase.rpc('update_order_item', {
  p_order_item_id: itemId,
  p_price_override: 9.99  // Override the price
});
```

### Replace All Modifiers
```typescript
// Customer changed their mind - replace all toppings
const { data } = await supabase.rpc('replace_order_item_modifiers', {
  p_order_item_id: itemId,
  p_modifiers: [
    {
      modifier_group_id: 'uuid-1',
      modifier_item_id: 'uuid-1a',
      modifier_group_name: 'Toppings',
      modifier_name: 'Mushrooms',
      price_modifier: 1.50,
      quantity: 1
    },
    {
      modifier_group_id: 'uuid-1',
      modifier_item_id: 'uuid-1b',
      modifier_group_name: 'Toppings',
      modifier_name: 'Peppers',
      price_modifier: 1.00,
      quantity: 2
    }
  ]
});
// Atomically: deletes old modifiers, inserts new ones, recalculates subtotal
```

### Add Single Modifier
```typescript
// Customer wants to add bacon
const { data } = await supabase.rpc('add_order_item_modifier', {
  p_order_item_id: itemId,
  p_modifier_group_id: 'uuid',
  p_modifier_item_id: 'uuid',
  p_modifier_group_name: 'Add-ons',
  p_modifier_name: 'Bacon',
  p_price_modifier: 2.50,
  p_quantity: 1
});
```

### Remove Single Modifier
```typescript
// Customer doesn't want cheese anymore
const { data } = await supabase.rpc('remove_order_item_modifier', {
  p_modifier_id: modifierId
});
```

### Duplicate Item
```typescript
// "Same again" - duplicate with same modifiers
const { data } = await supabase.rpc('duplicate_order_item', {
  p_order_item_id: itemId,
  p_quantity: 1  // Optional: different quantity
});
// data.new_item_id = new item with copied modifiers
```

---

## 📴 Offline Mode Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ONLINE FLOW                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User Action → supabase.rpc() → Supabase DB → Response → UI        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      OFFLINE FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User Action                                                        │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ Optimistic      │ ──► Update local cache ──► UI shows change   │
│   │ Update          │                                               │
│   └─────────────────┘                                               │
│        │                                                             │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ Queue Operation │ ──► AsyncStorage (pending_operations)        │
│   └─────────────────┘                                               │
│        │                                                             │
│        │  ... later when online ...                                  │
│        ▼                                                             │
│   ┌─────────────────┐                                               │
│   │ Sync Queue      │ ──► supabase.rpc() for each operation        │
│   └─────────────────┘                                               │
│        │                                                             │
│        ▼                                                             │
│   Refresh from server                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

#### 1. Optimistic Updates
Show the change immediately, sync later.

```typescript
// User taps +1 quantity while offline
await orderItemService.updateQuantity(itemId, 3, orderId);

// Internally:
// 1. Update local cache (instant UI feedback)
// 2. Queue operation for later sync
// 3. Return success with isOffline: true
```

#### 2. Operation Queue
Store operations in AsyncStorage, replay when online.

```typescript
// Queue structure
interface OfflineOperation {
  id: string;                    // Unique operation ID
  type: 'update_quantity';       // Operation type
  params: { itemId, quantity };  // Original parameters
  timestamp: string;             // When queued
  status: 'pending' | 'synced';  // Sync status
  affectedItemId: string;        // For conflict resolution
}
```

#### 3. Temporary IDs
Offline-created items get temporary IDs until synced.

```typescript
// Offline item ID format
const tempId = `TEMP-${uuidv4()}`;
// Example: "TEMP-a1b2c3d4-e5f6-7890-abcd-ef1234567890"

// After sync, replaced with real UUID from server
```

#### 4. Auto-Sync on Reconnect
Listen for network changes and sync automatically.

```typescript
// In useOrderItems hook
useEffect(() => {
  if (isOnline && pendingSync > 0) {
    orderItemService.syncOfflineOperations().then(() => {
      loadItems();  // Refresh from server
    });
  }
}, [isOnline, pendingSync]);
```

---

## 🎯 Using the Service in Your POS

### Basic Setup

```typescript
import { useOrderItems } from './OrderItemService';

function OrderScreen({ orderId }: { orderId: string }) {
  const {
    items,
    loading,
    error,
    isOnline,
    pendingSync,
    // Actions
    addItem,
    updateQuantity,
    updateItem,
    replaceModifiers,
    voidItem,
    duplicateItem,
    syncNow
  } = useOrderItems(orderId);

  // Show offline indicator
  if (!isOnline) {
    return (
      <View style={styles.offlineBanner}>
        <Text>📴 Offline Mode - {pendingSync} changes pending</Text>
        <Button title="Sync Now" onPress={syncNow} disabled={!isOnline} />
      </View>
    );
  }

  // ... rest of UI
}
```

### Quantity Stepper Component

```tsx
function QuantityStepper({ item }: { item: OrderItem }) {
  const { updateQuantity, voidItem } = useOrderItems(item.order_id);
  const [updating, setUpdating] = useState(false);

  const handleIncrement = async () => {
    setUpdating(true);
    try {
      await updateQuantity(item.id, item.quantity + 1);
    } finally {
      setUpdating(false);
    }
  };

  const handleDecrement = async () => {
    if (item.quantity === 1) {
      // Confirm before removing
      Alert.alert(
        'Remove Item?',
        `Remove ${item.item_name} from order?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Remove', 
            style: 'destructive',
            onPress: () => voidItem(item.id, 'Customer removed')
          }
        ]
      );
    } else {
      setUpdating(true);
      try {
        await updateQuantity(item.id, item.quantity - 1);
      } finally {
        setUpdating(false);
      }
    }
  };

  return (
    <View style={styles.stepper}>
      <TouchableOpacity onPress={handleDecrement} disabled={updating}>
        <Text style={styles.stepperButton}>−</Text>
      </TouchableOpacity>
      
      <Text style={styles.quantity}>{item.quantity}</Text>
      
      <TouchableOpacity onPress={handleIncrement} disabled={updating}>
        <Text style={styles.stepperButton}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Edit Modifiers Modal

```tsx
function EditModifiersModal({ 
  item, 
  visible, 
  onClose 
}: { 
  item: OrderItem; 
  visible: boolean;
  onClose: () => void;
}) {
  const { replaceModifiers } = useOrderItems(item.order_id);
  const [selectedModifiers, setSelectedModifiers] = useState(item.modifiers || []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await replaceModifiers(item.id, selectedModifiers);
      
      if (result.isOffline) {
        Alert.alert('Saved Offline', 'Changes will sync when online.');
      }
      
      onClose();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleModifier = (modifier: Modifier, group: ModifierGroup) => {
    setSelectedModifiers(prev => {
      const existing = prev.find(m => m.modifier_item_id === modifier.id);
      
      if (existing) {
        // Remove
        return prev.filter(m => m.modifier_item_id !== modifier.id);
      } else {
        // Add
        return [...prev, {
          modifier_group_id: group.id,
          modifier_item_id: modifier.id,
          modifier_group_name: group.name,
          modifier_name: modifier.name,
          price_modifier: modifier.price_modifier,
          quantity: 1
        }];
      }
    });
  };

  return (
    <Modal visible={visible} onRequestClose={onClose}>
      <View style={styles.modal}>
        <Text style={styles.title}>Edit Modifiers for {item.item_name}</Text>
        
        {/* Modifier groups from menu */}
        {modifierGroups.map(group => (
          <View key={group.id}>
            <Text style={styles.groupName}>{group.name}</Text>
            {group.items.map(modifier => (
              <TouchableOpacity
                key={modifier.id}
                onPress={() => toggleModifier(modifier, group)}
                style={[
                  styles.modifierItem,
                  selectedModifiers.some(m => m.modifier_item_id === modifier.id) && 
                    styles.modifierSelected
                ]}
              >
                <Text>{modifier.name}</Text>
                <Text>+${modifier.price_modifier.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        
        <View style={styles.actions}>
          <Button title="Cancel" onPress={onClose} />
          <Button 
            title={saving ? 'Saving...' : 'Save Changes'} 
            onPress={handleSave}
            disabled={saving}
          />
        </View>
      </View>
    </Modal>
  );
}
```

### Special Instructions Input

```tsx
function SpecialInstructionsInput({ item }: { item: OrderItem }) {
  const { updateItem } = useOrderItems(item.order_id);
  const [instructions, setInstructions] = useState(item.special_instructions || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateItem({
        orderItemId: item.id,
        specialInstructions: instructions || null
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.instructionsContainer}>
      <TextInput
        style={styles.textInput}
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Special instructions..."
        multiline
        onBlur={handleSave}  // Auto-save on blur
      />
      {saving && <ActivityIndicator size="small" />}
    </View>
  );
}
```

---

## 🔄 Sync Status UI Component

```tsx
function SyncStatusBar() {
  const { isOnline, pendingSync, syncNow } = useOrderItems(orderId);

  if (isOnline && pendingSync === 0) {
    return null; // All synced, hide bar
  }

  return (
    <View style={[
      styles.syncBar,
      isOnline ? styles.syncBarOnline : styles.syncBarOffline
    ]}>
      <View style={styles.syncInfo}>
        <Text style={styles.syncIcon}>
          {isOnline ? '🔄' : '📴'}
        </Text>
        <Text style={styles.syncText}>
          {isOnline 
            ? `Syncing ${pendingSync} changes...`
            : `Offline - ${pendingSync} changes pending`
          }
        </Text>
      </View>
      
      {isOnline && pendingSync > 0 && (
        <TouchableOpacity onPress={syncNow} style={styles.syncButton}>
          <Text>Sync Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

---

## ⚠️ Important Considerations

### 1. Conflict Resolution
The last-write-wins strategy is used. For more complex scenarios:

```typescript
// Option: Add version check
const { data } = await supabase.rpc('update_order_item', {
  p_order_item_id: itemId,
  p_quantity: newQuantity,
  p_expected_version: item.version  // Optimistic locking
});
```

### 2. Offline Limitations
- ❌ Cannot process card payments offline
- ❌ Cannot validate inventory/stock offline
- ❌ Temp IDs need replacement after sync
- ✅ Can add/update/void items offline
- ✅ Can process cash payments offline

### 3. Cache Freshness
Pre-cache menu and order data for offline use:

```typescript
// On app start or order open
const cacheOrderForOffline = async (orderId: string) => {
  // Cache order items
  const items = await orderItemService.getOrderItems(orderId);
  
  // Cache menu (for adding new items offline)
  const menu = await supabase.rpc('get_menu_with_categories', {
    p_menu_id: menuId,
    p_location_id: locationId
  });
  await AsyncStorage.setItem(`menu_${menuId}`, JSON.stringify(menu.data));
};
```

---

## ✅ Summary

| Feature | Implementation |
|---------|----------------|
| Update quantity | `update_order_item_quantity()` RPC |
| Update details | `update_order_item()` RPC |
| Replace modifiers | `replace_order_item_modifiers()` RPC |
| Add modifier | `add_order_item_modifier()` RPC |
| Remove modifier | `remove_order_item_modifier()` RPC |
| Void item | `void_order_item()` RPC |
| Duplicate item | `duplicate_order_item()` RPC |
| Offline support | `OrderItemService` with queue |
| Auto-sync | NetInfo listener + queue |

**Key takeaway:** Use RPC for operations that involve calculations, multi-table updates, or business logic validation. Use direct API calls for simple reads.