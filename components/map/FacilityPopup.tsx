import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import {
  formatAddress,
  formatCapacity,
  formatHazardTypes,
  formatName,
} from '@/lib/facilities/format';
import { FACILITY_META, type FacilityProperties, type FacilityType } from '@/lib/facilities/types';
import { COLORS, RADIUS, SHADOW } from '@/lib/theme';

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
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: meta?.color ?? COLORS.muted }]} />
        <Text style={styles.title} numberOfLines={2}>
          {formatName(properties)}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close details"
        >
          <Icon name="close" size={18} color={COLORS.ink} />
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
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 6,
    ...SHADOW.floating,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.lineStrong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSoft,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  type: {
    fontSize: 13,
    color: COLORS.brand,
    fontWeight: '600',
    marginBottom: 2,
  },
  row: {
    fontSize: 14,
    color: COLORS.body,
    lineHeight: 20,
  },
});
