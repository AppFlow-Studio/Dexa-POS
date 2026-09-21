import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { logError } from "@/lib/logError";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import * as Application from "expo-application";
import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Card, CardHeader } from "../../components/check/Card";
import { type } from "../../lib/type";
import { ListRow, Screen, StickyActionBar, SwitchRow } from "../../primitives";

function GroupLabel({ text }: { text: string }) {
  return (
    <View className="px-4 pb-2 pt-3">
      <Text style={[type.label, { color: colors.label }]}>{text}</Text>
    </View>
  );
}

/** Who is signed in, as a card with the avatar the header uses elsewhere. */
function IdentityCard() {
  const employee = useEmployeeStore((s) => s.loggedInEmployee);
  const name = employee?.displayName || employee?.fullName || "Not signed in";
  const role = employee?.role ? employee.role.replace(/_/g, " ") : undefined;
  return (
    <Card>
      <CardHeader leading={<Avatar name={name} />} title={name} detail={role} />
    </Card>
  );
}

/** Station, location, connection, build — the "am I set up right" rows. */
function StationRows() {
  const stationName = useStoreSettingsStore((s) => s.selectedStation?.station_name ?? "—");
  const locationName = useStoreSettingsStore((s) => s.selectedStore?.name ?? "—");
  const { rawIsOnline, pendingSyncCount } = useNetworkStatus();
  const connection = rawIsOnline
    ? "Online"
    : pendingSyncCount > 0
      ? `Offline · ${pendingSyncCount} waiting`
      : "Offline";
  return (
    <>
      <ListRow title="Station" value={stationName} />
      <ListRow title="Location" value={locationName} divider />
      <ListRow
        title="Connection"
        detailAccent={{ text: connection, color: rawIsOnline ? colors.success : colors.warning }}
        divider
      />
      <ListRow title="App version" value={Application.nativeApplicationVersion ?? "—"} divider />
    </>
  );
}

/**
 * Dark / light, the same NativeWind switch the register's Settings › General
 * uses, so both surfaces agree and the choice persists the same way.
 */
function AppearanceRow() {
  const { isDarkColorScheme, setColorScheme } = useColorScheme();
  return (
    <SwitchRow
      label="Dark mode"
      value={isDarkColorScheme}
      onChange={(dark) => setColorScheme(dark ? "dark" : "light")}
    />
  );
}

/** Me tab: identity, device rows, appearance, Sync now and Switch user. */
export function MeScreen() {
  const { syncNow } = useNetworkStatus();
  const signOut = useEmployeeStore((s) => s.signOut);
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncNow();
    } catch (error) {
      logError("sync", "Handheld manual sync failed", error);
    } finally {
      setSyncing(false);
    }
  }, [syncNow]);

  const handleSwitchUser = useCallback(() => {
    signOut();
    replaceRoute("(auth)", "pin-login");
  }, [signOut]);

  return (
    <Screen title="Me">
      <ScrollView className="flex-1">
        <IdentityCard />
        <GroupLabel text="This device" />
        <StationRows />
        <GroupLabel text="Appearance" />
        <AppearanceRow />
      </ScrollView>
      <StickyActionBar
        actions={[
          {
            label: syncing ? "Syncing…" : "Sync now",
            onPress: () => void handleSync(),
            variant: "tonal",
            disabled: syncing,
          },
          { label: "Switch user", onPress: handleSwitchUser },
        ]}
      />
    </Screen>
  );
}
