import { TemplateA } from "@/components/kiosk/templates/TemplateA";
import { TemplateB } from "@/components/kiosk/templates/TemplateB";
import { TemplateC } from "@/components/kiosk/templates/TemplateC";
import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import type { ComponentType } from "react";
import type { KioskTemplateProps } from "@/components/kiosk/templates/sharedScreens";

export const kioskTemplateRegistry: Record<
  KioskProfile["template_id"],
  ComponentType<KioskTemplateProps>
> = {
  template_a: TemplateA,
  template_b: TemplateB,
  template_c: TemplateC,
};
