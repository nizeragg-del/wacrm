import type { OSMBusiness } from './types';

// Multiple Overpass endpoints for failover
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];
const USER_AGENT = 'WACRM-LeadCapture/1.0 (https://wacrm.com)';

const CATEGORY_MAP: Record<string, string[]> = {
  restaurant: ['restaurant'],
  dentist: ['dentist', 'dentistry'],
  doctor: ['doctor', 'clinic'],
  lawyer: ['lawyer', 'attorney'],
  mechanic: ['car_repair', 'mechanic'],
  pharmacy: ['pharmacy'],
  gym: ['fitness_centre', 'fitness_center', 'gym'],
  hotel: ['hotel', 'motel'],
  bakery: ['bakery'],
  cafe: ['cafe', 'coffee'],
  supermarket: ['supermarket', 'grocery'],
  school: ['school'],
  beauty: ['beauty_salon', 'hairdresser'],
  vet: ['veterinary'],
  bar: ['bar'],
  shop: ['shop'],
  office: ['office'],
  pet: ['veterinary', 'pet_grooming', 'pet_shop'],
};

export async function searchBusinesses(
  lat: number,
  lon: number,
  category: string,
  radius: number
): Promise<OSMBusiness[]> {
  const osmTags = CATEGORY_MAP[category.toLowerCase()] || [category.toLowerCase()];
  
  // Simplified query - search one tag at a time
  const tag = osmTags[0];
  const query = `[out:json][timeout:15];node["amenity"="${tag}"](around:${radius},${lat},${lon});out;`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Try different endpoints
    const endpointIndex = (attempt - 1) % OVERPASS_ENDPOINTS.length;
    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];
    
    console.log(`[overpass] Trying endpoint ${endpointIndex + 1}/${OVERPASS_ENDPOINTS.length}: ${endpoint}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Check for rate limiting
      if (response.status === 429) {
        const waitTime = attempt * 3000;
        console.warn(`[overpass] Rate limited on endpoint ${endpointIndex + 1}, waiting ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Check for errors in response
      if (data.error) {
        console.warn(`[overpass] API error: ${data.error}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
      }

      // Check for empty results
      if (!data.elements || data.elements.length === 0) {
        console.warn(`[overpass] Empty results for ${tag} (attempt ${attempt}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
      }

      interface OverpassElement {
        id: number;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }

      const results = (data.elements || []).map((el: OverpassElement) => ({
        name: el.tags?.name || 'Sem nome',
        address: formatAddress(el.tags),
        phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
        email: el.tags?.email || el.tags?.['contact:email'] || null,
        website: el.tags?.website || el.tags?.['contact:website'] || null,
        osm_id: el.id,
        lat: el.lat || el.center?.lat || 0,
        lon: el.lon || el.center?.lon || 0,
      }));

      console.log(`[overpass] Found ${results.length} ${tag} results`);
      return results;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[overpass] Attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < MAX_RETRIES) {
        const waitTime = attempt * 2000;
        console.warn(`[overpass] Retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`[overpass] All retries failed for ${category}:`, lastError?.message);
  return [];
}

function formatAddress(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;

  const parts = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:city'],
    tags['addr:state'],
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

export function filterWithoutWebsite(businesses: OSMBusiness[]): OSMBusiness[] {
  return businesses.filter((b) => !b.website);
}
