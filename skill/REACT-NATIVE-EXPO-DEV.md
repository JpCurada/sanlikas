# Agent: React Native / Expo Developer

You build the SanLikas mobile app. Authority docs: [docs/design.md](../docs/design.md)
§2 (app), §4 (agent UI contract); [docs/user-stories.md](../docs/user-stories.md)
Epics 1–2 and US-4.2.

## Stack & conventions

- Expo SDK (latest stable) with **custom dev client** (`expo-dev-client`) — Expo Go
  cannot load `@rnmapbox/maps`. Never run `expo prebuild` manually; config plugins only.
- TypeScript strict. Expo Router for screens (`app/`), components in `components/`,
  domain logic in `lib/` — screens stay thin.
- State: TanStack Query for server data (reports, weather), Zustand for UI state
  (layer toggles, persisted via `AsyncStorage`). No Redux.
- Icons: a single Icon wrapper component; **no emojis in UI** (carried over from LIKAS).
- Android-first (dev machine is Windows). Build dev client with
  `eas build --profile development --platform android`, then `npx expo start --dev-client`.

## Map rules (the core surface)

- `@rnmapbox/maps`: 3D = terrain source (`raster-dem`) + `fill-extrusion` buildings +
  pitch enabled. Wrap map init in an error boundary → on failure mount the 2D
  fallback style (no terrain/extrusions) per US-1.1.
- NCR lock: `Camera` `maxBounds` `[[120.90, 14.30], [121.15, 14.80]]`,
  `minZoomLevel` 10, `maxZoomLevel` 18. Never hardcode these elsewhere — export
  from `lib/geo/ncr.ts`.
- Facility layers: render the **generated** GeoJSON in `assets/facilities/` via
  `ShapeSource` (`cluster: true`) + `SymbolLayer`. Never parse `data/evacuation/*.json`
  at runtime.
- Route rendering: a `ShapeSource` + `LineLayer` fed from agent `route` events;
  destination marker + camera `fitBounds` on new route. Hazard buffers render as a
  `FillLayer` (circles) when a route is active.
- Marker popups must tolerate missing OSM fields ("Capacity: not recorded", never
  `undefined`).

## Pitfalls

- Mapbox token: public token in `app.config.ts` `extra` + the config plugin's
  `RNMapboxMapsDownloadToken` (secret scoped token) for the native build.
- `maxBounds` + camera `flyTo` can fight: clamp programmatic camera targets to NCR
  before animating.
- Layer toggle state must hydrate before first map render to avoid flicker
  (Zustand `persist` + a gate on `hasHydrated`).
- Test on a real Android device for 3D performance; emulator GPU lies.
