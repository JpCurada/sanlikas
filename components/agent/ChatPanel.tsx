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
import { getActiveHazards, isRainWarningActive } from '@/lib/hazards/seed';
import { runAgentTurn } from '@/lib/agent/loop';
import { GEMINI_API_KEY, GEMINI_KEY_PRESENT } from '@/lib/agent/config';
import type { AgentContext, NearestCenter } from '@/lib/agent/types';

export interface RouteResult {
  route: RoutePath;
  facility: Feature<Point, FacilityProperties>;
}

interface ChatPanelProps {
  origin: LngLat | null;
  facilities: Feature<Point, FacilityProperties>[];
  onClose: () => void;
  onRoute: (result: RouteResult) => void;
  onRequestLocation: () => void;
  onUseDemoLocation: () => void;
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
  facilities,
  onClose,
  onRoute,
  onRequestLocation,
  onUseDemoLocation,
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

      const ctx: AgentContext = {
        origin,
        facilities,
        hazards: getActiveHazards() as HazardZone[],
        rainWarningActive: isRainWarningActive(),
      };

      try {
        for await (const ev of runAgentTurn(GEMINI_API_KEY, text, ctx)) {
          if (ev.type === 'status') {
            // Replace any prior status bubble with the latest.
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
      <View style={styles.header}>
        <Text style={styles.title}>Saan Tayo Lilikas?</Text>
        <Pressable onPress={onClose} accessibilityLabel="Close assistant">
          <Icon name="close" size={22} color="#1F2933" />
        </Pressable>
      </View>

      {!origin && (
        <View style={styles.locationRow}>
          <Pressable
            style={styles.locationBanner}
            onPress={onRequestLocation}
            disabled={locationPending}
          >
            {locationPending ? (
              <ActivityIndicator color="#2E86AB" />
            ) : (
              <Icon name="location-outline" size={18} color="#2E86AB" />
            )}
            <Text style={styles.locationText}>
              {locationPending ? 'Hinahanap ang lokasyon…' : 'Gamitin ang lokasyon ko'}
            </Text>
          </Pressable>
          <Pressable style={styles.demoButton} onPress={onUseDemoLocation}>
            <Text style={styles.demoButtonText}>Demo (Manila)</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={bubbles}
        keyExtractor={(b) => b.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <BubbleView bubble={item} onRoute={() => {}} />}
        ListEmptyComponent={
          <Pressable style={styles.suggestion} onPress={() => send(SUGGESTED)}>
            <Text style={styles.suggestionText}>“{SUGGESTED}”</Text>
          </Pressable>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Magtanong…"
          placeholderTextColor="#9AA5B1"
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
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Icon name="send" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function BubbleView({ bubble }: { bubble: Bubble; onRoute: () => void }) {
  if (bubble.role === 'status') {
    return (
      <View style={styles.statusBubble}>
        <ActivityIndicator size="small" color="#627D98" />
        <Text style={styles.statusText}>{bubble.text}</Text>
      </View>
    );
  }
  if (bubble.role === 'fallback') {
    return (
      <View style={styles.agentBubble}>
        <Text style={styles.fallbackHeader}>Pinakamalapit na mga sentro:</Text>
        {bubble.centers.map((c, i) => (
          <Text key={i} style={styles.fallbackItem}>
            {i + 1}. {c.facility.properties.name ?? 'Evacuation center'} —{' '}
            {(c.straightLineMeters / 1000).toFixed(1)} km
          </Text>
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
    maxHeight: '62%',
    backgroundColor: '#F4F6F8',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1F2933' },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  locationBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#E3F0F6',
  },
  locationText: { flex: 1, color: '#2E86AB', fontSize: 13 },
  demoButton: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1B998B',
  },
  demoButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  suggestion: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#E4ECF2',
  },
  suggestionText: { color: '#486581', fontSize: 14, fontStyle: 'italic' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 14 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2E86AB' },
  agentBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' },
  userText: { color: '#FFFFFF', fontSize: 14 },
  agentText: { color: '#1F2933', fontSize: 14, lineHeight: 20 },
  statusBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  statusText: { color: '#627D98', fontSize: 13, fontStyle: 'italic' },
  fallbackHeader: { fontWeight: '700', color: '#1F2933', marginBottom: 4, fontSize: 14 },
  fallbackItem: { color: '#334E68', fontSize: 13, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2933',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2E86AB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#9FB3C8' },
});
