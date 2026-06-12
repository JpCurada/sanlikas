import Mapbox from '@rnmapbox/maps';

/**
 * One-time Mapbox runtime initialization. Imported by the map screen.
 * The public token comes from EXPO_PUBLIC_MAPBOX_TOKEN (inlined by Expo).
 */
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export const MAPBOX_TOKEN_PRESENT = Boolean(token);

if (token) {
  Mapbox.setAccessToken(token);
} else {
  console.warn(
    '[map] EXPO_PUBLIC_MAPBOX_TOKEN is not set — the map cannot load. ' +
      'Copy .env.example to .env and fill in your tokens.',
  );
}

/** Primary 3D style. */
export const STYLE_URL_3D = Mapbox.StyleURL.Street;

/** 2D fallback style — no terrain or extrusions are mounted in 2D mode. */
export const STYLE_URL_2D = Mapbox.StyleURL.Street;

export default Mapbox;
