import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { findSafestCenter } from '@/lib/routing/routeAsync';
import { haversineMeters } from '@/lib/routing/geo';
import type { HazardContext } from '@/lib/routing/hazardCost';
import type { RoutePath } from '@/lib/routing/types';
import type { AgentContext } from './types';

/**
 * Tool implementations for the ReAct agent. Each returns a compact, tri-state
 * result for Gemini to reason over; the routing tool additionally surfaces the
 * full RoutePath + chosen facility for the UI to render (Gemini only needs the
 * summary, not the polyline coordinates).
 */

export interface WeatherResult {
  status: 'ok' | 'unavailable';
  rainWarningActive?: boolean;
  summary?: string;
}

export function getWeatherStatus(ctx: AgentContext): WeatherResult {
  // Seed-backed for the demo (design §6 reserves the PAGASA scrape). Always "ok"
  // here; the real tool returns "unavailable" when the cache is stale/missing.
  return {
    status: 'ok',
    rainWarningActive: ctx.rainWarningActive,
    summary: ctx.rainWarningActive
      ? 'PAGASA: Heavy Rainfall Warning in effect over Metro Manila.'
      : 'PAGASA: no rainfall warning currently in effect.',
  };
}

export interface HazardReportsResult {
  status: 'ok' | 'empty' | 'unavailable';
  reports?: Array<{ kind: string; description: string; severity: number }>;
}

export function getHazardReports(
  ctx: AgentContext,
  origin: LngLat,
  radiusM = 5000,
): HazardReportsResult {
  // Seed-backed for the demo. Real tool: Supabase RPC; query failure ⇒
  // "unavailable" (NEVER an empty array — that reads as "all clear").
  const nearby = ctx.hazards.filter(
    (h) => haversineMeters(origin, h.center) <= radiusM + h.softRadiusM,
  );
  if (nearby.length === 0) return { status: 'empty' };
  return {
    status: 'ok',
    reports: nearby.map((h) => ({
      kind: h.kind,
      description: h.description,
      severity: h.severity,
    })),
  };
}

export interface RouteToolResult {
  status: 'ok' | 'unavailable';
  /** Compact summary for Gemini. */
  summary?: {
    facilityName: string;
    distanceMeters: number;
    durationMinutesWalking: number;
    compromised: boolean;
    crossedHazards: string[];
    tradeoff: string;
  };
  /** Full data for the UI (not sent to Gemini). */
  ui?: {
    route: RoutePath;
    facility: Feature<Point, FacilityProperties>;
    tradeoff: string;
  };
}

export async function routeToSafestCenter(
  ctx: AgentContext,
  origin: LngLat,
): Promise<RouteToolResult> {
  const hazardCtx: HazardContext = {
    hazards: ctx.hazards,
    rainWarningActive: ctx.rainWarningActive,
  };

  try {
    const result = await findSafestCenter(origin, ctx.facilities, hazardCtx);
    const chosen = result.chosen;
    if (!chosen || !chosen.route) return { status: 'unavailable' };

    const name = chosen.facility.properties.name ?? 'the evacuation center';
    const tradeoff = buildTradeoff(name, result);

    return {
      status: 'ok',
      summary: {
        facilityName: name,
        distanceMeters: Math.round(chosen.route.distanceMeters),
        durationMinutesWalking: chosen.route.durationMinutesWalking,
        compromised: result.compromised,
        crossedHazards: chosen.route.crossedHazards.map((h) => h.kind),
        tradeoff,
      },
      ui: { route: chosen.route, facility: chosen.facility, tradeoff },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

function buildTradeoff(
  chosenName: string,
  result: Awaited<ReturnType<typeof findSafestCenter>>,
): string {
  const chosen = result.chosen!;
  // Was a strictly-nearer candidate skipped because its route was hazardous?
  const nearer = result.candidates.find(
    (c) =>
      c.facility.properties.id !== chosen.facility.properties.id &&
      c.straightLineMeters < chosen.straightLineMeters &&
      (!c.route || c.route.compromised),
  );
  if (result.compromised) {
    return `All nearby routes cross a reported hazard. ${chosenName} is the least-exposed option — proceed with caution and follow local DRRM instructions.`;
  }
  if (nearer) {
    const nearerName = nearer.facility.properties.name ?? 'a closer center';
    return `${nearerName} is closer, but the route to it crosses a reported hazard, so ${chosenName} is the safer choice even though it is a bit farther.`;
  }
  return `${chosenName} is the nearest center with a clear, hazard-free route.`;
}
