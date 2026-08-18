import fs from "fs";
import path from "path";

import { resolveMenuSyncChannel } from "@/lib/menu/menuChannel";

const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("menu channel visibility", () => {
  it("maps self-service stations to kiosk and register surfaces to POS", () => {
    expect(resolveMenuSyncChannel("self_service")).toBe("kiosk");
    expect(resolveMenuSyncChannel("kiosk")).toBe("kiosk");
    expect(resolveMenuSyncChannel("register")).toBe("pos");
    expect(resolveMenuSyncChannel("terminal")).toBe("pos");
    expect(resolveMenuSyncChannel(null)).toBe("pos");
  });

  it("partitions every menu query and cache by the resolved channel", () => {
    const provider = readRepoFile("contexts/PosSyncProvider.tsx");
    const primarySync = readRepoFile("hooks/pos/usePosSync.ts");
    const standaloneSync = readRepoFile("hooks/pos/useStandaloneSync.ts");

    expect(primarySync).toContain(
      'queryKey: ["pos_sync", locationId, channel]',
    );
    expect(primarySync).toContain('rpc("get_pos_bootstrap_channel_v1"');
    expect(standaloneSync).toContain(
      'queryKey: ["standalone_sync", merchantId, locationId, channel]',
    );
    expect(standaloneSync).toContain('"get_menu_library_channel_v1"');
    expect(provider).toMatch(
      /useStandaloneSync\([\s\S]*?menuSyncChannel,\s*\)/,
    );
    expect(provider).toMatch(
      /menuOfflineCache\.set\([\s\S]*?menuSyncChannel,\s*\)/,
    );
  });

  it("keeps inheritance and the primary OrderOut guard in the DB contract", () => {
    const migration = readRepoFile(
      "supabase/migrations/20260817120000_menu_available_channels.sql",
    );
    const remediation = readRepoFile(
      "supabase/migrations/20260817121000_saucy_whole_menu_online_only.sql",
    );

    expect(migration).toContain(
      `DEFAULT '["pos", "online", "kiosk"]'::jsonb`,
    );
    expect(migration).toMatch(
      /COALESCE\(lm\.available_channels, m\.available_channels\) \? v_channel/,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_menu_library_channel_v1",
    );
    expect(migration).toContain("JOIN public.orderout_restaurants oor");
    expect(migration).toContain(
      "Online cannot be disabled for a primary OrderOut menu",
    );
    expect(remediation).toContain(
      "d98830ee-bf56-4200-82e2-7ad221dc2048",
    );
    expect(remediation).toContain(`'["online"]'::jsonb`);
  });
});
