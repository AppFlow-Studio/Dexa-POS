import { BootDiagnosticScreen } from "@/components/kiosk/BootDiagnosticScreen";
import { LockTaskGate } from "@/components/kiosk/LockTaskGate";
import { kioskTemplateRegistry } from "@/components/kiosk/templates/registry";
import { KioskFlowProvider, useKioskFlow } from "@/contexts/kiosk/KioskFlowProvider";
import { KioskScaleProvider } from "@/contexts/kiosk/KioskScaleProvider";
import { KioskThemeProvider } from "@/contexts/kiosk/KioskThemeProvider";
import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";

function KioskTemplateMount({
  profile,
  openAdminPin,
}: {
  profile: KioskProfile | null | undefined;
  openAdminPin: () => void;
}) {
  const flow = useKioskFlow();
  const Template = kioskTemplateRegistry[flow.templateId];
  return <Template profile={profile} openAdminPin={openAdminPin} />;
}

export default function Kiosk() {
  const selectedStation = useStoreSettingsStore((state) => state.selectedStation);
  const stationId = selectedStation?.id;
  const profileQuery = useKioskProfile(stationId);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <KioskThemeProvider profile={profileQuery.data?.profile}>
      <KioskScaleProvider>
        <KioskFlowProvider profileTemplateId={profileQuery.data?.profile?.template_id}>
          <LockTaskGate
            adminPinHash={profileQuery.data?.profile?.admin_pin_hash}
            onShowDiagnostics={() => setShowDiagnostics(true)}
          >
            {(openAdminPin) =>
              showDiagnostics ? (
                <BootDiagnosticScreen
                  data={profileQuery.data}
                  fallbackStation={selectedStation}
                  profileStatus={profileQuery.status}
                  profileError={profileQuery.error?.message ?? null}
                  onClose={() => setShowDiagnostics(false)}
                  onRefresh={() => void profileQuery.refetch()}
                />
              ) : (
                <KioskTemplateMount
                  profile={profileQuery.data?.profile}
                  openAdminPin={openAdminPin}
                />
              )
            }
          </LockTaskGate>
        </KioskFlowProvider>
      </KioskScaleProvider>
    </KioskThemeProvider>
  );
}
