import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone } from '@/lib/routing/types';
import { getSupabase, SUPABASE_CONFIGURED } from '@/lib/supabase/client';
import { SEED_HAZARDS } from './seed';

/** A row from the get_active_hazards RPC. */
interface HazardRow {
  id: string;
  hazard_type: HazardZone['kind'];
  description: string;
  severity: number;
  lng: number;
  lat: number;
  hard_radius_m: number;
  soft_radius_m: number;
}

function rowToZone(r: HazardRow): HazardZone {
  return {
    id: r.id,
    kind: r.hazard_type,
    center: [r.lng, r.lat],
    hardRadiusM: r.hard_radius_m,
    softRadiusM: r.soft_radius_m,
    severity: (r.severity as 1 | 2 | 3) ?? 2,
    description: r.description,
  };
}

export interface HazardFetch {
  hazards: HazardZone[];
  /** Where the data came from — surfaced so the agent can disclose staleness. */
  source: 'live' | 'seed';
}

/**
 * Fetch active DRRM hazard reports near the user. Reads live from Supabase
 * (filed by authorities via the web dashboard); falls back to the bundled seed
 * when Supabase is unconfigured or unreachable — so routing always has data, but
 * the source is reported so "couldn't check live" is never read as "all clear".
 */
export async function fetchActiveHazards(origin: LngLat | null): Promise<HazardFetch> {
  if (!SUPABASE_CONFIGURED) {
    return { hazards: SEED_HAZARDS, source: 'seed' };
  }
  const supabase = getSupabase();
  if (!supabase) return { hazards: SEED_HAZARDS, source: 'seed' };

  try {
    const { data, error } = await supabase.rpc('get_active_hazards', {
      in_lng: origin?.[0] ?? null,
      in_lat: origin?.[1] ?? null,
      in_radius_m: 8000,
      in_max_age_hours: 24,
    });
    if (error) throw error;
    return { hazards: (data as HazardRow[]).map(rowToZone), source: 'live' };
  } catch (err) {
    console.warn('[hazards] live fetch failed, using seed fallback:', err);
    return { hazards: SEED_HAZARDS, source: 'seed' };
  }
}
