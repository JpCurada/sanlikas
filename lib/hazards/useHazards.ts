import { useEffect, useRef, useState } from 'react';
import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone } from '@/lib/routing/types';
import { getSupabase, SUPABASE_CONFIGURED } from '@/lib/supabase/client';
import { fetchActiveHazards } from './source';

export interface UseHazardsResult {
  hazards: HazardZone[];
  source: 'live' | 'seed';
  /** Manually re-pull (e.g. the agent does this at ask-time). */
  refresh: () => Promise<HazardZone[]>;
}

/**
 * Live hazard state for the map. Fetches the active set once, then subscribes to
 * Supabase Realtime on the `reports` table: any insert/update (a new report, or
 * one marked resolved) triggers a refetch of the full active set — so the map
 * reflects authority reports the moment they're filed, without re-asking.
 *
 * Refetch-on-event (rather than mutating from the event payload) is deliberate:
 * the get_active_hazards RPC already applies the recency/proximity/resolved
 * filtering, so a resolved or expired report drops correctly (design §3.3).
 * Falls back to a one-shot seed fetch when Supabase is unconfigured.
 */
export function useHazards(origin: LngLat | null): UseHazardsResult {
  const [hazards, setHazards] = useState<HazardZone[]>([]);
  const [source, setSource] = useState<'live' | 'seed'>('seed');
  const originRef = useRef<LngLat | null>(origin);
  originRef.current = origin;

  const refresh = useRef(async (): Promise<HazardZone[]> => {
    const res = await fetchActiveHazards(originRef.current);
    setHazards(res.hazards);
    setSource(res.source);
    return res.hazards;
  }).current;

  // Initial fetch + refetch whenever the origin changes (proximity filter).
  useEffect(() => {
    let cancelled = false;
    fetchActiveHazards(origin).then((res) => {
      if (cancelled) return;
      setHazards(res.hazards);
      setSource(res.source);
    });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  // Realtime subscription: refetch on any reports change.
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('reports-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        () => {
          // Any insert/update/delete -> re-pull the authoritative active set.
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { hazards, source, refresh };
}
