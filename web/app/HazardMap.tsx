'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { NCR_BOUNDS, type Report } from '@/lib/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface HazardMapProps {
  /** Currently-being-placed pin (null until the officer clicks). */
  pin: { lng: number; lat: number } | null;
  hardRadiusM: number;
  softRadiusM: number;
  /** Existing active reports to show as context. */
  activeReports: Report[];
  onPick: (lng: number, lat: number) => void;
}

/** A circle as a GeoJSON polygon (meters -> degrees, equirectangular). */
function circle(lng: number, lat: number, radiusM: number) {
  const steps = 64;
  const latR = radiusM / 111320;
  const lonR = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + lonR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return { type: 'Polygon' as const, coordinates: [ring] };
}

export function HazardMap({
  pin,
  hardRadiusM,
  softRadiusM,
  activeReports,
  onPick,
}: HazardMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Latest onPick without re-binding the map.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // Gates the data effects: sources only exist after the style loads.
  const [ready, setReady] = useState(false);

  // Init once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: NCR_BOUNDS.center,
      zoom: 11,
      maxBounds: [NCR_BOUNDS.sw, NCR_BOUNDS.ne],
    });
    mapRef.current = map;

    map.on('load', () => {
      // Active reports: filled severity-colored zones with a solid outline so
      // they read clearly even at low fill opacity.
      map.addSource('active', { type: 'geojson', data: emptyFc() });
      map.addLayer({
        id: 'active-fill',
        type: 'fill',
        source: 'active',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'active-outline',
        type: 'line',
        source: 'active',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.85 },
      });

      // The pin being placed: soft ring, hard ring, center dot.
      map.addSource('pin-soft', { type: 'geojson', data: emptyFc() });
      map.addLayer({
        id: 'pin-soft-fill',
        type: 'fill',
        source: 'pin-soft',
        paint: { 'fill-color': '#f3a712', 'fill-opacity': 0.2 },
      });
      map.addSource('pin-hard', { type: 'geojson', data: emptyFc() });
      map.addLayer({
        id: 'pin-hard-fill',
        type: 'fill',
        source: 'pin-hard',
        paint: { 'fill-color': '#d7263d', 'fill-opacity': 0.35 },
      });
      map.addSource('pin-dot', { type: 'geojson', data: emptyFc() });
      map.addLayer({
        id: 'pin-dot-circle',
        type: 'circle',
        source: 'pin-dot',
        paint: {
          'circle-radius': 6,
          'circle-color': '#d7263d',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      setReady(true);
    });

    map.on('click', (e) => onPickRef.current(e.lngLat.lng, e.lngLat.lat));

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Update active-reports layer (waits for `ready` so the source exists).
  useEffect(() => {
    if (!ready) return;
    const src = mapRef.current?.getSource('active') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: activeReports.map((r) => ({
        type: 'Feature',
        geometry: circle(r.lng, r.lat, r.hard_radius_m),
        properties: { color: severityColor(r.severity) },
      })),
    });
  }, [activeReports, ready]);

  // Update the pin preview.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const set = (id: string, data: GeoJSON.GeoJSON) =>
      (map.getSource(id) as mapboxgl.GeoJSONSource | undefined)?.setData(data);
    if (!pin) {
      set('pin-soft', emptyFc());
      set('pin-hard', emptyFc());
      set('pin-dot', emptyFc());
      return;
    }
    set('pin-soft', feat(circle(pin.lng, pin.lat, softRadiusM)));
    set('pin-hard', feat(circle(pin.lng, pin.lat, hardRadiusM)));
    set('pin-dot', feat({ type: 'Point', coordinates: [pin.lng, pin.lat] }));
  }, [pin, hardRadiusM, softRadiusM, ready]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12 }} />;
}

function severityColor(severity: number) {
  return severity === 3 ? '#d7263d' : severity === 2 ? '#e8800c' : '#1c8c5a';
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
function feat(geometry: GeoJSON.Geometry): GeoJSON.Feature {
  return { type: 'Feature', geometry, properties: {} };
}
