import { KioskTemplateShell, type KioskTemplateProps } from "@/components/kiosk/templates/sharedScreens";

export function TemplateA(props: KioskTemplateProps) {
  return <KioskTemplateShell {...props} variant="classic" />;
}
