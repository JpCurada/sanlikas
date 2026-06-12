import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Tokens (see .env.example — never commit real tokens):
 * - EXPO_PUBLIC_MAPBOX_TOKEN: public token (pk.*), read at runtime by lib/map/mapbox.ts.
 * - RNMAPBOX_DOWNLOAD_TOKEN: secret download token (sk.* with DOWNLOADS:READ),
 *   consumed here by the @rnmapbox/maps config plugin for the native build.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SanLikas',
  slug: 'sanlikas',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'sanlikas',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'ph.sanlikas.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-router',
    'expo-asset',
    'expo-font',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B1D2A',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.RNMAPBOX_DOWNLOAD_TOKEN,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
