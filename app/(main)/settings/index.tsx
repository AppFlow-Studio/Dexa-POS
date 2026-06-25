import { Redirect } from "expo-router";
import React from "react";

const SettingsScreen: React.FC = () => {
  return <Redirect href="/settings/syncing" />;
};

export default SettingsScreen;
