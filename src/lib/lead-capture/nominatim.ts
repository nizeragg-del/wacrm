import type { GeocodeResult } from './types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WACRM-LeadCapture/1.0';

export async function geocodeLocation(location: string): Promise<GeocodeResult> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = new URL(`${NOMINATIM_URL}/search`);
      url.searchParams.set('q', location);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle rate limiting (Nominatim requires 1 req/sec)
      if (response.status === 429) {
        const waitTime = attempt * 3000;
        console.warn(`[nominatim] Rate limited, waiting ${waitTime}ms (attempt ${attempt}/${MAX_RETRIES})`);
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
        const waitTime = attempt * 2000;
        console.warn(`[nominatim] Request failed, retrying in ${waitTime}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Nominatim geocoding failed after retries');
}
