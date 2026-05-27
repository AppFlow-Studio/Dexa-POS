import { KioskTemplateShell, type KioskTemplateProps } from "@/components/kiosk/templates/sharedScreens";

export function TemplateC(props: KioskTemplateProps) {
  return <KioskTemplateShell {...props} variant="immersive" />;
}
