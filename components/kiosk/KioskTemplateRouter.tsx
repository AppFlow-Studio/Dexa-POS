import { KioskTemplateA } from "@/components/kiosk/template-a/KioskTemplateA";
import { KioskTemplateB } from "@/components/kiosk/template-b/KioskTemplateB";
import { KioskTemplateC } from "@/components/kiosk/template-c/KioskTemplateC";
import type { KioskConfig, KioskTemplateId } from "@/types/kiosk";
import type { ComponentType } from "react";

/**
 * Props every kiosk template's ordering flow receives.
 * `onExit` returns the kiosk to the attract/idle screen.
 */
export interface KioskTemplateProps {
  config: KioskConfig;
  onExit: () => void;
}

/**
 * Registry mapping each `template_id` (from the kiosk_profiles DB row, via
 * config.templateId) to its ordering-flow component. Add template B / C here as
 * they're built; until then they fall back to Template A.
 */
const TEMPLATES: Record<
  KioskTemplateId,
  ComponentType<KioskTemplateProps>
> = {
  template_a: KioskTemplateA,
  template_b: KioskTemplateB,
  template_c: KioskTemplateC,
};

/**
 * Selects and renders the ordering flow for the configured template. Keeps
 * kiosk.tsx template-agnostic — routing is driven entirely by the DB's
 * template_id.
 */
export function KioskTemplateRouter({ config, onExit }: KioskTemplateProps) {
  const Template = TEMPLATES[config.templateId] ?? KioskTemplateA;
  return <Template config={config} onExit={onExit} />;
}
