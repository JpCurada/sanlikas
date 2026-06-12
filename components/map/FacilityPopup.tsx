import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import {
  formatAddress,
  formatCapacity,
  formatHazardTypes,
  formatName,
} from '@/lib/facilities/format';
import { FACILITY_META, type FacilityProperties, type FacilityType } from '@/lib/facilities/types';

interface FacilityPopupProps {
  properties: FacilityProperties;
  onClose: () => void;
}

/**
 * Facility detail card (US-2.1). Every field tolerates absent OSM data —
 * "not recorded", never `undefined`.
 */
export function FacilityPopup({ properties, onClose }: FacilityPopupProps) {
  const meta = FACILITY_META[properties.facilityType as FacilityType];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: meta?.color ?? '#52606D' }]} />
        <Text style={styles.title} numberOfLines={2}>
          {formatName(properties)}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close details">
          <Icon name="close" size={22} color="#52606D" />
        </Pressable>
      </View>
      {meta && <Text style={styles.type}>{meta.label}</Text>}
      <Text style={styles.row}>{formatAddress(properties)}</Text>
      <Text style={styles.row}>{formatCapacity(properties)}</Text>
      <Text style={styles.row}>{formatHazardTypes(properties)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2933',
  },
  type: {
    fontSize: 13,
    color: '#52606D',
    fontWeight: '600',
  },
  row: {
    fontSize: 14,
    color: '#3E4C59',
  },
});
