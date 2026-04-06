import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

// ─── Types ────────────────────────────────────────────────────────
export type SoundPreset = "chime" | "bell" | "alert" | "ding" | "none";

export interface KDSSoundConfig {
  enabled: boolean;
  pos: SoundPreset;
  online: SoundPreset;
  kiosk: SoundPreset;
  third_party: SoundPreset;
  default: SoundPreset;
}

export const DEFAULT_SOUND_CONFIG: KDSSoundConfig = {
  enabled: true,
  pos: "chime",
  online: "bell",
  kiosk: "ding",
  third_party: "alert",
  default: "chime",
};

export const SOUND_PRESET_OPTIONS: { value: SoundPreset; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "alert", label: "Alert" },
  { value: "ding", label: "Ding" },
  { value: "none", label: "None" },
];

// ─── Sound asset map ──────────────────────────────────────────────
const SOUND_ASSETS: Record<Exclude<SoundPreset, "none">, any> = {
  chime: require("@/assets/sounds/chime.mp3"),
  bell: require("@/assets/sounds/chime-alert.mp3"),
  alert: require("@/assets/sounds/alert.mp3"),
  ding: require("@/assets/sounds/ding.mp3"),
};

// ─── Source normalization ─────────────────────────────────────────
type ConfigKey = "pos" | "online" | "kiosk" | "third_party" | "default";

function normalizeSource(orderSource: string | null): ConfigKey {
  if (!orderSource) return "default";
  const lower = orderSource.toLowerCase();
  if (lower === "online" || lower === "web") return "online";
  if (lower === "kiosk") return "kiosk";
  if (lower === "pos" || lower === "in_store") return "pos";
  if (
    lower === "third_party" ||
    lower === "3rd_party" ||
    lower === "third-party" ||
    lower === "uber_eats" ||
    lower === "ubereats" ||
    lower === "grubhub" ||
    lower === "doordash" ||
    lower === "door_dash" ||
    lower === "delivery"
  )
    return "third_party";
  return "default";
}

// ─── Service ──────────────────────────────────────────────────────
class KDSSoundService {
  private players = new Map<Exclude<SoundPreset, "none">, AudioPlayer>();
  private config: KDSSoundConfig = { ...DEFAULT_SOUND_CONFIG };
  private lastPlayTime = 0;
  private readonly COOLDOWN_MS = 1500;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Enable playback in silent mode (kitchen environments)
      await setAudioModeAsync({ playsInSilentMode: true });

      // Pre-load all sound players
      for (const [preset, asset] of Object.entries(SOUND_ASSETS)) {
        const player = createAudioPlayer(asset);
        this.players.set(preset as Exclude<SoundPreset, "none">, player);
      }
      this.initialized = true;
    } catch (err) {
      console.error("[KDSSoundService] init failed:", err);
    }
  }

  /** Play the sound mapped to a given order source */
  playForSource(orderSource: string | null): void {
    if (!this.config.enabled || !this.initialized) return;

    // Cooldown check
    const now = Date.now();
    if (now - this.lastPlayTime < this.COOLDOWN_MS) return;

    const key = normalizeSource(orderSource);
    const preset = this.config[key];
    this._playPreset(preset);
    this.lastPlayTime = now;
  }

  /** Play a specific preset (for settings UI "Test" button) */
  playPreview(preset: SoundPreset): void {
    if (!this.initialized) return;
    this._playPreset(preset);
  }

  private _playPreset(preset: SoundPreset): void {
    if (preset === "none") return;
    const player = this.players.get(preset);
    if (!player) return;

    try {
      player.seekTo(0);
      player.play();
    } catch (err) {
      console.warn("[KDSSoundService] playback error:", err);
    }
  }

  /** Update the full config */
  updateConfig(config: Partial<KDSSoundConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Toggle master enable/disable */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /** Dispose all audio players */
  dispose(): void {
    for (const player of this.players.values()) {
      try {
        player.release();
      } catch {
        // ignore cleanup errors
      }
    }
    this.players.clear();
    this.initialized = false;
  }
}

export default KDSSoundService;
