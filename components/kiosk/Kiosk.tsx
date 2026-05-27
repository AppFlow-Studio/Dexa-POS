import { BootDiagnosticScreen } from "@/components/kiosk/BootDiagnosticScreen";
import { LockTaskGate } from "@/components/kiosk/LockTaskGate";
import { kioskTemplateRegistry } from "@/components/kiosk/templates/registry";
import {
    KioskFlowProvider,
    useKioskFlow,
} from "@/contexts/kiosk/KioskFlowProvider";
import { KioskScaleProvider } from "@/contexts/kiosk/KioskScaleProvider";
import { KioskThemeProvider } from "@/contexts/kiosk/KioskThemeProvider";
import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

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
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation,
  );
  const supabase = useSupabaseClient();
  const stationId = selectedStation?.id;
  const profileQuery = useKioskProfile(stationId);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const profileId = profileQuery.data?.profile?.id;

  useEffect(() => {
    const orientation = profileQuery.data?.profile?.orientation;
    if (Platform.OS === "web") return;
    let locked = false;
    (async () => {
      try {
        if (orientation === "horizontal") {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE,
          );
          locked = true;
        } else if (orientation === "vertical") {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT,
          );
          locked = true;
        } else {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.DEFAULT,
          );
        }
      } catch (e) {
        // ignore failures (native modules may be unavailable in some envs)
      }
    })();

    return () => {
      if (Platform.OS === "web") return;
      // restore default when kiosk unmounts or profile changes
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.DEFAULT,
      ).catch(() => {
        /* noop */
      });
    };
  }, [profileQuery.data?.profile?.orientation]);

  const handleTemplateChange = async (
    templateId: KioskProfile["template_id"],
  ) => {
    if (!profileId) return;
    const { error } = await supabase
      .from("kiosk_profiles")
      .update({ template_id: templateId })
      .eq("id", profileId);

    if (error) throw error;
    await profileQuery.refetch();
  };

  return (
    <KioskThemeProvider profile={profileQuery.data?.profile}>
      <KioskScaleProvider>
        <KioskFlowProvider
          profileTemplateId={profileQuery.data?.profile?.template_id}
        >
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
                  onTemplateChange={handleTemplateChange}
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
