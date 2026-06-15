import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone } from '@/lib/routing/types';

/**
 * Seed hazard reports for the demo. Stands in for the Supabase `reports` table
 * (design Epic 4); the routing engine and agent read hazards through
 * getActiveHazards() so swapping in live data later touches nothing else.
 *
 * Geometry is tuned (verified against the real NCR graph) so that from the demo
 * origin near Sampaloc/Quiapo, the flood blocks every clean approach to the
 * NEAREST evacuation center (Delpan, ~2.8 km) and clips the second-nearest
 * (Amadome), so the planner selects the third center (Evacuation Plan, ~5 km)
 * via a clean route — the "directed to a farther but safer shelter" scenario.
 */
export const DEMO_ORIGIN: LngLat = [120.992, 14.601];

export const SEED_HAZARDS: HazardZone[] = [
  {
    id: 'seed-flood-delpan-approach',
    kind: 'flood',
    center: [120.9658, 14.599], // on Delpan Evacuation Center's doorstep, Manila
    hardRadiusM: 450,
    softRadiusM: 700,
    severity: 3,
    description: 'Baha — hindi madaanan ang mga kalsada papuntang Delpan, tubig hanggang baywang.',
  },
];

/**
 * Active hazards the router/agent should consider. Offline fallback only; the
 * app fetches live authority reports from Supabase via fetchActiveHazards().
 */
export function getActiveHazards(): HazardZone[] {
  return SEED_HAZARDS;
}
