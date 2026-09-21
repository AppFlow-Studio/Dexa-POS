import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { logError } from "@/lib/logError";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import * as Application from "expo-application";
import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { initials } from "../../lib/format";
import { ListRow, Screen, StickyActionBar } from "../../primitives";

/** Avatar chip + name + role. */
function IdentityCard() {
  const employee = useEmployeeStore((s) => s.loggedInEmployee);
  const name = employee?.displayName || employee?.fullName || "Not signed in";
  return (
    <View className="mx-4 my-2 flex-row items-center rounded-2xl p-4" style={{ backgroundColor: colors.panel }}>
      <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.teal }}>
        <Text className="text-lg font-bold" style={{ color: colors.onSolid }}>
          {initials(name)}
        </Text>
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-lg font-bold" style={{ color: colors.heading }} numberOfLines={1}>
          {name}
        </Text>
        {employee?.role ? (
          <Text className="text-sm capitalize" style={{ color: colors.muted }} numberOfLines={1}>
            {employee.role}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Station, location, connection and build — the "am I set up right" list. */
function StationRows() {
  const stationName = useStoreSettingsStore((s) => s.selectedStation?.station_name ?? "—");
  const locationName = useStoreSettingsStore((s) => s.selectedStore?.name ?? "—");
  const { rawIsOnline, pendingSyncCount } = useNetworkStatus();
  return (
    <>
      <ListRow title="Station" value={stationName} />
      <ListRow title="Location" value={locationName} />
      <ListRow
        title="Connection"
        value={rawIsOnline ? "Online" : "Offline"}
        meta={pendingSyncCount > 0 ? `${pendingSyncCount} pending` : undefined}
        dotColor={rawIsOnline ? colors.success : colors.warning}
      />
      <ListRow title="App version" value={Application.nativeApplicationVersion ?? "—"} />
    </>
  );
}

/** Me tab: who is signed in, on what, plus Sync now and Switch user. */
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
        <StationRows />
      </ScrollView>
      <StickyActionBar
        actions={[
          {
            label: syncing ? "Syncing…" : "Sync now",
            onPress: () => void handleSync(),
            variant: "secondary",
            disabled: syncing,
          },
          { label: "Switch user", onPress: handleSwitchUser },
        ]}
      />
    </Screen>
  );
}
