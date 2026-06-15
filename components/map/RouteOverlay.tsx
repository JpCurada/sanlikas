import React from 'react';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import Mapbox from '@/lib/map/mapbox';
import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone, RoutePath } from '@/lib/routing/types';

interface RouteOverlayProps {
  origin: LngLat | null;
  route: RoutePath | null;
  destination: { coordinate: LngLat; name: string } | null;
  hazards: HazardZone[];
}

/**
 * Renders the agent's route on the map: hazard buffers (so the user sees WHY the
 * path bends), the route line, the origin, and the destination marker (US-3.4).
 * Purely presentational — fed by the route event from the agent loop.
 */
export function RouteOverlay({ origin, route, destination, hazards }: RouteOverlayProps) {
  const hazardFc = hazardBuffers(hazards);

  return (
    <>
      {hazardFc.features.length > 0 && (
        <Mapbox.ShapeSource id="hazard-buffers" shape={hazardFc}>
          <Mapbox.FillLayer
            id="hazard-buffers-fill"
            style={{ fillColor: '#D7263D', fillOpacity: 0.18 }}
          />
          <Mapbox.LineLayer
            id="hazard-buffers-outline"
            style={{ lineColor: '#D7263D', lineWidth: 1.5, lineOpacity: 0.5 }}
          />
        </Mapbox.ShapeSource>
      )}

      {route && (
        <Mapbox.ShapeSource id="route-line" shape={lineFeature(route.coordinates)}>
          <Mapbox.LineLayer
            id="route-line-casing"
            style={{
              lineColor: '#FFFFFF',
              lineWidth: 9,
              lineOpacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Mapbox.LineLayer
            id="route-line-layer"
            style={{
              lineColor: route.compromised ? '#F3A712' : '#158F64',
              lineWidth: 5,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </Mapbox.ShapeSource>
      )}

      {origin && (
        <Mapbox.ShapeSource id="route-origin" shape={pointFeature(origin)}>
          <Mapbox.CircleLayer
            id="route-origin-dot"
            style={{
              circleRadius: 7,
              circleColor: '#1B998B',
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 2,
            }}
          />
        </Mapbox.ShapeSource>
      )}

      {destination && (
        <Mapbox.PointAnnotation
          id="route-destination"
          coordinate={destination.coordinate}
          title={destination.name}
        >
          <Mapbox.Callout title={destination.name} />
        </Mapbox.PointAnnotation>
      )}
    </>
  );
}

function lineFeature(coords: LngLat[]): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };
}

function pointFeature(coord: LngLat): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: {},
  };
}

/** Approximate circular polygons for hazard buffers (hard radius). */
function hazardBuffers(hazards: HazardZone[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: hazards.map((h) => circlePolygon(h.center, h.hardRadiusM, h.id)),
  };
}

function circlePolygon(center: LngLat, radiusM: number, id: string): Feature<Polygon> {
  const steps = 48;
  const [lon, lat] = center;
  const latR = (radiusM / 111320);
  const lonR = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lon + lonR * Math.cos(theta), lat + latR * Math.sin(theta)]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { id },
  };
}
