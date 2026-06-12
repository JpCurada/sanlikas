import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface LoadingOverlayProps {
  message?: string;
}

/** Full-screen loading state — the UI is never a blank screen (US-1.1). */
export function LoadingOverlay({ message = 'Loading map…' }: LoadingOverlayProps) {
  return (
    <View style={styles.container} pointerEvents="none">
      <ActivityIndicator size="large" color="#2E86AB" />
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
    backgroundColor: '#0B1D2A',
    gap: 12,
  },
  text: {
    color: '#E5EAF0',
    fontSize: 15,
  },
});
