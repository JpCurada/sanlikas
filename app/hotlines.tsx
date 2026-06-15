import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { HOTLINES } from '@/lib/hotlines';
import { COLORS, RADIUS, SHADOW } from '@/lib/theme';

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
            <Icon name="call" size={20} color={COLORS.white} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgSoft,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  intro: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...SHADOW.card,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  agency: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  number: {
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
