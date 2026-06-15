import type { LngLat } from '@/lib/geo/ncr';

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters between two [lon, lat] points. */
export function haversineMeters([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Approximate distance in meters from point P to segment AB, using a local
 * equirectangular projection (accurate at city scale). Used to test whether an
 * edge passes through a hazard circle — endpoint tests alone miss long edges
 * that clip a buffer without either end being inside it.
 */
export function pointToSegmentMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const latRef = toRad((a[1] + b[1]) / 2);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(latRef);
  const px = p[0] * mPerDegLon;
  const py = p[1] * mPerDegLat;
  const ax = a[0] * mPerDegLon;
  const ay = a[1] * mPerDegLat;
  const bx = b[0] * mPerDegLon;
  const by = b[1] * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
