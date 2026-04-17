import { Stack } from "expo-router";

export default function TablesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="floor-plan/index" />
      <Stack.Screen name="edit-layout" />
      <Stack.Screen
        name="[tableId]"
        options={{
          presentation: "transparentModal",
          animation: "none",
        }}
      />
      <Stack.Screen
        name="waitlist"
        options={{ animation: "none" }}
      />
    </Stack>
  );
}
