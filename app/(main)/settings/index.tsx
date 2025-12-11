import { Redirect } from "expo-router";
import React from "react";

const SettingsScreen: React.FC = () => {
  return <Redirect href="/settings/printers-kitchen" />;
};

export default SettingsScreen;
