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
} from '@/lib/geo/ncr';
import type { FacilityLayerState, FacilityType } from '@/lib/facilities/types';
import { FacilityLayers, type FacilityPressEvent } from './FacilityLayers';

interface SanLikasMapProps {
  /** '3d' mounts terrain + building extrusions; '2d' is the fallback (US-1.1). */
  mode: '3d' | '2d';
  layers: Record<FacilityType, FacilityLayerState>;
  visibleLayers: Record<FacilityType, boolean>;
  onFacilityPress: (event: FacilityPressEvent) => void;
  onMapReady: () => void;
  onMapLoadError: () => void;
  onMapPress?: () => void;
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
      onPress={onMapPress}
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
    </Mapbox.MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
