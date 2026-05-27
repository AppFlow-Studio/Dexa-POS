import { formatMoney, getCartItemSubtotal } from "@/components/kiosk/cartMath";
import { AttractLoop } from "@/components/kiosk/shared/AttractLoop";
import { ItemDetailSheet } from "@/components/kiosk/shared/ItemDetailSheet";
import { ItemTile } from "@/components/kiosk/shared/ItemTile";
import { KeypadEntry } from "@/components/kiosk/shared/KeypadEntry";
import { KioskButton } from "@/components/kiosk/shared/KioskButton";
import { MoneyDisplay } from "@/components/kiosk/shared/MoneyDisplay";
import { QuantityStepper } from "@/components/kiosk/shared/QuantityStepper";
import { TimedReset } from "@/components/kiosk/shared/TimedReset";
import { kioskStrings } from "@/components/kiosk/strings";
import type { KioskMenuData } from "@/components/kiosk/types";
import { useKioskFlow } from "@/contexts/kiosk/KioskFlowProvider";
import { useKioskScale } from "@/contexts/kiosk/KioskScaleProvider";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import { useKioskMenu } from "@/hooks/kiosk/useKioskMenu";
import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import {
  CreditCard,
  PackageCheck,
  ShoppingBag,
  Store,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export type KioskTemplateVariant = "classic" | "chat" | "immersive";

export interface KioskTemplateProps {
  profile: KioskProfile | null | undefined;
  openAdminPin: () => void;
}

function getCategoryItems(menu: KioskMenuData, categoryId: string) {
  const category = menu.categories.find(
    (candidate) => candidate.id === categoryId,
  );
  if (!category) return [];
  if (category.itemIds.length === 0) return [];
  const visibleIds = new Set(category.itemIds);
  return menu.items.filter((item) => visibleIds.has(item.id));
}

function KioskHeader({
  title,
  onAdmin,
}: {
  title: string;
  onAdmin: () => void;
}) {
  const theme = useKioskTheme();
  const flow = useKioskFlow();
  return (
    <View
      style={{
        minHeight: 72,
        paddingHorizontal: 22,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: `${theme.textColor}10`,
        backgroundColor: `${theme.backgroundColor}F2`,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: theme.textColor, fontSize: 24, fontWeight: "900" }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        {__DEV__ ? (
          <KioskButton
            label={`${kioskStrings.templateSwitcher}: ${flow.templateId.replace("template_", "").toUpperCase()}`}
            variant="secondary"
            onPress={flow.cycleTemplate}
          />
        ) : null}
        <KioskButton
          label={kioskStrings.cart}
          variant="secondary"
          onPress={() => flow.setScreen("cart")}
        />
        <KioskButton label="Admin" variant="ghost" onPress={onAdmin} />
      </View>
    </View>
  );
}

function OrderTypeScreen() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  const options = [
    { label: kioskStrings.dineIn, value: "dine_in" as const },
    { label: kioskStrings.takeOut, value: "take_out" as const },
  ];
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 32, gap: 24 }}>
      <Text
        style={{
          color: theme.textColor,
          fontSize: 42,
          lineHeight: 48,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {kioskStrings.chooseOrderType}
      </Text>
      <View
        style={{ gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}
      >
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => flow.setOrderType(option.value)}
            activeOpacity={0.72}
            style={{
              width: "100%",
              minHeight: 118,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "space-between",
              flexDirection: "row",
              backgroundColor: theme.primaryColor,
              borderWidth: 1,
              borderColor: `${theme.primaryColor}55`,
              paddingHorizontal: 28,
              zIndex: 10,
              elevation: 4,
              shadowColor: "#000000",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 22,
            }}
          >
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.18)",
              }}
            >
              {option.value === "dine_in" ? (
                <Store color="#FFFFFF" size={28} />
              ) : (
                <ShoppingBag color="#FFFFFF" size={28} />
              )}
            </View>
            <Text
              style={{
                color: "#FFFFFF",
                flex: 1,
                fontSize: 31,
                fontWeight: "900",
                textAlign: "center",
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MenuScreen({ variant }: { variant: KioskTemplateVariant }) {
  const menu = useKioskMenu();
  const flow = useKioskFlow();
  const scale = useKioskScale();
  const theme = useKioskTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>(
    {},
  );
  const selectedCategoryId =
    flow.selectedCategoryId ?? menu.categories[0]?.id ?? null;
  const sections = useMemo(
    () =>
      menu.categories.map((category) => ({
        category,
        items: getCategoryItems(menu, category.id).filter(
          (item) => item.isAvailable,
        ),
      })),
    [menu],
  );
  const categoryRailWidth = Math.min(300, Math.max(228, scale.vw * 0.22));
  const gridGap = 14;
  const gridHorizontalPadding = 32;
  const gridWidth = Math.max(
    360,
    scale.vw - categoryRailWidth - gridHorizontalPadding,
  );
  const gridColumns = Math.max(
    2,
    Math.min(5, Math.floor((gridWidth + gridGap) / (174 + gridGap))),
  );
  const itemTileWidth = Math.floor(
    (gridWidth - gridGap * (gridColumns - 1)) / gridColumns,
  );

  const scrollToCategory = (categoryId: string) => {
    flow.setSelectedCategoryId(categoryId);
    scrollRef.current?.scrollTo({
      y: sectionOffsets[categoryId] ?? 0,
      animated: true,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 }}
      >
        <Text
          style={{
            color: theme.textColor,
            fontSize: variant === "chat" ? 32 : 26,
            fontWeight: "900",
          }}
        >
          {variant === "chat" ? "What sounds good?" : kioskStrings.browseMenu}
        </Text>
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <ScrollView
          style={{
            width: categoryRailWidth,
            maxWidth: categoryRailWidth,
            flexShrink: 0,
            borderRightWidth: 1,
            borderRightColor: `${theme.textColor}10`,
            backgroundColor: `${theme.textColor}04`,
          }}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
        >
          {menu.categories.map((category) => {
            const active = category.id === selectedCategoryId;
            return (
              <TouchableOpacity
                key={category.id}
                activeOpacity={0.72}
                onPress={() => scrollToCategory(category.id)}
                style={{
                  minHeight: 62,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  justifyContent: "center",
                  backgroundColor: active
                    ? theme.primaryColor
                    : theme.backgroundColor,
                  borderWidth: 1,
                  borderColor: active
                    ? theme.primaryColor
                    : `${theme.textColor}12`,
                  elevation: active ? 2 : 0,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: active ? "#FFFFFF" : theme.textColor,
                    fontSize: 15,
                    fontWeight: "900",
                  }}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 130,
            gap: 28,
          }}
          showsVerticalScrollIndicator={false}
        >
          {sections.map(({ category, items }) => (
            <View
              key={category.id}
              onLayout={(event) => {
                const y = event.nativeEvent.layout.y;
                setSectionOffsets((current) =>
                  current[category.id] === y
                    ? current
                    : { ...current, [category.id]: y },
                );
              }}
              style={{ gap: 14 }}
            >
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: 24,
                  fontWeight: "900",
                }}
              >
                {category.name}
              </Text>
              {items.length === 0 ? (
                <View
                  style={{
                    minHeight: 140,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: `${theme.textColor}05`,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textColor,
                      fontSize: 15,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    No items are available right now.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: gridGap,
                  }}
                >
                  {items.map((item) => (
                    <ItemTile
                      key={`${category.id}-${item.id}`}
                      item={item}
                      width={itemTileWidth}
                      onPress={() => flow.openItem(item)}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
      <CartBar />
    </View>
  );
}

function CartBar() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  if (flow.cartItems.length === 0) return null;
  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 16,
        minHeight: 76,
        borderRadius: 8,
        backgroundColor: theme.backgroundColor,
        borderWidth: 1,
        borderColor: `${theme.textColor}12`,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        elevation: 10,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
      }}
    >
      <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: "900" }}>
        {flow.cartItems.length} item{flow.cartItems.length === 1 ? "" : "s"}
      </Text>
      <MoneyDisplay value={flow.totals.total} />
      <KioskButton
        label={kioskStrings.checkout}
        onPress={() => flow.setScreen("cart")}
      />
    </View>
  );
}

function CartScreen() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  return (
    <View style={{ flex: 1, padding: 22, gap: 18 }}>
      <Text style={{ color: theme.textColor, fontSize: 32, fontWeight: "900" }}>
        {kioskStrings.cart}
      </Text>
      {flow.cartItems.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <Text
            style={{ color: theme.textColor, fontSize: 20, fontWeight: "800" }}
          >
            {kioskStrings.emptyCart}
          </Text>
          <KioskButton
            label={kioskStrings.browseMenu}
            onPress={() => flow.setScreen("menu")}
          />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {flow.cartItems.map((item) => (
              <View
                key={item.id}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${theme.textColor}12`,
                  backgroundColor: theme.backgroundColor,
                  padding: 16,
                  gap: 12,
                  elevation: 2,
                  shadowColor: "#000000",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: theme.textColor,
                        fontSize: 19,
                        fontWeight: "900",
                      }}
                    >
                      {item.name}
                    </Text>
                    {item.modifiers.map((modifier) => (
                      <Text
                        key={`${item.id}-${modifier.optionId}`}
                        style={{ color: `${theme.textColor}AA`, fontSize: 13 }}
                      >
                        {modifier.optionName}
                      </Text>
                    ))}
                  </View>
                  <Text
                    style={{
                      color: theme.textColor,
                      fontSize: 18,
                      fontWeight: "900",
                    }}
                  >
                    {formatMoney(getCartItemSubtotal(item))}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <KioskButton
                    label="Remove"
                    variant="ghost"
                    onPress={() => flow.removeCartItem(item.id)}
                  />
                  <QuantityStepper
                    quantity={item.quantity}
                    min={0}
                    onChange={(quantity) =>
                      flow.updateCartItemQuantity(item.id, quantity)
                    }
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: `${theme.textColor}12`,
              paddingTop: 16,
              gap: 12,
            }}
          >
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: 18,
                  fontWeight: "900",
                }}
              >
                Subtotal
              </Text>
              <MoneyDisplay value={flow.totals.subtotal} />
            </View>
            <KioskButton
              label={kioskStrings.continue}
              onPress={() => flow.setScreen("loyalty")}
            />
            <KioskButton
              label={kioskStrings.browseMenu}
              variant="secondary"
              onPress={() => flow.setScreen("menu")}
            />
          </View>
        </>
      )}
    </View>
  );
}

function TipScreen() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  const presets = [0, 15, 18, 20, 25];
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 32, gap: 24 }}>
      <Text
        style={{
          color: theme.textColor,
          fontSize: 38,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {kioskStrings.tipTitle}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 14,
          justifyContent: "center",
        }}
      >
        {presets.map((preset) => (
          <KioskButton
            key={preset}
            label={preset === 0 ? "No tip" : `${preset}%`}
            variant={flow.tipPercent === preset ? "primary" : "secondary"}
            onPress={() => flow.setTipPercent(preset)}
          />
        ))}
      </View>
      <View
        style={{
          alignSelf: "center",
          minWidth: 260,
          borderRadius: 12,
          backgroundColor: `${theme.textColor}06`,
          paddingHorizontal: 18,
          paddingVertical: 14,
        }}
      >
        <Text
          style={{
            color: `${theme.textColor}AA`,
            fontSize: 13,
            fontWeight: "900",
            textAlign: "center",
          }}
        >
          Total
        </Text>
        <Text
          style={{
            color: theme.textColor,
            fontSize: 28,
            fontWeight: "900",
            textAlign: "center",
          }}
        >
          {formatMoney(flow.totals.total)}
        </Text>
      </View>
      <KioskButton
        label={kioskStrings.continue}
        onPress={() => flow.setScreen("payment")}
      />
    </View>
  );
}

function PaymentScreen() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 32, gap: 20 }}>
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: 8,
          backgroundColor: `${theme.primaryColor}14`,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
        }}
      >
        <CreditCard color={theme.primaryColor} size={38} />
      </View>
      <Text
        style={{
          color: theme.textColor,
          fontSize: 38,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {kioskStrings.paymentTitle}
      </Text>
      <Text
        style={{ color: theme.textColor, fontSize: 16, textAlign: "center" }}
      >
        {kioskStrings.paymentMock}
      </Text>
      <Text
        style={{
          color: theme.textColor,
          fontSize: 32,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {formatMoney(flow.totals.total)}
      </Text>
      <KioskButton
        label="Mock payment complete"
        onPress={() => flow.setScreen("confirmation")}
      />
    </View>
  );
}

function ConfirmationScreen() {
  const flow = useKioskFlow();
  const theme = useKioskTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 18,
      }}
    >
      <View
        style={{
          width: 86,
          height: 86,
          borderRadius: 8,
          backgroundColor: `${theme.primaryColor}14`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PackageCheck color={theme.primaryColor} size={44} />
      </View>
      <Text
        style={{
          color: theme.textColor,
          fontSize: 36,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {kioskStrings.confirmationTitle}
      </Text>
      <Text
        style={{ color: theme.textColor, fontSize: 16, textAlign: "center" }}
      >
        {kioskStrings.confirmationBody}
      </Text>
      <KioskButton label={kioskStrings.reset} onPress={flow.resetFlow} />
    </View>
  );
}

export function KioskTemplateShell({
  profile,
  openAdminPin,
  variant,
}: KioskTemplateProps & {
  variant: KioskTemplateVariant;
}) {
  const flow = useKioskFlow();
  const theme = useKioskTheme();

  return (
    <TimedReset
      enabled={flow.screen !== "attract" && flow.cartItems.length > 0}
      timeoutSeconds={profile?.cart_reset_timeout_seconds ?? 30}
      onReset={flow.resetFlow}
    >
      <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
        {flow.screen === "attract" ? (
          <AttractLoop
            imageUrls={
              Array.isArray(profile?.attract_image_urls)
                ? profile.attract_image_urls.filter(
                    (value): value is string => typeof value === "string",
                  )
                : []
            }
            logoUrl={profile?.logo_url ?? null}
            message={profile?.welcome_message ?? kioskStrings.startOrder}
            onStart={() => flow.setScreen("orderType")}
          />
        ) : (
          <>
            <KioskHeader
              title={profile?.profile_name ?? "Kiosk"}
              onAdmin={openAdminPin}
            />
            {flow.screen === "orderType" ? <OrderTypeScreen /> : null}
            {flow.screen === "menu" ? <MenuScreen variant={variant} /> : null}
            {flow.screen === "itemDetail" && flow.selectedItem ? (
              <ItemDetailSheet item={flow.selectedItem} />
            ) : null}
            {flow.screen === "cart" ? <CartScreen /> : null}
            {flow.screen === "loyalty" ? (
              <KeypadEntry
                title={kioskStrings.loyaltyPrompt}
                value={flow.phone}
                maxLength={10}
                onChange={flow.setPhone}
                onContinue={() => flow.setScreen("tip")}
                onSkip={() => flow.setScreen("tip")}
              />
            ) : null}
            {flow.screen === "tip" ? <TipScreen /> : null}
            {flow.screen === "payment" ? <PaymentScreen /> : null}
            {flow.screen === "confirmation" ? <ConfirmationScreen /> : null}
          </>
        )}
      </View>
    </TimedReset>
  );
}
