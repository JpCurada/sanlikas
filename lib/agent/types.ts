import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone, RoutePath } from '@/lib/routing/types';
import type { FacilityProperties } from '@/lib/facilities/types';
import type { Feature, Point } from 'geojson';

/** Tri-state tool outcome — distinguishes "nothing found" from "couldn't check". */
export type ToolStatus = 'ok' | 'empty' | 'unavailable';

/** Events the agent loop emits to the UI (design §4). The agent never renders. */
export type AgentEvent =
  | { type: 'status'; label: string }
  | { type: 'text'; chunk: string }
  | {
      type: 'route';
      route: RoutePath;
      facility: Feature<Point, FacilityProperties>;
      compromised: boolean;
      tradeoff: string;
    }
  | { type: 'fallback'; centers: NearestCenter[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface NearestCenter {
  facility: Feature<Point, FacilityProperties>;
  straightLineMeters: number;
}

/** Context the agent needs for a turn. */
export interface AgentContext {
  /** User's origin, or null if location is unavailable (agent will ask for a pin). */
  origin: LngLat | null;
  facilities: Feature<Point, FacilityProperties>[];
  hazards: HazardZone[];
}
