import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Feature, Point } from 'geojson';
import { Icon } from '@/components/Icon';
import type { FacilityProperties } from '@/lib/facilities/types';
import type { LngLat } from '@/lib/geo/ncr';
import type { HazardZone, RoutePath } from '@/lib/routing/types';
import { fetchActiveHazards } from '@/lib/hazards/source';
import { runAgentTurn } from '@/lib/agent/loop';
import { ensureGraphLoaded } from '@/lib/routing/graph';
import { GEMINI_API_KEY, GEMINI_KEY_PRESENT } from '@/lib/agent/config';
import type { AgentContext, NearestCenter } from '@/lib/agent/types';
import { COLORS, RADIUS, SHADOW } from '@/lib/theme';
import { LocationSearch } from './LocationSearch';

export interface RouteResult {
  route: RoutePath;
  facility: Feature<Point, FacilityProperties>;
}

interface ChatPanelProps {
  origin: LngLat | null;
  originLabel: string | null;
  facilities: Feature<Point, FacilityProperties>[];
  onClose: () => void;
  onRoute: (result: RouteResult) => void;
  onRequestLocation: () => void;
  onUseDemoLocation: () => void;
  onPickLocation: (coordinate: LngLat, name: string) => void;
  locationPending: boolean;
}

type Bubble =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; text: string }
  | { id: string; role: 'status'; text: string }
  | { id: string; role: 'fallback'; centers: NearestCenter[] };

const SUGGESTED = 'Saan tayo lilikas?';

export function ChatPanel({
  origin,
  originLabel,
  facilities,
  onClose,
  onRoute,
  onRequestLocation,
  onUseDemoLocation,
  onPickLocation,
  locationPending,
}: ChatPanelProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const nextId = () => `b${idRef.current++}`;

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setInput('');
      setBusy(true);
      setBubbles((b) => [...b, { id: nextId(), role: 'user', text }]);

      if (!GEMINI_KEY_PRESENT) {
        setBubbles((b) => [
          ...b,
          {
            id: nextId(),
            role: 'agent',
            text: 'Gemini API key is not configured (EXPO_PUBLIC_GEMINI_API_KEY). Add it to .env and restart.',
          },
        ]);
        setBusy(false);
        return;
      }

      // Load the pedestrian graph into the cache before the agent routes.
      await ensureGraphLoaded();
      const { hazards } = await fetchActiveHazards(origin);
      const ctx: AgentContext = {
        origin,
        facilities,
        hazards: hazards as HazardZone[],
      };

      try {
        for await (const ev of runAgentTurn(GEMINI_API_KEY, text, ctx)) {
          if (ev.type === 'status') {
            setBubbles((b) => [
              ...b.filter((x) => x.role !== 'status'),
              { id: nextId(), role: 'status', text: ev.label },
            ]);
          } else if (ev.type === 'text') {
            setBubbles((b) => [
              ...b.filter((x) => x.role !== 'status'),
              { id: nextId(), role: 'agent', text: ev.chunk },
            ]);
          } else if (ev.type === 'route') {
            onRoute({ route: ev.route, facility: ev.facility });
          } else if (ev.type === 'fallback') {
            setBubbles((b) => [
              ...b.filter((x) => x.role !== 'status'),
              { id: nextId(), role: 'fallback', centers: ev.centers },
            ]);
          } else if (ev.type === 'error') {
            setBubbles((b) => [
              ...b.filter((x) => x.role !== 'status'),
              { id: nextId(), role: 'agent', text: ev.message },
            ]);
          }
        }
      } finally {
        setBubbles((b) => b.filter((x) => x.role !== 'status'));
        setBusy(false);
      }
    },
    [busy, origin, facilities, onRoute],
  );

  return (
    <View style={styles.panel}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Evacuation assistant</Text>
          <Text style={styles.subtitle}>Saan tayo lilikas?</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close assistant">
          <Icon name="close" size={20} color={COLORS.ink} />
        </Pressable>
      </View>

      {origin ? (
        <View style={styles.locationChip}>
          <Icon name="location" size={15} color={COLORS.brand} />
          <Text style={styles.locationChipText} numberOfLines={1}>
            {originLabel ?? 'Lokasyon nakatakda'}
          </Text>
          <Pressable onPress={onRequestLocation} hitSlop={8}>
            <Text style={styles.locationChange}>Palitan</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.locationCard}>
          <Text style={styles.locationHeading}>Saan kayo naroroon?</Text>
          <View style={styles.locationButtons}>
            <Pressable
              style={styles.primaryLocation}
              onPress={onRequestLocation}
              disabled={locationPending}
            >
              {locationPending ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Icon name="navigate" size={16} color={COLORS.white} />
              )}
              <Text style={styles.primaryLocationText}>
                {locationPending ? 'Hinahanap' : 'Gamitin ang GPS'}
              </Text>
            </Pressable>
            <Pressable style={styles.ghostLocation} onPress={onUseDemoLocation}>
              <Text style={styles.ghostLocationText}>Demo</Text>
            </Pressable>
          </View>
          <Text style={styles.orLabel}>o hanapin ang inyong lugar</Text>
          <LocationSearch onPick={onPickLocation} />
        </View>
      )}

      <FlatList
        data={bubbles}
        keyExtractor={(b) => b.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <BubbleView bubble={item} />}
        ListEmptyComponent={
          <Pressable style={styles.suggestion} onPress={() => send(SUGGESTED)}>
            <Icon name="navigate-outline" size={16} color={COLORS.brand} />
            <Text style={styles.suggestionText}>{SUGGESTED}</Text>
          </Pressable>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Magtanong"
          placeholderTextColor={COLORS.muted}
          editable={!busy}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendButton, busy && styles.sendButtonDisabled]}
          onPress={() => send(input)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Icon name="arrow-up" size={20} color={COLORS.white} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function BubbleView({ bubble }: { bubble: Bubble }) {
  if (bubble.role === 'status') {
    return (
      <View style={styles.statusBubble}>
        <ActivityIndicator size="small" color={COLORS.muted} />
        <Text style={styles.statusText}>{bubble.text}</Text>
      </View>
    );
  }
  if (bubble.role === 'fallback') {
    return (
      <View style={styles.agentBubble}>
        <Text style={styles.fallbackHeader}>Pinakamalapit na mga sentro</Text>
        {bubble.centers.map((c, i) => (
          <View key={i} style={styles.fallbackRow}>
            <Text style={styles.fallbackRank}>{i + 1}</Text>
            <Text style={styles.fallbackName} numberOfLines={1}>
              {c.facility.properties.name ?? 'Evacuation center'}
            </Text>
            <Text style={styles.fallbackDist}>{(c.straightLineMeters / 1000).toFixed(1)} km</Text>
          </View>
        ))}
      </View>
    );
  }
  const mine = bubble.role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.userBubble : styles.agentBubble]}>
      <Text style={mine ? styles.userText : styles.agentText}>{bubble.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: COLORS.bgSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 14,
    ...SHADOW.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.lineStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  // Location set: compact chip
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  locationChipText: { flex: 1, color: COLORS.body, fontSize: 13 },
  locationChange: { color: COLORS.brand, fontSize: 13, fontWeight: '600' },

  // Location not set: card with options
  locationCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  locationHeading: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 12 },
  locationButtons: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  primaryLocation: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.sm,
    paddingVertical: 13,
  },
  primaryLocationText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  ghostLocation: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.bg,
  },
  ghostLocationText: { color: COLORS.ink, fontWeight: '600', fontSize: 14 },
  orLabel: { textAlign: 'center', color: COLORS.muted, fontSize: 12, marginBottom: 10 },

  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, gap: 10, paddingBottom: 8 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
  },
  suggestionText: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },

  bubble: { maxWidth: '86%', paddingVertical: 11, paddingHorizontal: 14, borderRadius: RADIUS.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.brand, borderBottomRightRadius: 4 },
  agentBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderBottomLeftRadius: 4,
  },
  userText: { color: COLORS.white, fontSize: 14, lineHeight: 20 },
  agentText: { color: COLORS.ink, fontSize: 14, lineHeight: 21 },

  statusBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  statusText: { color: COLORS.muted, fontSize: 13 },

  fallbackHeader: { fontWeight: '700', color: COLORS.ink, marginBottom: 8, fontSize: 14 },
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  fallbackRank: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bgSoft,
    color: COLORS.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  fallbackName: { flex: 1, color: COLORS.body, fontSize: 13 },
  fallbackDist: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: COLORS.muted },
});
