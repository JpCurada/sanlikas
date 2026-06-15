import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { FacilityPopup } from '@/components/map/FacilityPopup';
import { LayerControl } from '@/components/map/LayerControl';
import { Legend } from '@/components/map/Legend';
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary';
import { Notice } from '@/components/map/Notice';
import { SanLikasMap, type MapHandle } from '@/components/map/SanLikasMap';
import { RouteOverlay } from '@/components/map/RouteOverlay';
import { ChatPanel, type RouteResult } from '@/components/agent/ChatPanel';
import type { FacilityPressEvent } from '@/components/map/FacilityLayers';
import { loadAllFacilityLayers } from '@/lib/facilities/load';
import { flattenFacilities } from '@/lib/facilities/flatten';
import {
  FACILITY_TYPES,
  type FacilityLayerState,
  type FacilityProperties,
  type FacilityType,
} from '@/lib/facilities/types';
import type { LngLat } from '@/lib/geo/ncr';
import type { RoutePath } from '@/lib/routing/types';
import { DEMO_ORIGIN, getActiveHazards } from '@/lib/hazards/seed';
import { useUserLocation } from '@/lib/location/useUserLocation';
import { MAPBOX_TOKEN_PRESENT } from '@/lib/map/mapbox';
import { useLayersStore } from '@/lib/state/layers';

const INITIAL_LAYERS = Object.fromEntries(
  FACILITY_TYPES.map((type) => [type, { status: 'loading', collection: null }]),
) as Record<FacilityType, FacilityLayerState>;

/**
 * Landing screen: the 3D NCR map (US-1.1). The screen stays thin — map
 * behavior lives in components/map/ and lib/.
 */
export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Layer toggles: gate the first map render on store rehydration (playbook).
  const hasHydrated = useLayersStore((s) => s.hasHydrated);
  const visible = useLayersStore((s) => s.visible);
  const toggleLayer = useLayersStore((s) => s.toggleLayer);

  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [mapReady, setMapReady] = useState(false);
  const [fatal, setFatal] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<FacilityProperties | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Agent / routing state.
  const [chatOpen, setChatOpen] = useState(false);
  const [route, setRoute] = useState<RoutePath | null>(null);
  const [destination, setDestination] = useState<{ coordinate: LngLat; name: string } | null>(
    null,
  );
  const [pinMode, setPinMode] = useState(false);
  const mapHandle = useRef<MapHandle | null>(null);
  const location = useUserLocation();

  const facilities = useMemo(() => flattenFacilities(layers), [layers]);
  const hazards = useMemo(() => getActiveHazards(), []);

  useEffect(() => {
    let cancelled = false;
    loadAllFacilityLayers(FACILITY_TYPES).then((result) => {
      if (!cancelled) setLayers(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRoute = useCallback((result: RouteResult) => {
    setRoute(result.route);
    setDestination({
      coordinate: result.facility.geometry.coordinates as LngLat,
      name: result.facility.properties.name ?? 'Evacuation center',
    });
    mapHandle.current?.fitTo(result.route.coordinates);
  }, []);

  const handleMapPress = useCallback(
    (coordinate: LngLat) => {
      if (pinMode) {
        location.setManual(coordinate);
        setPinMode(false);
        return;
      }
      setSelected(null);
      setPanelOpen(false);
    },
    [pinMode, location],
  );

  const fallBack = useCallback(() => {
    setSelected(null);
    setMapReady(false);
    setMode((current) => {
      if (current === '3d') return '2d';
      setFatal(true); // 2D failed too — full failure screen with retry (US-1.1)
      return current;
    });
  }, []);

  const retry = useCallback(() => {
    setFatal(false);
    setMode('3d');
    setMapReady(false);
    setRetryKey((k) => k + 1);
  }, []);

  const handleFacilityPress = useCallback((event: FacilityPressEvent) => {
    setSelected(event.properties);
  }, []);

  if (!hasHydrated) {
    return <LoadingOverlay message="Loading…" />;
  }

  if (!MAPBOX_TOKEN_PRESENT) {
    return (
      <View style={styles.fatal}>
        <Icon name="key-outline" size={36} color="#9AA5B1" />
        <Text style={styles.fatalTitle}>Map token missing</Text>
        <Text style={styles.fatalText}>
          EXPO_PUBLIC_MAPBOX_TOKEN is not configured. Copy .env.example to .env, fill in your
          Mapbox tokens, and restart the dev server.
        </Text>
      </View>
    );
  }

  if (fatal) {
    return (
      <View style={styles.fatal}>
        <Icon name="cloud-offline-outline" size={36} color="#9AA5B1" />
        <Text style={styles.fatalTitle}>Map unavailable</Text>
        <Text style={styles.fatalText}>
          The map could not load. Check your connection and try again.
        </Text>
        <Pressable style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
        <Pressable style={styles.hotlinesLink} onPress={() => router.push('/hotlines')}>
          <Text style={styles.hotlinesLinkLabel}>Emergency hotlines</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapErrorBoundary
        key={`${mode}-${retryKey}`}
        onError={fallBack}
        fallback={<LoadingOverlay message="Switching to 2D map…" />}
      >
        <SanLikasMap
          mode={mode}
          layers={layers}
          visibleLayers={visible}
          onFacilityPress={handleFacilityPress}
          onMapReady={() => setMapReady(true)}
          onMapLoadError={fallBack}
          onMapPress={handleMapPress}
          handleRef={mapHandle}
        >
          <RouteOverlay
            origin={location.origin}
            route={route}
            destination={destination}
            hazards={hazards}
          />
        </SanLikasMap>
      </MapErrorBoundary>

      {mapReady && <Legend visible={visible} />}

      <View style={[styles.actions, { top: insets.top + 8 }]}>
        <Pressable
          style={styles.actionButton}
          onPress={() => setPanelOpen((open) => !open)}
          accessibilityLabel="Toggle facility layers"
        >
          <Icon name="layers-outline" size={22} color="#1F2933" />
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => router.push('/hotlines')}
          accessibilityLabel="Emergency hotlines"
        >
          <Icon name="call-outline" size={22} color="#D7263D" />
        </Pressable>
      </View>

      {pinMode && (
        <Notice message="I-tap ang inyong lokasyon sa mapa" />
      )}

      {mapReady && !chatOpen && (
        <Pressable
          style={[styles.askButton, { bottom: insets.bottom + 20 }]}
          onPress={() => setChatOpen(true)}
          accessibilityLabel="Saan tayo lilikas?"
        >
          <Icon name="navigate" size={20} color="#FFFFFF" />
          <Text style={styles.askLabel}>Saan tayo lilikas?</Text>
        </Pressable>
      )}

      {chatOpen && (
        <ChatPanel
          origin={location.origin}
          facilities={facilities}
          onClose={() => setChatOpen(false)}
          onRoute={handleRoute}
          onRequestLocation={() => {
            // Try GPS; if denied/outside NCR, let the user drop a pin.
            location.request().then(() => {
              if (location.state.status === 'denied' || location.state.status === 'outside-ncr') {
                setPinMode(true);
              }
            });
          }}
          onUseDemoLocation={() => {
            location.setManual(DEMO_ORIGIN);
            mapHandle.current?.fitTo([DEMO_ORIGIN]);
          }}
          locationPending={location.state.status === 'requesting'}
        />
      )}

      {panelOpen && (
        <LayerControl
          layers={layers}
          visible={visible}
          onToggle={toggleLayer}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {selected && <FacilityPopup properties={selected} onClose={() => setSelected(null)} />}

      {mode === '2d' && mapReady && <Notice message="3D view unavailable — showing 2D map" />}

      {!mapReady && <LoadingOverlay />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1D2A' },
  actions: {
    position: 'absolute',
    right: 12,
    gap: 8,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  fatal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1D2A',
    padding: 32,
    gap: 12,
  },
  fatalTitle: {
    color: '#E5EAF0',
    fontSize: 18,
    fontWeight: '700',
  },
  fatalText: {
    color: '#9AA5B1',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: '#2E86AB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  retryLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  hotlinesLink: {
    paddingVertical: 8,
  },
  hotlinesLinkLabel: {
    color: '#F3A712',
    fontSize: 14,
    fontWeight: '600',
  },
  askButton: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D7263D',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  askLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
