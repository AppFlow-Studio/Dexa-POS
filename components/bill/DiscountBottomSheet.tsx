import { useToast } from "@/contexts/ToastContext";
import { useDiscounts } from "@/hooks/useDiscounts";
import {
  EligibilityContext,
  getEligibleDiscounts,
} from "@/services/discountEligibility";
import { getDailyUsageCounts } from "@/services/discountUsageTracker";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Check, Tag, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

interface DiscountBottomSheetProps {
  onClose: () => void;
}

const DiscountBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  DiscountBottomSheetProps
> = ({ onClose }, ref) => {
  // FIX 1: Use 100% as the max height.
  // 90% causes the keyboard to overlap the input on some Android screens.
  const snapPoints = useMemo(() => ["50%", "100%"], []);
  const [activeTab, setActiveTab] = useState<"check" | "items">("check");

  // Custom discount state
  const [customDiscountType, setCustomDiscountType] = useState<
    "percentage" | "fixed"
  >("percentage");
  const [customDiscountValue, setCustomDiscountValue] = useState("");

  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const applyDiscountToCheck = useOrderStore((s) => s.applyDiscountToCheck);
  const applyDiscountToItem = useOrderStore((s) => s.applyDiscountToItem);
  const removeDiscountFromItem = useOrderStore((s) => s.removeDiscountFromItem);
  const removeCheckDiscount = useOrderStore((s) => s.removeCheckDiscount);
  const { show } = useToast();

  const { data: discounts = [] } = useDiscounts();

  const activeOrder = useActiveOrder();
  const cartItems = activeOrder?.items || [];
  const itemsWithAvailableDiscounts = cartItems.filter(
    (item) => !!item.availableDiscount,
  );

  const eligibilityResults = useMemo(() => {
    if (!activeOrder) return [];
    const items = cartItems.map((item) => ({
      id: item.id,
      menu_item_id: item.menuItemId,
      category_id: item.category_name || undefined,
      is_alcohol: false,
      item_total: item.price * item.quantity,
    }));
    const ctx: EligibilityContext = {
      orderType:
        activeOrder.order_type === "dine_in"
          ? "dine_in"
          : activeOrder.order_type === "delivery"
            ? "delivery"
            : "takeout",
      currentDate: new Date(),
      dailyUsageCounts: getDailyUsageCounts(),
      subtotal: items.reduce((sum, i) => sum + i.item_total, 0),
      items,
    };
    return getEligibleDiscounts(discounts as any, ctx);
  }, [activeOrder, cartItems, discounts]);

  const handleApplyCheckDiscount = (discount: any) => {
    if (!activeOrderId) return;

    const existingCheckDiscount = activeOrder?.checkDiscount as any;
    const existingNonStackable =
      existingCheckDiscount && existingCheckDiscount.stackable === false;
    const incomingNonStackable = (discount as any)?.stackable === false;

    // Enforce non-stackable rule: block applying when a non-stackable exists or incoming is non-stackable
    if (
      existingCheckDiscount &&
      (existingNonStackable || incomingNonStackable)
    ) {
      show({
        title: "Cannot stack discounts",
        message: "Remove the existing discount before applying this one.",
        type: "error",
      });
      return;
    }

    applyDiscountToCheck(activeOrderId, discount as any);
    onClose();
  };

  const handleRemoveCheckDiscount = () => {
    if (!activeOrderId) return;
    removeCheckDiscount(activeOrderId);
    onClose();
  };

  const handleApplyCustomDiscount = () => {
    if (!activeOrderId || !customDiscountValue) return;

    const numericValue = parseFloat(customDiscountValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      show({
        title: "Invalid discount",
        message: "Please enter a valid discount amount.",
        type: "error",
      });
      return;
    }

    // Validate percentage doesn't exceed 100%
    if (customDiscountType === "percentage" && numericValue > 100) {
      show({
        title: "Invalid percentage",
        message: "Percentage discount cannot exceed 100%.",
        type: "error",
      });
      return;
    }

    // Create a custom discount object compatible with applyDiscountToCheck
    const customDiscount = {
      id: `custom_${Date.now()}`,
      label:
        customDiscountType === "percentage"
          ? `Custom ${numericValue}% Off`
          : `Custom $${numericValue.toFixed(2)} Off`,
      value:
        customDiscountType === "percentage"
          ? numericValue / 100 // Convert to decimal for percentage
          : numericValue,
      type: customDiscountType,
    };

    applyDiscountToCheck(activeOrderId, customDiscount as any);

    // Reset custom discount form
    setCustomDiscountValue("");

    onClose();
  };

  const handleToggleItemDiscount = (itemInCart: any) => {
    if (!activeOrderId) return;
    if (itemInCart.appliedDiscount) {
      removeDiscountFromItem(activeOrderId, itemInCart.id);
    } else {
      applyDiscountToItem(activeOrderId, itemInCart.id);
    }
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    [],
  );

  const isCustomValid = !!customDiscountValue && parseFloat(customDiscountValue) > 0;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      {...bottomSheetTheme}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={60}
    >
      <BottomSheetScrollView style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* ── Header ── */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.teal + "15",
              alignItems: "center", justifyContent: "center",
            }}>
              <Tag size={14} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              Apply Discount
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 6, borderRadius: 10,
              backgroundColor: colors.teal + "10",
              borderWidth: 1, borderColor: colors.teal + "30",
            }}
          >
            <X size={16} color={colors.teal} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
          {/* ── Active discount banner ── */}
          {activeOrder?.checkDiscount && (
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12, padding: 10,
              borderRadius: 10,
              backgroundColor: colors.teal + "10",
              borderWidth: 1, borderColor: colors.teal + "30",
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                  {activeOrder.checkDiscount.label || "Active Discount"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.teal + "99", marginTop: 1 }}>
                  {activeOrder.checkDiscount.type === "percentage"
                    ? `${Math.round((activeOrder.checkDiscount.value || 0) * 100)}% off`
                    : `$${activeOrder.checkDiscount.value?.toFixed(2)} off`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleRemoveCheckDiscount}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: colors.danger + "15",
                  borderWidth: 1, borderColor: colors.danger + "30",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger }}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Tabs ── */}
          <View style={{
            flexDirection: "row",
            backgroundColor: colors.screen,
            borderRadius: 10, padding: 3,
            borderWidth: 1, borderColor: colors.border,
            marginBottom: 14,
          }}>
            {(["check", "items"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center",
                  backgroundColor: activeTab === tab ? colors.card : "transparent",
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: "600",
                  color: activeTab === tab ? colors.heading : colors.muted,
                }}>
                  {tab === "check" ? "Whole Check" : "Specific Items"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Whole Check tab ── */}
          {activeTab === "check" && (
            <View>
              {/* Custom discount section label */}
              <Text style={{
                fontSize: 11, fontWeight: "600", color: colors.muted,
                textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8,
              }}>
                Custom Discount
              </Text>

              <View style={{
                backgroundColor: colors.card,
                borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                padding: 12, marginBottom: 16,
              }}>
                {/* Type toggle */}
                <View style={{
                  flexDirection: "row",
                  backgroundColor: colors.screen,
                  borderRadius: 8, padding: 3,
                  marginBottom: 12,
                }}>
                  <TouchableOpacity
                    onPress={() => setCustomDiscountType("percentage")}
                    style={{
                      flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center",
                      backgroundColor: customDiscountType === "percentage" ? colors.teal : "transparent",
                    }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: "600",
                      color: customDiscountType === "percentage" ? colors.onSolid : colors.muted,
                    }}>
                      % Percentage
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCustomDiscountType("fixed")}
                    style={{
                      flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: "center",
                      backgroundColor: customDiscountType === "fixed" ? colors.success : "transparent",
                    }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: "600",
                      color: customDiscountType === "fixed" ? colors.onSolid : colors.muted,
                    }}>
                      $ Fixed Amount
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Quick preset pills */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {[5, 10, 15, 20, 25, 50].map((val) => {
                    const isSelected = customDiscountValue === val.toString();
                    const accentColor = customDiscountType === "percentage" ? colors.teal : colors.success;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setCustomDiscountValue(val.toString())}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                          backgroundColor: isSelected ? accentColor + "20" : colors.screen,
                          borderWidth: 1,
                          borderColor: isSelected ? accentColor + "60" : colors.border,
                        }}
                      >
                        <Text style={{
                          fontSize: 12, fontWeight: "600",
                          color: isSelected ? accentColor : colors.label,
                        }}>
                          {customDiscountType === "percentage" ? `${val}%` : `$${val}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Input + Apply */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{
                    flex: 1, flexDirection: "row", alignItems: "center",
                    backgroundColor: colors.screen,
                    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                    paddingHorizontal: 10,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.muted, marginRight: 4 }}>
                      {customDiscountType === "percentage" ? "%" : "$"}
                    </Text>
                    <BottomSheetTextInput
                      value={customDiscountValue}
                      onChangeText={setCustomDiscountValue}
                      placeholder={customDiscountType === "percentage" ? "0" : "0.00"}
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: colors.heading }}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={handleApplyCustomDiscount}
                    disabled={!isCustomValid}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8,
                      backgroundColor: isCustomValid
                        ? (customDiscountType === "percentage" ? colors.teal : colors.success)
                        : colors.border,
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: "700",
                      color: isCustomValid ? colors.onSolid : colors.muted,
                    }}>
                      Apply
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Preview */}
                {isCustomValid && (
                  <View style={{
                    marginTop: 10, padding: 8, borderRadius: 8,
                    backgroundColor: colors.screen,
                    borderWidth: 1, borderColor: colors.border,
                    borderStyle: "dashed",
                  }}>
                    <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
                      Saves{" "}
                      <Text style={{ color: colors.success, fontWeight: "700" }}>
                        {customDiscountType === "percentage"
                          ? `${customDiscountValue}% off`
                          : `$${parseFloat(customDiscountValue).toFixed(2)} off`}
                      </Text>
                    </Text>
                  </View>
                )}
              </View>

              {/* Preset discounts */}
              <Text style={{
                fontSize: 11, fontWeight: "600", color: colors.muted,
                textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8,
              }}>
                Preset Discounts
              </Text>

              {eligibilityResults.length === 0 ? (
                <Text style={{ fontSize: 13, color: colors.muted, paddingVertical: 8 }}>
                  No preset discounts available
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {eligibilityResults.map((d) => (
                    <TouchableOpacity
                      key={d.discount.id}
                      disabled={!d.eligible}
                      onPress={() => handleApplyCheckDiscount(d.discount)}
                      style={{
                        padding: 10, borderRadius: 10,
                        borderWidth: 1,
                        backgroundColor: d.eligible ? colors.teal + "10" : colors.screen,
                        borderColor: d.eligible ? colors.teal + "40" : colors.border,
                        opacity: d.eligible ? 1 : 0.55,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                            {d.discount.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>
                            {d.discount.discount_type === "percentage"
                              ? `${d.discount.discount_value}% off`
                              : `$${d.discount.discount_value.toFixed(2)} off`}
                          </Text>
                        </View>
                        {d.eligible ? (
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>
                            −${d.calculated_savings.toFixed(2)}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 11, color: colors.danger, maxWidth: 100, textAlign: "right" }}>
                            {d.reason}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Specific Items tab ── */}
          {activeTab === "items" && (
            <View style={{ gap: 6 }}>
              {itemsWithAvailableDiscounts.length > 0 ? (
                itemsWithAvailableDiscounts.map((item) => {
                  const isApplied = !!item.appliedDiscount;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleToggleItemDiscount(item)}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        padding: 10, borderRadius: 10,
                        borderWidth: 1,
                        backgroundColor: isApplied ? colors.teal + "10" : colors.screen,
                        borderColor: isApplied ? colors.teal + "40" : colors.border,
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                          {item.availableDiscount?.label || "Discountable"}
                        </Text>
                      </View>
                      <View style={{
                        width: 22, height: 22, borderRadius: 11,
                        alignItems: "center", justifyContent: "center",
                        backgroundColor: isApplied ? colors.teal : "transparent",
                        borderWidth: 1,
                        borderColor: isApplied ? colors.teal : colors.border,
                      }}>
                        {isApplied && <Check size={12} color={colors.onSolid} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    No eligible items found
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const DiscountBottomSheet = forwardRef(DiscountBottomSheetComponent);
DiscountBottomSheet.displayName = "DiscountBottomSheet";

export default DiscountBottomSheet;
