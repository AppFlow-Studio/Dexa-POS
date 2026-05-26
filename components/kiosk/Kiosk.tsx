import { BootDiagnosticScreen } from "@/components/kiosk/BootDiagnosticScreen";
import { KioskSplash } from "@/components/kiosk/KioskSplash";
import { LockTaskGate } from "@/components/kiosk/LockTaskGate";
import { KioskScaleProvider } from "@/contexts/kiosk/KioskScaleProvider";
import { KioskThemeProvider } from "@/contexts/kiosk/KioskThemeProvider";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";

export default function Kiosk() {
  const selectedStation = useStoreSettingsStore((state) => state.selectedStation);
  const stationId = selectedStation?.id;
  const profileQuery = useKioskProfile(stationId);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <KioskThemeProvider profile={profileQuery.data?.profile}>
      <KioskScaleProvider>
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
              <KioskSplash
                profileLoaded={Boolean(profileQuery.data?.profile)}
                profileError={profileQuery.error?.message ?? null}
                onLogoLongPress={openAdminPin}
              />
            )
          }
        </LockTaskGate>
      </KioskScaleProvider>
    </KioskThemeProvider>
  );
}
