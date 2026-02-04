import { useEffect, useRef, useState } from "react";

interface WeatherResult {
  temperature: number; // Fahrenheit
  description: string;
}

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// WMO Weather interpretation codes to descriptions
const WMO_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mostly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Heavy Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  66: "Freezing Rain",
  67: "Freezing Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  77: "Snow Grains",
  80: "Light Showers",
  81: "Showers",
  82: "Heavy Showers",
  85: "Snow Showers",
  86: "Heavy Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ Hail",
  99: "Thunderstorm w/ Hail",
};

/**
 * Weather hook using the Open-Meteo API (free, no API key needed).
 * Geocodes city+state, then fetches current weather.
 * Refreshes every 30 minutes. Returns null on error/offline.
 */
export const useWeather = (
  city?: string,
  state?: string
): WeatherResult | null => {
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!city || !state) return;

    const fetchWeather = async () => {
      try {
        // Step 1: Geocode city + state
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city + " " + state)}&count=1&language=en&format=json`
        );
        if (!geoRes.ok) return;

        const geoData = await geoRes.json();
        const location = geoData?.results?.[0];
        if (!location) return;

        // Step 2: Fetch current weather
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
        );
        if (!weatherRes.ok) return;

        const weatherData = await weatherRes.json();
        const current = weatherData?.current;
        if (!current) return;

        setWeather({
          temperature: Math.round(current.temperature_2m),
          description:
            WMO_CODES[current.weather_code] ?? "Unknown",
        });
      } catch {
        // Gracefully handle offline/errors
      }
    };

    // Defer initial fetch by 3s to avoid blocking transition animations
    const initialTimeout = setTimeout(() => {
      fetchWeather();
      intervalRef.current = setInterval(fetchWeather, REFRESH_INTERVAL);
    }, 3000);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [city, state]);

  return weather;
};
