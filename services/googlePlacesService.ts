import type { ParsedAddress } from "@/utils/addressUtils";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export async function fetchAutocompleteSuggestions(
  input: string,
  sessionToken?: string,
): Promise<PlacePrediction[]> {
  if (!input.trim() || !API_KEY) return [];

  try {
    const params = new URLSearchParams({
      input,
      key: API_KEY,
      types: "address",
      components: "country:us",
    });
    if (sessionToken) params.set("sessiontoken", sessionToken);

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
    );
    const data = await res.json();

    if (data.status === "OK" && Array.isArray(data.predictions)) {
      return data.predictions.slice(0, 5);
    }
    return [];
  } catch (err) {
    console.warn("Google Places autocomplete error:", err);
    return [];
  }
}

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<ParsedAddress | null> {
  if (!placeId || !API_KEY) return null;

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: API_KEY,
      fields: "address_components",
    });
    if (sessionToken) params.set("sessiontoken", sessionToken);

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
    );
    const data = await res.json();

    if (data.status !== "OK" || !data.result?.address_components) return null;

    const components: Array<{ long_name: string; short_name: string; types: string[] }> =
      data.result.address_components;

    let streetNumber = "";
    let route = "";
    let city = "";
    let state = "";
    let zip = "";

    for (const c of components) {
      if (c.types.includes("street_number")) streetNumber = c.long_name;
      else if (c.types.includes("route")) route = c.long_name;
      else if (c.types.includes("locality")) city = c.long_name;
      else if (c.types.includes("sublocality_level_1") && !city) city = c.long_name;
      else if (c.types.includes("administrative_area_level_1")) state = c.short_name;
      else if (c.types.includes("postal_code")) zip = c.long_name;
    }

    const street = [streetNumber, route].filter(Boolean).join(" ");

    return { street, city, state, zip };
  } catch (err) {
    console.warn("Google Places details error:", err);
    return null;
  }
}
