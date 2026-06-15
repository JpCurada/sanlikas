import { StyleSheet, Text, View } from 'react-native';
import {
  FACILITY_META,
  FACILITY_TYPES,
  type FacilityType,
} from '@/lib/facilities/types';

interface LegendProps {
  visible: Record<FacilityType, boolean>;
}

/** Color → facility-type legend (US-2.1). Shows only the toggled-on layers. */
export function Legend({ visible }: LegendProps) {
  const shown = FACILITY_TYPES.filter((type) => visible[type]);
  if (shown.length === 0) return null;

  return (
    <View style={styles.box} pointerEvents="none">
      {shown.map((type) => {
        const meta = FACILITY_META[type];
        return (
          <View key={type} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <Text style={styles.label}>{meta.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 12,
    top: 60,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 11,
    color: '#44544c',
    fontWeight: '500',
  },
});
