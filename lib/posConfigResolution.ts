import {
  DEFAULT_POS_CONFIG,
  type LocationPosConfigPatch,
  type LocationPosConfig,
  type StationPosConfigOverrides,
} from "@/types/locationConfig";

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue) as T;
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneJsonValue(nestedValue),
      ]),
    ) as T;
  }
  return value;
}

function stripStationMetadata(
  stationOverrides: StationPosConfigOverrides | null | undefined,
): PlainRecord | null | undefined {
  if (!stationOverrides) return stationOverrides as null | undefined;

  const sanitized = { ...(stationOverrides as PlainRecord) };
  delete sanitized._version;
  delete sanitized._updated_at;
  return sanitized;
}

export function deepMergePosConfig<T extends PlainRecord>(
  base: T,
  override: PlainRecord | null | undefined,
): T {
  const result = cloneJsonValue(base) as PlainRecord;
  if (!override) return result as T;

  for (const [key, overrideValue] of Object.entries(override)) {
    if (overrideValue === undefined) continue;

    const baseValue = result[key];
    if (isPlainRecord(baseValue) && isPlainRecord(overrideValue)) {
      result[key] = deepMergePosConfig(baseValue, overrideValue);
    } else {
      result[key] = cloneJsonValue(overrideValue);
    }
  }

  return result as T;
}

export function resolveEffectivePosConfig(
  locationConfig?: LocationPosConfigPatch | null,
  stationOverrides?: StationPosConfigOverrides | null,
): LocationPosConfig {
  const withLocation = deepMergePosConfig(
    DEFAULT_POS_CONFIG as unknown as PlainRecord,
    locationConfig as PlainRecord | null | undefined,
  );

  return deepMergePosConfig(
    withLocation,
    stripStationMetadata(stationOverrides),
  ) as unknown as LocationPosConfig;
}
