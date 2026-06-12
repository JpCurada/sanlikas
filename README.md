# SanLikas

Hazard-aware evacuation app for Metro Manila. 3D NCR map with evacuation-facility
layers, official DRRM hazard reports, and an AI agent ("Saan tayo lilikas?") that
routes to the *safest* evacuation center. See [docs/design.md](docs/design.md) and
[docs/plan.md](docs/plan.md).

## Stack

Expo (custom dev client — Expo Go cannot load the map) · Expo Router · TypeScript
strict · `@rnmapbox/maps` (3D terrain + building extrusions, camera locked to NCR) ·
Zustand (persisted UI state) · build-time data pipelines in `scripts/`.

## Setup

```sh
npm install
cp .env.example .env   # then fill in your Mapbox tokens (never commit .env)
```

`.env` needs:

- `EXPO_PUBLIC_MAPBOX_TOKEN` — public token (`pk.*`), used at runtime.
- `RNMAPBOX_DOWNLOAD_TOKEN` — secret download token (`sk.*` with `DOWNLOADS:READ`),
  used by the `@rnmapbox/maps` config plugin during the native build.

## Data pipeline (Phase 1)

The six nationwide OSM dumps in `data/evacuation/` are converted at build time —
never parsed on-device:

```sh
npm run build:facilities   # data/evacuation/*.json → assets/facilities/*.geojson
```

Filters to NCR (address region/ISO check, bbox fallback), drops malformed
coordinates (logged), dedupes by OSM id across files, and exits non-zero if any
layer ends up empty. The generated GeoJSON is committed so builds don't depend on
re-running the pipeline.

## Checks

```sh
npm test                 # unit tests (NCR filter + dedupe logic)
npm run typecheck        # tsc --noEmit
npx expo-doctor          # project health
```

## First dev build (Android)

The map is a native module, so you need a dev client build once (and again only
when native deps change):

```sh
npm install -g eas-cli          # if not installed
eas login
eas init                        # links the project to your Expo account (once)
eas build --profile development --platform android
```

Install the resulting APK on your device, then start the bundler:

```sh
npx expo start --dev-client
```

Open the dev client on the device and connect. The app launches straight into the
3D NCR map; if 3D init fails it falls back to 2D with a notice.

Note: `eas build` runs in the cloud and needs the env vars too — either set
`EXPO_PUBLIC_MAPBOX_TOKEN` and `RNMAPBOX_DOWNLOAD_TOKEN` as EAS environment
variables (`eas env:create`) or rely on local values when building locally.

## Repo notes

- `likas/` is a separate reference repository (routing engine origin) — ignored by
  git, never modified here.
- `data/maps/*.osm.pbf` and the 89 MB raw flood GeoJSON are local-only inputs for
  the Phase 1 routing/overlay pipelines; the pipelines emit small bundleable
  derivatives into `assets/`.
