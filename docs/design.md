# SanLikas — Technical Design

Companion to [user-stories.md](user-stories.md). This document covers the stack,
architecture, and key technical decisions.

**Stack summary:** React Native + Expo (dev client) · Mapbox 3D map · Supabase
(Postgres, Auth, RLS, Realtime, Edge Functions) · Gemini (function calling) for the
ReAct agent, loop running **in the app** · **from-scratch hazard-aware A\* routing
on-device** over a bundled NCR pedestrian graph (adapted from the LIKAS project) ·
PAGASA scraped by a scheduled GitHub Actions workflow (every 20 min).

---

## 1. High-level architecture

```
┌──────────────────────────────────────────────────────┐
│ React Native app (Expo dev client)                   │
│  ├─ 3D Map (@rnmapbox/maps)                          │
│  │   ├─ facility layers (bundled GeoJSON)            │
│  │   ├─ hazard reports layer (realtime)              │
│  │   ├─ flood-zone + fault-line overlays (static)    │
│  │   └─ route line + hazard markers                  │
│  ├─ Chat UI ("Saan tayo lilikas?")                   │
│  ├─ ReAct loop (Gemini function calling)             │
│  │   ├─ tool: get_weather_status  ──▶ weather_cache  │
│  │   ├─ tool: get_hazard_reports  ──▶ reports        │
│  │   └─ tool: route_to_safest_center ─┐              │
│  └─ A* routing engine (from scratch)  ◀┘             │
│      └─ bundled NCR pedestrian graph (SQLite)        │
└───────────────┬──────────────────────┬───────────────┘
                │ supabase-js          │ Gemini calls
                ▼                      ▼
┌──────────────────────────┐  ┌────────────────────┐
│ Supabase                 │  │ Edge Function:     │
│  ├─ Postgres + PostGIS   │  │ gemini-proxy       │
│  │   ├─ reports (RLS)    │  │ (injects API key,  │
│  │   └─ weather_cache    │  │  rate-limits)──▶ Gemini API
│  ├─ Auth (authority role)│  └────────────────────┘
│  └─ Realtime (reports)   │
└──────────▲───────────────┘
           │ service-role upsert
┌──────────┴───────────────┐
│ GitHub Actions (cron,    │
│ every 20 min)            │
│  └─ scrape-pagasa.ts ────┼──▶ PAGASA NCR page
└──────────────────────────┘
```

Design rules:
- **Routing is ours, end to end** (project requirement): a from-scratch A\* over a
  pedestrian graph we generate from OSM data — no third-party routing API. The
  implementation is adapted from the LIKAS project (`likas/Likas/src/services/
  routingService.ts`, `graphDb.ts`), extended with hazard-aware edge costs (§5).
- **Secrets and scraping stay server-side.** The app never holds the Gemini key
  (calls go through the `gemini-proxy` Edge Function) and never scrapes PAGASA.
- **The ReAct loop runs in the app.** With routing on-device and Supabase reads
  going through the anon key + RLS, every agent tool is client-executable — a
  server-side loop would only add a hop. Tool results feed the map directly
  (no SSE protocol needed; it's all in-process).

---

## 2. Mobile app — React Native + Expo

- **Expo SDK with a custom dev client** (`expo-dev-client` + EAS Build). The 3D map
  requires a native module, so Expo Go is not usable; everything else stays in the
  managed workflow via config plugins.
- **Map: `@rnmapbox/maps`** (Mapbox config plugin). Chosen because it is the only
  mature RN map with true 3D — terrain (`Mapbox.Terrain` + raster-dem),
  `fill-extrusion` building layers, and pitch/rotate gestures (US-1.1).
  - NCR lock (US-1.2): `Camera` `maxBounds` set to the NCR bounding box
    (~`[120.90, 14.30]`–`[121.15, 14.80]`), `minZoomLevel` ≈ 10, `maxZoomLevel` ≈ 18.
  - **WebGL/GPU fallback:** if the map fails to initialize, render the same data on a
    2D fallback (`styleURL` without terrain/extrusions) per US-1.1 errors.
  - Mapbox free tier (50k monthly map loads) is sufficient for MVP. MapLibre
    (`@maplibre/maplibre-react-native`) is the zero-cost fallback if pricing becomes
    an issue — same GL style spec, weaker 3D terrain support.
- **Facility layers (US-2.1):** the six `data/evacuation/*.json` files are converted
  at **build time** by a Node script (`scripts/build-facilities.ts`) that:
  1. filters to NCR (`address.state`/region check, bbox fallback for records missing
     address fields),
  2. drops records with missing/malformed coordinates (logged),
  3. dedupes by `osm_id` across files,
  4. emits one GeoJSON `FeatureCollection` per facility type, bundled as app assets.
  Rendered as `ShapeSource` + `SymbolLayer` with Mapbox-native clustering. No runtime
  parsing of the raw OSM dumps on-device.
- **State/data:** TanStack Query for server state (reports, weather, agent calls)
  with persisted cache (offline baseline); Zustand for UI state (layer toggles —
  persisted to `AsyncStorage`).
- **Location:** `expo-location`. Permission requested lazily — only when the user
  asks the agent or requests routing, never on launch. Out-of-NCR and
  permission-denied flows per US-1.2 / US-3.1 (manual pin drop fallback).
- **Offline baseline:** bundled facility GeoJSON + bundled pedestrian graph (§5) +
  persisted query cache + Mapbox offline tile pack for NCR (downloadable in
  settings); static hotline screen with zero network dependencies. A\* routing to
  any facility works fully offline — only the agent's reasoning and fresh hazard
  data require connectivity.

---

## 3. Supabase

### 3.1 Schema

```sql
-- PostGIS enabled
create table reports (
  id           uuid primary key default gen_random_uuid(),
  authority_id uuid not null references auth.users(id),
  hazard_type  text not null check (hazard_type in
                 ('flood','landslide','fire','road_blocked','other')),
  description  text not null,
  severity     smallint not null default 2 check (severity between 1 and 3),
  location     geography(point, 4326) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index reports_location_idx on reports using gist (location);
create index reports_active_idx on reports (created_at) where resolved_at is null;

create table weather_cache (
  id          int primary key default 1 check (id = 1),  -- single row
  payload     jsonb not null,        -- parsed forecast + warnings + advisories
  issued_at   timestamptz,           -- PAGASA's own timestamp
  scraped_at  timestamptz not null,
  scrape_ok   boolean not null       -- false ⇒ last scrape failed (selectors/site)
);

create table authority_profiles (   -- who counts as a DRRM authority
  user_id    uuid primary key references auth.users(id),
  agency     text not null,         -- e.g. "Marikina CDRRMO"
  created_by uuid references auth.users(id)
);
```

### 3.2 RLS (the credibility guarantee, US-3.3/US-4.1)

- `reports`: `select` for `anon` + `authenticated`; `insert`/`update` only when
  `auth.uid() in (select user_id from authority_profiles)` and
  `authority_id = auth.uid()`. No `delete` — hazards are resolved, not erased.
- `authority_profiles`: writable only via service role (manual provisioning;
  no public sign-up path to the role — US-4.1).
- NCR bound enforced in the DB too: a check constraint / trigger rejects report
  locations outside the NCR polygon, so the boundary is not just a UI rule.

### 3.3 Realtime + reports layer (US-4.2)

Client subscribes to `postgres_changes` on `reports`. On reconnect after a dropped
subscription, the client refetches the full active set (`resolved_at is null and
created_at > now() - interval '24 hours'`) rather than trusting missed events.
Fallback polling every 2 min when the socket won't reconnect.

---

## 4. ReAct agent — Gemini

- **The ReAct loop runs in the React Native app** (`lib/agent/`). Rationale: the
  routing tool is on-device (§5), Supabase reads use the anon key + RLS, so every
  tool is client-executable; tool results (route GeoJSON) flow straight into map
  state with no streaming protocol in between. The only server piece is the
  **`gemini-proxy` Edge Function** — a thin pass-through that injects
  `GEMINI_API_KEY` and applies per-user rate limiting, so the key never ships in
  the app bundle.
- **Model:** `gemini-2.5-flash` via the `@google/genai` SDK (pointed at the proxy
  via `baseUrl`) — fast and cheap enough for an emergency UX; escalate to
  `gemini-2.5-pro` only if routing trade-off reasoning proves too weak in testing.
  Function calling provides the ReAct loop: Gemini emits `functionCall` parts, the
  app executes the tool locally, returns `functionResponse`, repeats (max **6 tool
  iterations**, hard wall-clock cap **30 s** per US-3.1).
- **Tool declarations** (Gemini `tools` / `functionDeclarations`):

  | Tool | Backing implementation | Returns |
  |---|---|---|
  | `get_weather_status()` | read `weather_cache` row via supabase-js | forecast, warnings, advisories + `issued_at`, `stale` flag, or `{status:"unavailable"}` |
  | `get_hazard_reports(lat, lng, radius_m)` | PostGIS `st_dwithin` RPC on active reports | report list + `fetched_at`, or `{status:"unavailable"}` — **never `[]` on query failure** |
  | `route_to_safest_center(origin, facility_types?)` | on-device hazard-aware A\* (§5) | chosen facility, route GeoJSON, avoided hazards, trade-off notes |

- **Tool results are structured, tri-state:** `ok` / `empty` / `unavailable`. The
  system prompt instructs Gemini to verbally distinguish "no hazards reported" from
  "couldn't check" (cross-cutting honesty requirement) and to always append the
  follow-official-instructions advisory.
- **Language:** system prompt mandates replying in the user's language
  (Filipino/English/Taglish); Gemini handles this natively, no detection step.
- **Agent → UI contract:** the loop emits typed in-process events (same shapes a
  server would have streamed; the agent still never renders anything itself):
  - `{type:"status", tool:"get_weather_status"}` → chat shows "Checking weather…"
  - `{type:"text", chunk:"…"}` → appended to the answer bubble (Gemini streaming
    passes through the proxy unchanged)
  - `{type:"route", geojson, facility, avoided_hazards, compromised}` → emitted when
    `route_to_safest_center` resolves; the map component puts the GeoJSON into a
    `ShapeSource`/`LineLayer`, drops the destination marker, marks avoided hazards,
    and flies the camera to the route bounds (US-3.4)
  - `{type:"fallback", mode:"nearest"}` → UI renders the non-AI nearest-centers list
- **Failure ladder (US-3.1):** one retry on Gemini 5xx/timeout → if still failing,
  the loop emits `{type:"fallback"}` and the UI renders the non-AI nearest-centers
  list computed from bundled GeoJSON. Because routing is also on-device, the
  fallback **and** full hazard-aware routing to a user-picked center work even when
  only Gemini is down — the agent's reasoning is the only thing lost.

---

## 5. Hazard-aware routing — from-scratch A\* (project requirement)

Routing is implemented by us, on-device, with **no third-party routing API**. The
base engine is adapted from the LIKAS project, which already proved this design on
real devices; SanLikas extends it with hazard-aware edge costs.

### 5.1 What we reuse from LIKAS (`likas/Likas/src/services/`)

- **`routingService.ts`** — the A\* core: hand-rolled binary `MinHeap`, haversine
  heuristic to the goal node (admissible, so paths stay optimal), nearest-node
  snapping with a `MAX_SNAP_METERS = 1500` refusal threshold, polyline assembly,
  walking-time estimate (`WALKING_MPS = 1.167`, 4.2 km/h).
- **`graphDb.ts`** — SQLite graph storage with corridor-subgraph loading: per
  route, only nodes/edges inside the padded origin→destination bbox are pulled
  into memory (~15–20k nodes vs the full graph), with `CORRIDOR_PADDING = 0.4`
  and `MIN_PAD_DEG = 0.012` so detours stay inside the loaded subgraph, plus a
  `MAX_ROUTE_KM` cap and typed errors (`NoRouteError`, `RouteTooLongError`,
  `GraphNotLoadedError`) that map cleanly onto US-3.4's fallback ladder.
- **`scripts/generate-pedestrian-graph.mjs`** — graph builder: extracts walkable
  way classes (footway, residential, tertiary, …) from OSM vector tiles at z14,
  already bounded to Metro Manila (`BBOX = [120.80, 14.30, 121.20, 14.95]`).
  Adapted to emit the SQLite graph DB bundled as an app asset; corridor padding
  means SanLikas's NCR-only graph is comfortably smaller than LIKAS's nationwide
  one.

### 5.2 What SanLikas adds: hazard-aware edge costs

LIKAS's A\* minimizes pure distance. SanLikas wraps the edge cost in a hazard
penalty function evaluated during graph expansion:

```
cost(edge) = edge.meters × hazardMultiplier(edge)

hazardMultiplier(edge):
  edge intersects hard-block buffer   → ∞   (edge removed from expansion)
  edge intersects soft-penalty buffer → 10× (passable only if no clean way exists)
  edge in PAGASA-advisory city        → 1.5× (region-level caution, never a block)
  otherwise                           → 1×

× static flood factor (build-time, from edge.flood_risk):
  flood-prone edge + rain warning active → ×3   (likely flooded right now)
  flood-prone edge, no active warning    → ×1.2 (mild standing preference for
                                                 routes that avoid flood zones)
```

- **Hazard buffers** are built client-side from active DRRM reports (already in
  app state via the Realtime layer, US-4.2): each report becomes a circular buffer
  sized by `hazard_type`/`severity` — e.g., flood sev-3 → 300 m hard block,
  flood sev-1 → 150 m soft penalty, `road_blocked` → 100 m hard block. Point-in-
  circle tests against edge endpoints + midpoint keep the check O(1) per edge
  (no polygon library needed; buffers are circles by construction).
- **PAGASA municipality advisories** (from `weather_cache`) apply the mild 1.5×
  multiplier to edges inside the named city's bbox — a whole-city hard block would
  make routing impossible exactly when it's needed most.
- **Static flood susceptibility** (`data/maps/MetroManila_Flood_100year.json`,
  100-year flood polygons) is intersected with graph edges **at build time** and
  stored as a `flood_risk` column on `pg_edges` — zero runtime geometry cost. When
  a Heavy Rainfall Warning is active, flood-prone edges get ×3 (they are likely
  flooded *now*, even before a DRRM report lands); in calm weather a mild ×1.2
  keeps routes out of flood zones when the detour is cheap. This makes routing
  flood-aware even with zero live reports — live DRRM reports layer on top.
  `data/maps/gem_active_faults_harmonized.json` (active fault lines) is rendered
  as an informational map overlay; it does not weight edges (fault proximity isn't
  a road-passability signal).
- Because the soft penalty is finite, A\* degrades gracefully: if every path to a
  center crosses a hazard, the algorithm still returns the least-hazardous one,
  and the result is flagged `compromised: true` with the intersected hazards
  listed — the agent must surface this, never present it as safe (US-3.4).

### 5.3 Safest-center selection pipeline (`route_to_safest_center` tool)

1. Candidate selection: k-nearest facilities (k=5) by haversine from the bundled
   facility GeoJSON (no server round-trip).
2. Run hazard-aware A\* to each candidate (corridor subgraphs keep this cheap;
   candidates are near by construction).
3. Score: clean route to nearest wins; otherwise nearest candidate with a clean
   route, with the trade-off recorded for the agent to explain ("X is closer but
   the route crosses a reported flood").
4. All routes compromised → return the least-penalized route flagged
   `compromised: true` (§5.2); no route at all (graph disconnect, snap failure) →
   typed error → straight-line bearing + distance fallback, labeled
   "directions unavailable."
5. Origin/destination snapped >250 m from the graph gets a `snap_distance` field
   for disclosure (US-3.4).

### 5.4 Mid-route re-evaluation (US-3.4)

While a route is displayed, the app listens to the reports Realtime channel; a new
report whose buffer intersects the active polyline triggers an alert + re-route
offer (user-confirmed, no silent swap). Since routing is local, re-evaluation is
instant and works even if connectivity drops after the report arrives.

### 5.5 Why on-device (and not an Edge Function)

- Made-from-scratch requirement is satisfied either way, but on-device gives:
  routing that works **offline** (hazard data may be stale — disclosed per the
  staleness rules — but the path engine never dies with the network), zero routing
  latency, and direct reuse of battle-tested LIKAS code that already ran on
  low-end Android.
- Trade-off accepted: hazard buffers come from the client's last-synced reports
  rather than a server-authoritative set; the Realtime resync rules (§3.3) bound
  that gap.

---

## 6. PAGASA scraper

- **GitHub Actions workflow on a cron schedule (every 20 min)** —
  `.github/workflows/scrape-pagasa.yml` runs a Node script
  (`scripts/scrape-pagasa.ts`) that scrapes the page and upserts the
  `weather_cache` row via the Supabase service-role key (stored in GitHub Secrets).
  Decoupling scraping from user requests means agent queries only ever read
  `weather_cache` — fast, and PAGASA load is constant regardless of app traffic
  (it never gets hammered during a typhoon).
  - Chosen over `pg_cron` + Edge Function: zero extra Supabase setup, free runner
    minutes, and run logs in the GitHub UI. Same table contract, so the runner can
    be swapped later without touching the agent.
  - **Cadence — 6 h was considered and rejected:** the regional forecast only
    updates ~2–4× daily, but Heavy Rainfall Warnings and thunderstorm advisories
    are issued ad hoc and are typically valid for only ~2 h. A 6-hour scrape would
    miss most advisories or serve them after expiry — worst case, the app is blind
    to a rainfall warning for almost 6 h during the event itself. 20 min keeps
    advisory latency acceptable at negligible cost.
  - **GitHub cron caveats:** schedules are best-effort (delays of minutes to an
    hour under load) and are auto-disabled after 60 days of repo inactivity. The
    staleness logic below tolerates jitter; a keep-alive commit or manual
    `workflow_dispatch` re-enable handles dormancy. Acceptable for MVP; move to
    `pg_cron` if scheduling reliability becomes critical.
- Parses the NCR page (https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd)
  with CSS selectors (e.g., `cheerio`), extracting: issued-at, sky condition, temp
  range, wind, Heavy Rainfall Warnings, thunderstorm advisories +
  affected-municipality lists (matched against a static NCR city list; unmatched
  names kept as free text).
- **Selector drift = loud failure:** if required selectors match nothing, the
  script writes `scrape_ok = false` (keeping the previous `payload`) and **exits
  non-zero so the workflow run fails** — GitHub's failure notification is the
  developer alert, no webhook needed. The weather tool reads `scrape_ok` +
  `scraped_at` to compute the `stale` flag; payloads older than **12 h** are
  treated as unavailable (US-3.2).
- Identifies itself with a project User-Agent; single attempt per cron tick with
  timeout (the 20-min cadence *is* the retry loop — no tight retries against a
  struggling site).
- **Optional supplement (open decision):** Open-Meteo current rainfall by exact
  coordinates, called live inside `get_weather_status` (no key required, no
  scraping). Recommended: cheap to add and covers PAGASA's region-granularity gap.

---

## 7. Repository layout

```
sanlikas/
├─ app/                    # Expo Router screens (map, chat, report form, hotlines)
├─ components/             # map layers, chat bubbles, layer control, legend
├─ lib/
│  ├─ agent/               # ReAct loop, tool implementations, event emitter (§4)
│  ├─ routing/             # A* engine: aStar.ts, minHeap.ts, graphDb.ts,
│  │                       #   hazardCost.ts, centerSelection.ts (§5)
│  └─ …                    # supabase client, query hooks, geo utils
├─ assets/
│  ├─ facilities/          # build-time NCR-filtered GeoJSON (generated)
│  └─ graph/               # ncr-pedestrian-graph.db (generated, §5.1)
├─ scripts/
│  ├─ build-facilities.ts  # data/evacuation/*.json → assets/facilities/*.geojson
│  ├─ build-pedestrian-graph.mjs  # OSM → assets/graph/*.db (adapted from likas/)
│  └─ scrape-pagasa.ts     # PAGASA → weather_cache (run by GitHub Actions, §6)
├─ .github/workflows/
│  └─ scrape-pagasa.yml    # cron: */20 * * * *
├─ supabase/
│  ├─ migrations/          # schema + RLS + NCR boundary constraint
│  └─ functions/
│     └─ gemini-proxy/     # key injection + per-user rate limiting (§4)
├─ data/evacuation/        # raw OSM source (input only, not shipped)
└─ docs/
```

## 8. Environments & keys

| Secret | Lives in | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Edge Function secrets (`gemini-proxy`) | never in the app bundle |
| Mapbox public token | app (`app.config.ts`) | public by design; scope to map loads |
| Supabase anon key | app | safe by design — RLS is the boundary |
| Supabase service role | Edge Functions + GitHub Secrets | authority provisioning; scraper writes (§6) |

## 9. Build & deploy

- **App:** EAS Build (dev client for development, internal distribution for demo);
  `expo prebuild` stays unused — config plugins only.
- **Backend:** `supabase db push` for migrations, `supabase functions deploy
  gemini-proxy`; the scraper deploys with the repo — its schedule lives in
  `.github/workflows/scrape-pagasa.yml`.
- **CI sanity checks:** `build-facilities.ts` runs in CI and fails on zero NCR
  records per layer or parse errors (catches upstream data regressions); a scraper
  smoke test runs the PAGASA parser against a stored HTML fixture so selector
  breakage is caught before deploy when possible; routing unit tests run A\* +
  hazard costs against a small fixture graph (known shortest path, known
  hazard-detour path, all-blocked → `compromised` case).
