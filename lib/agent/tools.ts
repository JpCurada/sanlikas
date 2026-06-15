import type { Feature, Point } from 'geojson';
import type { LngLat } from '@/lib/geo/ncr';
import type { FacilityProperties } from '@/lib/facilities/types';
import { computeRoute, findSafestCenter } from '@/lib/routing/routeAsync';
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
  status: 'ok' | 'unavailable' | 'not_found';
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
  facilityName?: string,
): Promise<RouteToolResult> {
  const hazardCtx: HazardContext = { hazards: ctx.hazards };

  // If the user named a specific center, route directly to it (hazard-aware).
  if (facilityName && facilityName.trim()) {
    return routeToNamed(ctx, origin, hazardCtx, facilityName.trim());
  }

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

/** Route to a facility the user named (case-insensitive substring match). */
async function routeToNamed(
  ctx: AgentContext,
  origin: LngLat,
  hazardCtx: HazardContext,
  query: string,
): Promise<RouteToolResult> {
  const q = query.toLowerCase();
  const matches = ctx.facilities.filter((f) =>
    (f.properties.name ?? '').toLowerCase().includes(q),
  );
  if (matches.length === 0) return { status: 'not_found' };

  // Closest match by straight-line distance if several share the name.
  const facility = matches.sort(
    (a, b) =>
      haversineMeters(origin, a.geometry.coordinates as LngLat) -
      haversineMeters(origin, b.geometry.coordinates as LngLat),
  )[0];

  try {
    const route = await computeRoute(
      origin,
      facility.geometry.coordinates as LngLat,
      hazardCtx,
    );
    const name = facility.properties.name ?? query;
    const tradeoff = route.compromised
      ? `The route to ${name} crosses a reported hazard. Proceed with caution and follow local DRRM instructions.`
      : `Clear route to ${name}.`;
    return {
      status: 'ok',
      summary: {
        facilityName: name,
        distanceMeters: Math.round(route.distanceMeters),
        durationMinutesWalking: route.durationMinutesWalking,
        compromised: route.compromised,
        crossedHazards: route.crossedHazards.map((h) => h.kind),
        tradeoff,
      },
      ui: { route, facility, tradeoff },
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
