import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { HOTLINES } from '@/lib/hotlines';

/**
 * Static emergency hotlines screen — zero network and zero agent dependencies
 * (cross-cutting requirement). Dialing hands off to the phone app.
 */
export default function HotlinesScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        These hotlines work without the app or an internet connection. If instructions from your
        LGU or DRRM office conflict with this app, follow the official instructions.
      </Text>
      {HOTLINES.map((hotline) => (
        <View key={hotline.agency} style={styles.card}>
          <View style={styles.cardText}>
            <Text style={styles.agency}>{hotline.agency}</Text>
            <Text style={styles.description}>{hotline.description}</Text>
            <Text style={styles.number}>{hotline.display}</Text>
          </View>
          <Pressable
            style={styles.callButton}
            accessibilityLabel={`Call ${hotline.agency}`}
            onPress={() => {
              Linking.openURL(`tel:${hotline.dial}`).catch(() => {
                // Device without telephony (tablet/emulator) — number stays visible.
              });
            }}
          >
            <Icon name="call" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1D2A',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  intro: {
    color: '#9AA5B1',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13293D',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  agency: {
    color: '#E5EAF0',
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: '#9AA5B1',
    fontSize: 12,
    lineHeight: 17,
  },
  number: {
    color: '#F3A712',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D7263D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
