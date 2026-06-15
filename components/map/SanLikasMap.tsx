import React, { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Mapbox, { STYLE_URL_2D, STYLE_URL_3D } from '@/lib/map/mapbox';
import {
  clampToNcr,
  NCR_CENTER,
  NCR_DEFAULT_PITCH,
  NCR_INITIAL_ZOOM,
  NCR_MAX_BOUNDS,
  NCR_MAX_ZOOM,
  NCR_MIN_ZOOM,
  type LngLat,
} from '@/lib/geo/ncr';
import type { FacilityLayerState, FacilityType } from '@/lib/facilities/types';
import { FacilityLayers, type FacilityPressEvent } from './FacilityLayers';

export interface MapHandle {
  /** Fit the camera to a set of coordinates (used to frame a new route). */
  fitTo: (coords: LngLat[]) => void;
}

interface SanLikasMapProps {
  /** '3d' mounts terrain + building extrusions; '2d' is the fallback (US-1.1). */
  mode: '3d' | '2d';
  layers: Record<FacilityType, FacilityLayerState>;
  visibleLayers: Record<FacilityType, boolean>;
  onFacilityPress: (event: FacilityPressEvent) => void;
  onMapReady: () => void;
  onMapLoadError: () => void;
  onMapPress?: (coordinate: LngLat) => void;
  /** Route overlay etc. rendered above the facility layers. */
  children?: React.ReactNode;
  handleRef?: React.MutableRefObject<MapHandle | null>;
}

/**
 * The map surface: 3D NCR map locked to Metro Manila (US-1.1 / US-1.2).
 * All bounds/zoom constants come from lib/geo/ncr.ts — never inline them.
 */
export function SanLikasMap({
  mode,
  layers,
  visibleLayers,
  onFacilityPress,
  onMapReady,
  onMapLoadError,
  onMapPress,
  children,
  handleRef,
}: SanLikasMapProps) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const is3d = mode === '3d';

  const handleClusterPress = useCallback((coordinates: [number, number], zoom: number) => {
    // Clamp before animating — maxBounds and flyTo fight otherwise (playbook).
    cameraRef.current?.setCamera({
      centerCoordinate: clampToNcr(coordinates),
      zoomLevel: Math.min(zoom + 0.5, NCR_MAX_ZOOM),
      animationDuration: 500,
    });
  }, []);

  if (handleRef) {
    handleRef.current = {
      fitTo: (coords: LngLat[]) => {
        if (coords.length === 0) return;
        let minLon = Infinity;
        let minLat = Infinity;
        let maxLon = -Infinity;
        let maxLat = -Infinity;
        for (const [lon, lat] of coords) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        cameraRef.current?.fitBounds(
          clampToNcr([maxLon, maxLat]),
          clampToNcr([minLon, minLat]),
          [80, 80, 280, 80],
          700,
        );
      },
    };
  }

  const handleMapPress = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Point>) => {
      const c = feature.geometry?.coordinates;
      if (onMapPress && Array.isArray(c)) onMapPress([c[0], c[1]]);
    },
    [onMapPress],
  );

  return (
    <Mapbox.MapView
      style={styles.map}
      styleURL={is3d ? STYLE_URL_3D : STYLE_URL_2D}
      pitchEnabled={is3d}
      rotateEnabled={is3d}
      logoEnabled
      attributionEnabled
      scaleBarEnabled={false}
      onDidFinishLoadingMap={onMapReady}
      onDidFailLoadingMap={onMapLoadError}
      onPress={handleMapPress}
    >
      <Mapbox.Camera
        ref={cameraRef}
        maxBounds={NCR_MAX_BOUNDS}
        minZoomLevel={NCR_MIN_ZOOM}
        maxZoomLevel={NCR_MAX_ZOOM}
        defaultSettings={{
          centerCoordinate: NCR_CENTER,
          zoomLevel: NCR_INITIAL_ZOOM,
          pitch: is3d ? NCR_DEFAULT_PITCH : 0,
        }}
      />

      {is3d && (
        <>
          <Mapbox.RasterDemSource
            id="mapbox-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={514}
            maxZoomLevel={14}
          >
            <Mapbox.Terrain style={{ exaggeration: 1.2 }} />
          </Mapbox.RasterDemSource>
          <Mapbox.FillExtrusionLayer
            id="buildings-3d"
            sourceID="composite"
            sourceLayerID="building"
            filter={['==', ['get', 'extrude'], 'true']}
            minZoomLevel={14}
            maxZoomLevel={NCR_MAX_ZOOM}
            style={{
              fillExtrusionColor: '#CBD2D9',
              fillExtrusionHeight: ['get', 'height'],
              fillExtrusionBase: ['get', 'min_height'],
              fillExtrusionOpacity: 0.75,
            }}
          />
        </>
      )}

      <FacilityLayers
        layers={layers}
        visible={visibleLayers}
        onFacilityPress={onFacilityPress}
        onClusterPress={handleClusterPress}
      />

      {children}
    </Mapbox.MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
