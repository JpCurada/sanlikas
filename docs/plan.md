# SanLikas — Implementation Plan

Execution order for building what [design.md](design.md) specifies. Each phase ends
with something runnable/verifiable. Domain playbooks live in [`skill/`](../skill/) —
the responsible playbook is noted per phase.

**Assumptions:** Android-first development (Windows machine, EAS builds);
keys/accounts acquired in Phase 0.

---

## Phase 0 — Accounts & keys (blocking, ~1 hour, mostly waiting)

- [ ] Supabase project → URL, anon key, service-role key
- [x] Mapbox account → public token acquired; still need the **secret download
      token** (`RNMapboxMapsDownloadToken`) for the native build if not yet created
- [ ] Google AI Studio → `GEMINI_API_KEY` (set a budget cap)
- [ ] Expo account + `eas-cli` login
- [ ] GitHub repo pushed (scraper workflow needs it)

## Phase 1 — Data pipelines (no keys needed; pure Node — start here)

*Playbooks: ROUTING-ENGINE.md, REACT-NATIVE-EXPO-DEV.md*

1. `scripts/build-facilities.ts`: `data/evacuation/*.json` → NCR-filter →
   drop bad coords → dedupe by `osm_id` → `assets/facilities/*.geojson`.
2. `scripts/build-pedestrian-graph.mjs`: adapt `likas/scripts/generate-pedestrian-graph.mjs`
   (BBOX already NCR) to emit SQLite (`pg_nodes`, `pg_edges`) →
   `assets/graph/ncr-pedestrian-graph.db`. **Source: the local
   `data/maps/philippines-260611.osm.pbf`** (already downloaded, fresh) — run
   Planetiler over it for tiles (LIKAS has `npm run generate-map` tooling) or
   extract ways from the pbf directly; no Geofabrik download needed.
3. Static hazard pre-weighting: intersect graph edges with
   `data/maps/MetroManila_Flood_100year.json` at build time and store a
   `flood_risk` column on `pg_edges` (design §5.2) — routing is flood-aware even
   with zero live reports.
4. Overlay assets: the flood GeoJSON is **93 MB — never bundle raw**. Simplify
   (mapshaper, tolerance tuned visually) + clip to NCR → target < 5 MB →
   `assets/overlays/flood-100yr.geojson`; same treatment (it's already small) for
   `gem_active_faults_harmonized.json` → `faults.geojson`.

**Verify:** facility counts per layer logged and > 0; graph DB opens in `sqlite3`,
node/edge counts sane (~hundreds of thousands of edges for NCR); spot-check a node's
coords land on a Metro Manila road; a known flood-prone street (e.g., España) has
`flood_risk` set on its edges.

## Phase 2 — Expo app + 3D map + facility layers (US-1.1, 1.2, 2.1)

*Playbook: REACT-NATIVE-EXPO-DEV.md*

1. Scaffold: `create-expo-app` (TypeScript), Expo Router, `expo-dev-client`,
   `@rnmapbox/maps` config plugin → first EAS dev build (longest wait; kick off early).
2. 3D map screen: terrain + extrusions, NCR `maxBounds`/zoom lock (`lib/geo/ncr.ts`),
   2D fallback on map-init failure.
3. Facility layers: ShapeSources from Phase 1 GeoJSON, clustering, layer control
   (Zustand persisted), detail popups tolerant of missing fields, legend.
4. Static hotlines screen (zero dependencies — cheap to do now, required by docs).

**Verify:** on device — app opens to 3D NCR, can't pan/zoom out of bounds, six
toggleable layers, popups OK, toggles survive restart.

## Phase 3 — Supabase backend + reports layer (US-3.3 data, Epic 4)

*Playbook: SUPABASE-BACKEND.md*

1. Migrations: PostGIS, `reports`, `weather_cache`, `authority_profiles`, indexes,
   NCR boundary trigger, `get_hazard_reports` RPC.
2. RLS policies + the forbidden-write tests; seed script (1 authority, sample reports).
3. App: realtime reports layer with reconnect-resync + 2-min polling fallback,
   stale banner, calm empty state (US-4.2).
4. Authority flow: Supabase Auth sign-in, role-gated report form (create/resolve,
   NCR-bounded pin, retry-preserving submit). In-app gated section, not a separate
   dashboard (MVP decision — revisit post-MVP).

**Verify:** anon insert into `reports` rejected (test); authority can post/resolve
on device; second device sees the marker appear/disappear without restart.

## Phase 4 — Routing engine: from-scratch hazard-aware A\* (US-3.4)

*Playbook: ROUTING-ENGINE.md — the project's core requirement; budget the most time here*

1. Port LIKAS A\* core → `lib/routing/` (`aStar.ts`, `minHeap.ts`, `snap.ts`,
   `graphDb.ts` on `expo-sqlite`).
2. Fixture-graph unit tests green **before** touching real data.
3. `hazardCost.ts` (injected multiplier: ∞ / 10× / 1.5× / 1×) + hazard-detour and
   compromised-flag tests.
4. `centerSelection.ts` (k=5 → score → trade-off reason) + straight-line fallback
   path on typed errors.
5. Wire to map: route LineLayer, destination marker, hazard-buffer fill, camera fit;
   mid-route re-evaluation on new realtime reports (alert, user-confirmed reroute).

**Verify:** `npx jest lib/routing` green; on device — route renders across QC in
< 2 s; posting a flood report on the route (from the authority form) triggers the
reroute alert and the new path visibly avoids the buffer. This demo is the heart
of the project — record it.

## Phase 5 — PAGASA scraper + GitHub workflow (US-3.2)

*Playbook: AI-AGENT-DEV.md*

1. `scripts/scrape-pagasa.ts` (cheerio) + saved-HTML fixture test.
2. `.github/workflows/scrape-pagasa.yml` (`*/20 * * * *`, `workflow_dispatch`,
   service-role key in GitHub Secrets, exit-nonzero-on-selector-drift).

**Verify:** manual `workflow_dispatch` run populates `weather_cache`; fixture test
in CI; break a selector locally and confirm exit 1 + `scrape_ok=false` + old payload kept.

## Phase 6 — gemini-proxy + ReAct agent + chat UI (US-3.1)

*Playbooks: SUPABASE-BACKEND.md (proxy), AI-AGENT-DEV.md (loop)*

1. `gemini-proxy` Edge Function: key injection, SSE passthrough, rate limit.
2. `lib/agent/`: ReAct loop (6 iterations / 30 s caps), three tri-state tools,
   typed events, system prompt (language, honesty, advisory, scope).
3. Chat UI: bubbles, status lines, route-event → map handoff, nearest-centers
   fallback component, pin-drop flow for missing location.
4. `scripts/eval-agent.ts` canned scenarios.

**Verify:** on device — "saan tayo lilikas?" answers in Taglish with a drawn route;
"may baha sa [street]" report posted mid-session changes the recommendation; kill
network mid-chat → honest degradation + tappable nearest-centers fallback that
still routes (offline A\*).

## Phase 7 — Hardening & polish

Offline pass (airplane mode end-to-end), staleness banners everywhere they're
specced, error-boundary sweep, 3D perf on a low-end device, Mapbox offline tile
pack option, README + demo script.

---

## Order rationale & risks

- Phases 1 and 4 are key-independent — if Phase 0 stalls, work proceeds.
- The EAS first build (Phase 2) and the pedestrian-graph generation (Phase 1) are
  the two long-pole waits; start both early.
- Biggest technical risk: graph generation source data (MBTiles availability) —
  mitigated by LIKAS's existing `generate-map` tooling. Second: `expo-sqlite` perf
  vs LIKAS's `react-native-sqlite-storage` — corridor queries are simple bbox
  selects; benchmark in Phase 4 step 1 and swap libs early if needed.
- Cut-line for a demo deadline: Phase 7 > 6.4 > 5 (agent can demo against seeded
  `weather_cache`) — never cut Phase 4 tests.
