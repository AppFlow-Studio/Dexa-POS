import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import React, { createContext, useContext, useMemo } from "react";

export interface KioskThemeTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headerTextColor: string;
  fontFamily: string;
  logoUrl: string | null;
  welcomeMessage: string;
}

const DEFAULT_TOKENS: KioskThemeTokens = {
  primaryColor: "#0C4FD1",
  secondaryColor: "#0C4FD1",
  accentColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#0A0A0A",
  headerTextColor: "#0A0A0A",
  fontFamily: "Inter",
  logoUrl: null,
  welcomeMessage: "Tap to order",
};

const KioskThemeContext = createContext<KioskThemeTokens>(DEFAULT_TOKENS);

export function KioskThemeProvider({
  profile,
  children,
}: {
  profile: KioskProfile | null | undefined;
  children: React.ReactNode;
}) {
  const value = useMemo<KioskThemeTokens>(() => {
    if (!profile) return DEFAULT_TOKENS;
    return {
      primaryColor: profile.primary_color,
      secondaryColor: profile.secondary_color ?? profile.primary_color,
      accentColor: profile.accent_color ?? DEFAULT_TOKENS.accentColor,
      backgroundColor: profile.background_color,
      textColor: profile.text_color,
      headerTextColor: profile.header_text_color ?? profile.text_color,
      fontFamily: profile.font_family ?? DEFAULT_TOKENS.fontFamily,
      logoUrl: profile.logo_url,
      welcomeMessage: profile.welcome_message ?? DEFAULT_TOKENS.welcomeMessage,
    };
  }, [profile]);

  return (
    <KioskThemeContext.Provider value={value}>
      {children}
    </KioskThemeContext.Provider>
  );
}

export function useKioskTheme(): KioskThemeTokens {
  return useContext(KioskThemeContext);
}
