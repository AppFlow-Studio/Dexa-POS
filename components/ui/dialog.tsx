import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import * as DialogPrimitive from "@rn-primitives/dialog";
import * as React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { cn } from "~/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlayWeb({
  className,
  align = "center",
  ...props
}: DialogPrimitive.OverlayProps & {
  ref?: React.RefObject<DialogPrimitive.OverlayRef>;
  align?: "center" | "end";
}) {
  const { open } = DialogPrimitive.useRootContext();
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "bg-black/80 flex justify-center absolute top-0 right-0 bottom-0 left-0",
        align === "end" ? "items-end justify-start pb-0" : "items-center p-2",
        open
          ? "web:animate-in web:fade-in-0"
          : "web:animate-out web:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogOverlayNative({
  className,
  children,
  align = "center",
  ...props
}: DialogPrimitive.OverlayProps & {
  ref?: React.RefObject<DialogPrimitive.OverlayRef>;
  children?: React.ReactNode;
  align?: "center" | "end";
}) {
  return (
    <DialogPrimitive.Overlay
      style={StyleSheet.absoluteFill}
      className={cn(
        "flex bg-black/80 justify-center",
        align === "end" ? "items-end justify-start pb-0" : "items-center p-2",
        className,
      )}
      {...props}
    >
      <Animated.View
        entering={iosOnly(FadeIn.duration(150))}
        exiting={iosOnly(FadeOut.duration(150))}
      >
        {children}
      </Animated.View>
    </DialogPrimitive.Overlay>
  );
}

const DialogOverlay = Platform.select({
  web: DialogOverlayWeb,
  default: DialogOverlayNative,
});

function DialogContent({
  className,
  children,
  portalHost,
  align = "center",
  style,
  ...props
}: DialogPrimitive.ContentProps & {
  ref?: React.RefObject<DialogPrimitive.ContentRef>;
  className?: string;
  portalHost?: string;
  align?: "center" | "end";
}) {
  const { open } = DialogPrimitive.useRootContext();
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay align={align}>
        <DialogPrimitive.Content
          className={cn(
            "max-w-2xl w-full gap-4 web:cursor-default p-6 web:duration-200",
            align === "end" ? "rounded-t-lg rounded-b-none" : "rounded-lg",
            open
              ? "web:animate-in web:fade-in-0 web:zoom-in-95"
              : "web:animate-out web:fade-out-0 web:zoom-out-95",
            className,
          )}
          style={[
            {
              borderColor: colors.border,
              borderWidth: 0,
            },
            style,
          ]}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            className={
              "absolute right-4 top-4 p-0.5 web:group rounded-sm opacity-70 web:ring-offset-background web:transition-opacity web:hover:opacity-100 web:focus:outline-none web:focus:ring-2 web:focus:ring-ring web:focus:ring-offset-2 web:disabled:pointer-events-none"
            }
          ></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "flex flex-col gap-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end gap-2",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: DialogPrimitive.TitleProps & {
  ref?: React.RefObject<DialogPrimitive.TitleRef>;
}) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-lg native:text-xl text-foreground font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DescriptionProps & {
  ref?: React.RefObject<DialogPrimitive.DescriptionRef>;
}) {
  return (
    <DialogPrimitive.Description
      className={cn(
        "text-sm native:text-base text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger
};

