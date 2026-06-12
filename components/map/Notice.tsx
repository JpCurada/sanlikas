import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';

interface NoticeProps {
  message: string;
}

/** Non-blocking notice banner (e.g., "3D view unavailable — showing 2D map"). */
export function Notice({ message }: NoticeProps) {
  return (
    <View style={styles.banner} pointerEvents="none">
      <Icon name="information-circle" size={16} color="#7B5800" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: '90%',
  },
  text: {
    fontSize: 12,
    color: '#7B5800',
    flexShrink: 1,
  },
});
