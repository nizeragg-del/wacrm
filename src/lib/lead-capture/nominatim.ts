import type { GeocodeResult } from './types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WACRM-LeadCapture/1.0';

// Pre-defined coordinates for São Paulo state cities (avoids Nominatim timeout)
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'são paulo': { lat: -23.5505, lon: -46.6333 },
  'campinas': { lat: -22.9099, lon: -47.0626 },
  'sorocaba': { lat: -23.5208, lon: -47.4588 },
  'santos': { lat: -23.9608, lon: -46.3339 },
  'ribeirão preto': { lat: -21.1767, lon: -47.8208 },
  'são josé dos campos': { lat: -23.1896, lon: -45.8837 },
  'piracicaba': { lat: -22.7253, lon: -47.6492 },
  'bauru': { lat: -22.3246, lon: -49.0871 },
  'jundiaí': { lat: -23.1864, lon: -46.8842 },
  'marília': { lat: -22.2146, lon: -49.9459 },
  'guarulhos': { lat: -23.4538, lon: -46.5333 },
  'osasco': { lat: -23.5325, lon: -46.7915 },
  'santo André': { lat: -23.6738, lon: -46.5432 },
  'são bernardo do campo': { lat: -23.6914, lon: -46.5646 },
  'itaquaquecetuba': { lat: -23.4873, lon: -46.3476 },
  'mauá': { lat: -23.6687, lon: -46.4614 },
  'são jose do rio preto': { lat: -20.8113, lon: -49.3758 },
  'araraquara': { lat: -21.7947, lon: -48.1761 },
  'franca': { lat: -20.5386, lon: -47.4009 },
  'presidente prudente': { lat: -22.1207, lon: -51.3880 },
};

export async function geocodeLocation(location: string): Promise<GeocodeResult> {
  // First, check if we have pre-defined coordinates
  const normalizedLocation = location.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    const normalizedCity = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalizedLocation.includes(normalizedCity)) {
      console.log(`[nominatim] Using pre-defined coordinates for ${city}`);
      return {
        lat: coords.lat,
        lon: coords.lon,
        display_name: location,
      };
    }
  }

  // If not found in pre-defined, try Nominatim (with short timeout)
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = new URL(`${NOMINATIM_URL}/search`);
      url.searchParams.set('q', location);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout (was 10s)

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        const waitTime = attempt * 2000;
        console.warn(`[nominatim] Rate limited, waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Nominatim geocoding failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        throw new Error(`Could not geocode location: ${location}`);
      }

      const result = data[0];

      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        display_name: result.display_name,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        const waitTime = attempt * 1000;
        console.warn(`[nominatim] Request failed, retrying in ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Nominatim geocoding failed after retries');
}
