import KdsSettingsPanel from "@/components/kds/KdsSettingsPanel";
import { useRouter } from "expo-router";

/**
 * Standalone KDS settings route. The KDS board itself opens KdsSettingsPanel
 * over the board instead of navigating here (see KdsSettingsPanel for why);
 * this route keeps the page reachable by URL.
 */
export default function KdsSettingsPage() {
  const router = useRouter();
  return <KdsSettingsPanel onBack={() => router.back()} />;
}
