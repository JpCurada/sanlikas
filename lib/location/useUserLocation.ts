import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { isInNcr, NCR_CENTER, type LngLat } from '@/lib/geo/ncr';

export type LocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'ok'; coordinate: LngLat; label: string }
  | { status: 'outside-ncr'; coordinate: LngLat }
  | { status: 'denied' }
  | { status: 'manual'; coordinate: LngLat; label: string };

/**
 * Lazily request location only when needed (playbook: never on launch).
 * Out-of-NCR and denied states fall back to a searched place or manual pin
 * (US-1.2 / US-3.1).
 */
export function useUserLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const request = useCallback(async () => {
    setState({ status: 'requesting' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState({ status: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate: LngLat = [pos.coords.longitude, pos.coords.latitude];
      setState(
        isInNcr(coordinate)
          ? { status: 'ok', coordinate, label: 'Kasalukuyang lokasyon' }
          : { status: 'outside-ncr', coordinate },
      );
    } catch {
      setState({ status: 'denied' });
    }
  }, []);

  /** Set the origin from a searched place or a dropped pin. */
  const setManual = useCallback((coordinate: LngLat, label = 'Napiling lokasyon') => {
    setState({ status: 'manual', coordinate, label });
  }, []);

  /** The usable origin for routing, or null if none yet. */
  const origin: LngLat | null =
    state.status === 'ok' || state.status === 'manual' ? state.coordinate : null;

  const originLabel: string | null =
    state.status === 'ok' || state.status === 'manual' ? state.label : null;

  return { state, origin, originLabel, request, setManual, defaultPin: NCR_CENTER };
}
