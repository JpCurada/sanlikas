import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/lib/theme';

interface LoadingOverlayProps {
  message?: string;
}

/** Full-screen loading state. The UI is never a blank screen (US-1.1). */
export function LoadingOverlay({ message = 'Loading map' }: LoadingOverlayProps) {
  return (
    <View style={styles.container} pointerEvents="none">
      <ActivityIndicator size="large" color={COLORS.brand} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSoft,
    gap: 14,
  },
  text: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: '500',
  },
});
