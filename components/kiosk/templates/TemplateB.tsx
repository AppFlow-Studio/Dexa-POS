import { KioskTemplateShell, type KioskTemplateProps } from "@/components/kiosk/templates/sharedScreens";

export function TemplateB(props: KioskTemplateProps) {
  return <KioskTemplateShell {...props} variant="chat" />;
}
