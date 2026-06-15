import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import {
  FACILITY_META,
  FACILITY_TYPES,
  type FacilityLayerState,
  type FacilityType,
} from '@/lib/facilities/types';
import { COLORS, RADIUS, SHADOW } from '@/lib/theme';

interface LayerControlProps {
  layers: Record<FacilityType, FacilityLayerState>;
  visible: Record<FacilityType, boolean>;
  onToggle: (type: FacilityType) => void;
  onClose: () => void;
}

function statusHint(state: FacilityLayerState): string | null {
  switch (state.status) {
    case 'error':
      return 'Layer unavailable. Data failed to load.';
    case 'empty':
      return 'No facilities of this type recorded in Metro Manila';
    case 'loading':
      return 'Loading';
    default:
      return null;
  }
}

/**
 * Layer toggle panel (US-2.1). Unavailable layers are greyed out with an
 * error hint instead of disappearing; empty layers get an explicit note.
 */
export function LayerControl({ layers, visible, onToggle, onClose }: LayerControlProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Facility layers</Text>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close layer control"
        >
          <Icon name="close" size={18} color={COLORS.ink} />
        </Pressable>
      </View>
      {FACILITY_TYPES.map((type) => {
        const meta = FACILITY_META[type];
        const state = layers[type];
        const usable = state.status === 'ready';
        const hint = statusHint(state);
        return (
          <View key={type} style={[styles.row, !usable && styles.rowDisabled]}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <View style={styles.labelBlock}>
              <Text style={styles.label}>
                {meta.label}
                {usable && state.collection ? ` (${state.collection.features.length})` : ''}
              </Text>
              {hint && <Text style={styles.hint}>{hint}</Text>}
            </View>
            <Switch
              value={usable && visible[type]}
              onValueChange={() => onToggle(type)}
              disabled={!usable}
              trackColor={{ true: meta.color }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 296,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...SHADOW.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  labelBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 14,
    color: COLORS.ink,
    fontWeight: '500',
  },
  hint: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
