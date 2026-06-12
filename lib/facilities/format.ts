import type { FacilityProperties } from './types';

/**
 * Popup formatting — must tolerate absent OSM fields. Never render
 * `undefined`/`null` to the user (US-2.1, playbook rule).
 */

export function formatName(props: Partial<FacilityProperties> | null | undefined): string {
  return props?.name?.trim() || 'Unnamed facility';
}

export function formatAddress(props: Partial<FacilityProperties> | null | undefined): string {
  return props?.address?.trim() || 'Address not recorded';
}

export function formatCapacity(props: Partial<FacilityProperties> | null | undefined): string {
  const capacity = props?.capacity?.toString().trim();
  return capacity ? `Capacity: ${capacity}` : 'Capacity: not recorded';
}

export function formatHazardTypes(props: Partial<FacilityProperties> | null | undefined): string {
  // Mapbox flattens nested feature properties to JSON strings on tap events —
  // accept both the array and its serialized form.
  let hazards = props?.hazardTypes;
  if (typeof hazards === 'string') {
    try {
      hazards = JSON.parse(hazards) as string[];
    } catch {
      hazards = null;
    }
  }
  if (!Array.isArray(hazards) || hazards.length === 0) {
    return 'Hazard types: not recorded';
  }
  return `Hazard types: ${hazards.join(', ')}`;
}
