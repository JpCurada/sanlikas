import React, { useRef } from 'react';
import Mapbox from '@rnmapbox/maps';
import type { Feature, Point } from 'geojson';
import {
  FACILITY_META,
  FACILITY_TYPES,
  type FacilityLayerState,
  type FacilityProperties,
  type FacilityType,
} from '@/lib/facilities/types';

export interface FacilityPressEvent {
  properties: FacilityProperties;
  coordinates: [number, number];
}

interface FacilityLayersProps {
  layers: Record<FacilityType, FacilityLayerState>;
  visible: Record<FacilityType, boolean>;
  onFacilityPress: (event: FacilityPressEvent) => void;
  /** Cluster tap → zoom request (target must be clamped by the camera owner). */
  onClusterPress: (coordinates: [number, number], zoom: number) => void;
}

const CLUSTER_FILTER = ['has', 'point_count'] as const;
const POINT_FILTER = ['!', ['has', 'point_count']] as const;
const EVACUATION_ICON = 'shelter-15';

function FacilityLayer({
  type,
  state,
  onFacilityPress,
  onClusterPress,
}: {
  type: FacilityType;
  state: FacilityLayerState;
  onFacilityPress: FacilityLayersProps['onFacilityPress'];
  onClusterPress: FacilityLayersProps['onClusterPress'];
}) {
  const sourceRef = useRef<Mapbox.ShapeSource>(null);
  const meta = FACILITY_META[type];

  if (state.status !== 'ready' || !state.collection) return null;

  const handlePress = async (event: { features: Feature[] }) => {
    const feature = event.features[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const coordinates = (feature.geometry as Point).coordinates as [number, number];

    if (feature.properties && 'point_count' in feature.properties) {
      try {
        const zoom = await sourceRef.current?.getClusterExpansionZoom(feature);
        onClusterPress(coordinates, typeof zoom === 'number' ? zoom : 14);
      } catch {
        onClusterPress(coordinates, 14);
      }
      return;
    }
    onFacilityPress({
      properties: feature.properties as unknown as FacilityProperties,
      coordinates,
    });
  };

  return (
    <Mapbox.ShapeSource
      ref={sourceRef}
      id={`facility-src-${type}`}
      shape={state.collection}
      cluster
      clusterRadius={60}
      clusterMaxZoomLevel={14}
      onPress={handlePress}
    >
      <Mapbox.CircleLayer
        id={`facility-clusters-${type}`}
        filter={[...CLUSTER_FILTER]}
        style={{
          circleColor: meta.color,
          circleOpacity: 0.75,
          // Compact clusters: 10 px base, growing modestly with count.
          circleRadius: ['step', ['get', 'point_count'], 10, 10, 13, 50, 16],
          circleStrokeWidth: 1.5,
          circleStrokeColor: '#FFFFFF',
        }}
      />
      <Mapbox.SymbolLayer
        id={`facility-cluster-count-${type}`}
        filter={[...CLUSTER_FILTER]}
        style={{
          textField: ['get', 'point_count_abbreviated'],
          textSize: 11,
          textColor: '#FFFFFF',
          textIgnorePlacement: true,
          textAllowOverlap: true,
        }}
      />
      {type === 'evacuation' ? (
        <Mapbox.SymbolLayer
          id="facility-points-evacuation"
          filter={[...POINT_FILTER]}
          style={{
            iconImage: EVACUATION_ICON,
            iconSize: 1.35,
            iconColor: meta.color,
            iconHaloColor: '#FFFFFF',
            iconHaloWidth: 1.5,
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
          }}
        />
      ) : (
        <Mapbox.CircleLayer
          id={`facility-points-${type}`}
          filter={[...POINT_FILTER]}
          style={{
            circleColor: meta.color,
            circleOpacity: 0.9,
            circleRadius: 5,
            circleStrokeWidth: 1.5,
            circleStrokeColor: '#FFFFFF',
          }}
        />
      )}
    </Mapbox.ShapeSource>
  );
}

/**
 * Six clustered facility layers from the build-time GeoJSON (US-2.1).
 * Layers with status "error"/"empty" simply don't mount — failure of one
 * never affects the others; the layer control surfaces their status.
 */
export function FacilityLayers({ layers, visible, onFacilityPress, onClusterPress }: FacilityLayersProps) {
  return (
    <>
      {FACILITY_TYPES.filter((type) => visible[type]).map((type) => (
        <FacilityLayer
          key={type}
          type={type}
          state={layers[type]}
          onFacilityPress={onFacilityPress}
          onClusterPress={onClusterPress}
        />
      ))}
    </>
  );
}
