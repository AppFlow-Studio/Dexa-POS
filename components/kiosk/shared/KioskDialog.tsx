import {
  KIOSK_HAIRLINE,
  kioskFont,
  kioskMotion,
  kioskRadius,
  kioskTracking,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { KIOSK_HANDHELD_SHORT_EDGE } from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { useCallback, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * The kiosk's replacement for `Alert.alert`.
 *
 * A native alert is the one surface the kiosk cannot theme: it arrives in the
 * OS's own dialog, in the OS's type, over a UI built to look like the
 * merchant's shop — and on a self-service panel that reads as the app
 * breaking. Every kiosk dialog goes through here instead.
 *
 * `useKioskDialog` keeps Alert.alert's shape — `show(title, message, buttons)`
 * with `cancel` / `destructive` / `default` buttons — so a call site swaps
 * over without changing its logic, and returns the element to render.
 *
 * Two looks:
 *  - **Customer** (pass `config`): the kiosk design system, themed from the
 *    merchant's profile — same card, type and buttons as KioskConfirmDialog.
 *    Drawn in-tree as an absolute fill, so render it at the screen root.
 *  - **Staff** (no `config`): the Kiosk Settings look — white card, teal
 *    primary. Drawn in a Modal, because staff call sites sit deep inside
 *    scrolling panels where an absolute fill would be clipped to the panel.
 *
 * Dismissing (backdrop or Android back) runs the `cancel` button, or the only
 * button when there is just one — so an awaited confirmation always resolves.
 */
export interface KioskDialogButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export type ShowKioskDialog = (
  title: string,
  message?: string,
  buttons?: KioskDialogButton[],
) => void;

interface DialogRequest {
  title: string;
  message?: string;
  buttons: KioskDialogButton[];
}

export function useKioskDialog(config?: KioskConfig): {
  show: ShowKioskDialog;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const show = useCallback<ShowKioskDialog>((title, message, buttons) => {
    setRequest({
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
    });
  }, []);

  // Close first, then run the handler: a handler that opens the next dialog
  // (a confirmation followed by its result) lands on a clean slate.
  const press = useCallback((button: KioskDialogButton) => {
    setRequest(null);
    button.onPress?.();
  }, []);

  const dismissWith = request
    ? (request.buttons.find((b) => b.style === "cancel") ??
      (request.buttons.length === 1 ? request.buttons[0] : undefined))
    : undefined;
  const onDismiss = dismissWith ? () => press(dismissWith) : undefined;

  const dialog = !request ? null : config ? (
    <CustomerDialog
      config={config}
      request={request}
      onPress={press}
      onDismiss={onDismiss}
    />
  ) : (
    <StaffDialog request={request} onPress={press} onDismiss={onDismiss} />
  );

  return { show, dialog };
}

function CustomerDialog({
  config,
  request,
  onPress,
  onDismiss,
}: {
  config: KioskConfig;
  request: DialogRequest;
  onPress: (button: KioskDialogButton) => void;
  onDismiss?: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const narrow = useWindowDimensions().width < KIOSK_HANDHELD_SHORT_EDGE;

  return (
    <Animated.View
      entering={FadeIn.duration(kioskMotion.base)}
      exiting={FadeOut.duration(kioskMotion.fast)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: kioskPx(narrow ? 20 : 40, s),
        backgroundColor: t.scrim,
        zIndex: 95,
      }}
    >
      <Pressable
        onPress={onDismiss}
        accessible={false}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View
        accessibilityRole="alert"
        style={{
          width: "100%",
          maxWidth: kioskPx(560, s),
          padding: kioskPx(narrow ? 24 : 40, s),
          borderRadius: kioskPx(kioskRadius.xl, s),
          backgroundColor: t.page,
        }}
      >
        <Text
          style={{
            fontSize: kioskPx(28, s),
            letterSpacing: kioskTracking(28),
            color: t.text,
            textAlign: "center",
            ...kioskFont(t, "bold"),
          }}
        >
          {request.title}
        </Text>
        {request.message ? (
          <Text
            style={{
              marginTop: kioskPx(14, s),
              fontSize: kioskPx(18, s),
              lineHeight: kioskPx(27, s),
              color: t.textMuted,
              textAlign: "center",
              ...kioskFont(t, "regular"),
            }}
          >
            {request.message}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            gap: kioskPx(14, s),
            marginTop: kioskPx(32, s),
          }}
        >
          {request.buttons.map((button) => {
            const filled = button.style !== "cancel";
            return (
              <KioskPressable
                key={button.text}
                onPress={() => onPress(button)}
                pressedScale={0.98}
                accessibilityRole="button"
                style={{
                  flex: 1,
                  height: kioskPx(64, s),
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: kioskPx(kioskRadius.md, s),
                  backgroundColor: filled ? t.primary : "transparent",
                  borderWidth: filled ? 0 : KIOSK_HAIRLINE,
                  borderColor: t.outlineStrong,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={{
                    fontSize: kioskPx(18, s),
                    color: filled ? t.onPrimary : t.textMuted,
                    ...kioskFont(t, filled ? "bold" : "regular"),
                  }}
                >
                  {button.text}
                </Text>
              </KioskPressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const staffCardShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.12,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 12,
};

function StaffDialog({
  request,
  onPress,
  onDismiss,
}: {
  request: DialogRequest;
  onPress: (button: KioskDialogButton) => void;
  onDismiss?: () => void;
}) {
  // The action leads and the way out comes last, the order the end-session
  // confirmation in Kiosk Settings already uses.
  const ordered = [
    ...request.buttons.filter((b) => b.style !== "cancel"),
    ...request.buttons.filter((b) => b.style === "cancel"),
  ];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onDismiss?.()}
    >
      <Pressable
        onPress={onDismiss}
        className="flex-1 bg-black/40 items-center justify-center px-6"
      >
        {/* Swallows taps so the card itself doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          accessibilityRole="alert"
          className="w-full max-w-sm bg-white rounded-3xl p-6"
          style={staffCardShadow}
        >
          <Text className="text-lg font-bold text-gray-900 text-center mb-2">
            {request.title}
          </Text>
          {request.message ? (
            <Text className="text-sm text-gray-500 text-center">
              {request.message}
            </Text>
          ) : null}

          <View className="mt-6 gap-2.5">
            {ordered.map((button) => (
              <Pressable
                key={button.text}
                onPress={() => onPress(button)}
                accessibilityRole="button"
                className={`py-4 rounded-2xl items-center ${
                  button.style === "cancel"
                    ? "bg-gray-100"
                    : button.style === "destructive"
                      ? "bg-red-500"
                      : "bg-teal-600"
                }`}
              >
                <Text
                  className={`font-bold text-base ${
                    button.style === "cancel" ? "text-gray-700" : "text-white"
                  }`}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
