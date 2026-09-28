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
  if (lower === "online" || lower === "web" || lower === "online_store")
    return "online";
  if (lower === "kiosk") return "kiosk";
  if (lower === "pos" || lower === "in_store") return "pos";
  if (
    lower === "orderout" || // marketplace aggregator (Grubhub etc. via OrderOut)
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

// ─── Shared players ───────────────────────────────────────────────
// Each expo-audio player is a full ExoPlayer on Android (its own playback,
// loader and codec threads plus an AudioTrack). Services used to preload all
// four presets per instance, and the KDS board, settings screens and POS
// layout each own one, so a tablet carried 8+ idle players. Instead, every
// service shares one player per preset, created on first need and released
// when the last service disposes.
type Preset = Exclude<SoundPreset, "none">;
const sharedPlayers = new Map<Preset, AudioPlayer>();
let sharedUsers = 0;
let audioModeReady: Promise<void> | null = null;

function ensureAudioMode(): Promise<void> {
  // Kitchen environments: ring even on silent, survive brief backgrounding,
  // and don't get ducked or paused by other apps' audio sessions.
  audioModeReady ??= setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "mixWithOthers",
    interruptionModeAndroid: "duckOthers",
  }).catch((err) => {
    audioModeReady = null; // let the next init retry
    throw err;
  });
  return audioModeReady;
}

function getSharedPlayer(preset: Preset): AudioPlayer {
  let player = sharedPlayers.get(preset);
  if (!player) {
    player = createAudioPlayer(SOUND_ASSETS[preset]);
    sharedPlayers.set(preset, player);
  }
  return player;
}

function releaseSharedPlayers(): void {
  for (const player of sharedPlayers.values()) {
    try {
      player.release();
    } catch {
      // ignore cleanup errors
    }
  }
  sharedPlayers.clear();
}

// ─── Service ──────────────────────────────────────────────────────
class KDSSoundService {
  private config: KDSSoundConfig = { ...DEFAULT_SOUND_CONFIG };
  private lastPlayTime = 0;
  private readonly COOLDOWN_MS = 1500;
  private initialized = false;
  // Set once a caller configures this service for new-order playback. Preview-
  // only services (settings screens) never do, so they create players on demand.
  private configured = false;
  // Bumped by dispose(), so an init() still awaiting the audio mode can tell
  // it was cancelled; a later init() starts a fresh generation.
  private generation = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    const generation = ++this.generation;

    try {
      await ensureAudioMode();
      if (generation !== this.generation || this.initialized) return;
      sharedUsers++;
      this.initialized = true;
      this.warmConfiguredPresets();
    } catch (err) {
      console.error("[KDSSoundService] init failed:", err);
    }
  }

  /**
   * Create players ahead of time only for presets this config can actually
   * play, so the first new-order sound isn't delayed by a load.
   */
  private warmConfiguredPresets(): void {
    if (!this.initialized || !this.configured || !this.config.enabled) return;
    const { pos, online, kiosk, third_party } = this.config;
    for (const preset of [pos, online, kiosk, third_party, this.config.default]) {
      if (preset !== "none") getSharedPlayer(preset);
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

    try {
      const player = getSharedPlayer(preset);
      player.seekTo(0);
      player.play();
    } catch (err) {
      console.warn("[KDSSoundService] playback error:", err);
    }
  }

  /** Update the full config */
  updateConfig(config: Partial<KDSSoundConfig>): void {
    this.config = { ...this.config, ...config };
    this.configured = true;
    this.warmConfiguredPresets();
  }

  /** Toggle master enable/disable */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.configured = true;
    this.warmConfiguredPresets();
  }

  /** Release this service; the shared players go when the last one does */
  dispose(): void {
    this.generation++;
    if (!this.initialized) return;
    this.initialized = false;
    sharedUsers = Math.max(0, sharedUsers - 1);
    if (sharedUsers === 0) releaseSharedPlayers();
  }
}

export default KDSSoundService;
