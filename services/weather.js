const { getSetting } = require('../db');

const CACHE_MS = 20 * 60 * 1000; // 20 minutes
let cache = { data: null, fetchedAt: 0, key: null };

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers',
  82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm',
};

async function getWeather() {
  const lat = getSetting('weather_lat', '29.4241');
  const lon = getSetting('weather_lon', '-98.4936');
  const locationName = getSetting('weather_location_name', 'San Antonio, TX');
  const cacheKey = `${lat},${lon}`;

  const now = Date.now();
  if (cache.data && cache.key === cacheKey && now - cache.fetchedAt < CACHE_MS) {
    return { ...cache.data, location: locationName };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Weather API responded ${resp.status}`);
    const json = await resp.json();
    const current = json.current || {};
    const data = {
      tempF: Math.round(current.temperature_2m),
      condition: WEATHER_CODES[current.weather_code] || 'Unknown',
      code: current.weather_code,
      updatedAt: new Date().toISOString(),
    };
    cache = { data, fetchedAt: now, key: cacheKey };
    return { ...data, location: locationName };
  } catch (err) {
    if (cache.data) return { ...cache.data, location: locationName, stale: true };
    return { tempF: null, condition: 'Unavailable', location: locationName, error: true };
  }
}

module.exports = { getWeather };
