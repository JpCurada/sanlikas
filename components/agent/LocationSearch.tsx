import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import type { LngLat } from '@/lib/geo/ncr';
import { geocodeNcr, type GeocodeResult } from '@/lib/location/geocode';
import { COLORS, RADIUS } from '@/lib/theme';

interface LocationSearchProps {
  onPick: (coordinate: LngLat, name: string) => void;
}

/**
 * Type-to-search location input, scoped to Metro Manila (geocode.ts). Used when
 * GPS is unavailable: the resident types a street / barangay / landmark and
 * picks their place, which becomes the routing origin.
 */
export function LocationSearch({ onPick }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced geocode; aborts the previous request so stale results never win.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const r = await geocodeNcr(q, controller.signal);
        setResults(r);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Icon name="search-outline" size={18} color={COLORS.muted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Hanapin ang lugar (kalye, barangay)"
          placeholderTextColor={COLORS.muted}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={COLORS.muted} />}
      </View>

      {error && <Text style={styles.note}>Hindi makahanap ng lugar. Subukan muli.</Text>}
      {!error && query.trim().length >= 3 && !loading && results.length === 0 && (
        <Text style={styles.note}>Walang nahanap sa Metro Manila.</Text>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(r) => `${r.coordinate[0]},${r.coordinate[1]}`}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.result}
              onPress={() => {
                onPick(item.coordinate, item.name);
                setQuery('');
                setResults([]);
              }}
            >
              <Icon name="location-outline" size={16} color={COLORS.brand} />
              <Text style={styles.resultText} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: COLORS.ink },
  note: { color: COLORS.muted, fontSize: 12, marginTop: 8, marginLeft: 4 },
  list: { maxHeight: 184, marginTop: 8 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  resultText: { flex: 1, color: COLORS.body, fontSize: 14 },
});
