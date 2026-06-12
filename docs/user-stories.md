# SanLikas — User Stories & Requirements

Hazard-aware evacuation app for Metro Manila. Users see a 3D map of NCR with evacuation
facilities, and an AI agent ("Saan tayo lilikas?") recommends the *safest* evacuation
center and route — not merely the nearest — using live weather and official hazard
reports from DRRM authorities.

**Stack notes:** evacuation facility data from `data/evacuation/` (OSM-sourced,
nationwide — must be filtered to NCR); hazard reports stored in Supabase, written
only by verified DRRM authority accounts; weather scraped from PAGASA's NCR
regional forecast page.

---

## Epic 1: 3D Map Foundation

### US-1.1 — 3D map on launch

> As a Metro Manila resident, when I open the app, I want to immediately see a
> 3D-rendered map of Metro Manila, so I can orient myself without any extra steps.

**Acceptance criteria:**
- On app launch, the map view loads as the default (landing) screen with no intermediate menu.
- The map is rendered in 3D (terrain/building extrusion, tilt and rotate gestures supported).
- The initial camera is centered on Metro Manila at a zoom level showing the full NCR extent.
- A loading indicator is shown while map tiles/assets initialize; the UI is never a blank screen.

**Errors & fallbacks:**
- If 3D tiles or terrain fail to load (slow network, tile server error), the map falls
  back to a 2D flat rendering with a non-blocking notice ("3D view unavailable —
  showing 2D map"); all features (layers, agent, routing) keep working in 2D.
- If the device/browser does not support WebGL or the required GPU features, the app
  detects this at startup and loads 2D mode directly instead of crashing or showing
  a blank canvas.
- If the map cannot load at all (fully offline), the app shows a clear offline screen
  with a retry button — not a spinner that never resolves. Previously cached tiles
  are used when available.
- Tile loading retries with backoff; persistent failure of individual tiles renders
  a neutral placeholder rather than holes that look like missing geography.

### US-1.2 — Map locked to Metro Manila

> As a user, I want the map bounded to Metro Manila only, so I never get lost
> panning into irrelevant areas.

**Acceptance criteria:**
- Camera pan/zoom is constrained to the NCR bounding box; panning beyond it snaps or
  rubber-bands back smoothly (no hard jolt, no escaping the bounds via momentum/fling).
- A minimum zoom level prevents zooming out past the Metro Manila extent; a maximum
  zoom prevents zooming into useless detail beyond available tile resolution.
- Search/geocoding (if present) only returns results within Metro Manila.

**Errors & fallbacks:**
- If the user's GPS location is outside NCR, the map stays centered on Metro Manila
  and the app explains: "SanLikas currently covers Metro Manila only. Your location
  appears to be outside the coverage area." The user can still browse the map and
  facility layers; agent routing from their location is disabled with the same message.
- If a search query matches only places outside NCR, the result list shows
  "No results within Metro Manila" rather than an empty list with no explanation.
- Deep links / shared coordinates pointing outside NCR are clamped to the nearest
  point on the boundary with a notice, not silently ignored.

---

## Epic 2: Evacuation Data Layers

### US-2.1 — Toggle evacuation facility layers

> As a user, I want to switch between different evacuation facility datasets
> (evacuation centers, covered courts, gymnasiums, hospitals, multi-purpose halls,
> schools), so I can see which type of shelter is relevant to my situation.

**Acceptance criteria:**
- A layer control lists the six datasets from `data/evacuation/`: `evacuation.json`,
  `covered_court.json`, `gymnasium.json`, `hospital.json`, `multi_purpose.json`, `school.json`.
- Each layer can be toggled independently; markers use a distinct icon/color per
  facility type, with a legend mapping icons to types.
- **Only records located within Metro Manila are loaded/displayed** — the source files
  contain nationwide OSM data, so records must be filtered by NCR boundary (e.g.,
  bounding box or `address.state`/region check) at load time. Filtering happens once
  at build/ingest time, not per render.
- Tapping a marker shows facility details: name, address, and where available,
  capacity and supported hazard types from `extratags`.
- Layer toggle state persists across app sessions.
- Dense marker areas are clustered (or thinned by zoom) so the map stays readable
  and performant at full-NCR zoom.

**Errors & fallbacks:**
- If a dataset file is missing, unreadable, or fails JSON parsing, that layer is shown
  as unavailable in the layer control (greyed out with an error hint); the other five
  layers load normally. One bad file never blanks the whole map.
- Records with missing or malformed coordinates are skipped during ingest and logged;
  they must not crash the loader or render at (0, 0).
- Optional fields (`capacity:persons`, `emergency:hazard_type`) are frequently absent
  in OSM data — the detail popup omits absent fields gracefully ("Capacity: not
  recorded") rather than showing `undefined`/`null`.
- If NCR filtering yields zero records for a layer, the layer shows an empty-state
  note ("No facilities of this type recorded in Metro Manila") instead of appearing
  silently broken.
- Duplicate records (same OSM id appearing in multiple files, e.g., a school that is
  also an evacuation center) are deduplicated or visually merged, not double-pinned.

---

## Epic 3: Hazard-Aware Evacuation Assistant (ReAct Agent)

### US-3.1 — Ask "Saan tayo lilikas?"

> As a user in an emergency, I want to ask the app "Saan tayo lilikas?"
> (Where do we evacuate?) and get a guided answer, so I don't have to interpret
> hazard data myself under stress.

**Acceptance criteria:**
- A chat/ask interface accepts natural-language queries in Filipino, English, and
  Taglish.
- The query is handled by a ReAct agent that reasons step-by-step and invokes tools
  (US-3.2, US-3.3, US-3.4) as needed.
- The agent responds with a recommended evacuation center and the reasoning behind
  the choice (weather, current reports, route safety), in the language the user asked in.
- While the agent is working, the UI shows progress (e.g., "Checking weather…",
  "Checking hazard reports…") — never a silent multi-second freeze.
- The agent's data sources and their freshness are visible in the answer (e.g.,
  "PAGASA forecast issued 5:00 PM; 2 active DRRM reports").

**Errors & fallbacks:**
- **LLM/API failure or timeout:** the agent retries once; on repeated failure the UI
  shows a clear error with a retry button, plus a non-AI fallback: the nearest
  evacuation centers listed by straight-line distance with a "tap to route" option.
  The user is never left with no path forward in an emergency.
- **Partial tool failure:** if one tool fails (e.g., weather scrape down) but others
  succeed, the agent still answers, explicitly stating what it could not check:
  "I couldn't retrieve the latest weather — this recommendation is based on official
  hazard reports only."
- **All tools fail:** the agent degrades to distance-based recommendations and says
  so plainly: "I have no live hazard data right now. The nearest center is X, but I
  cannot confirm the route is clear."
- **Location unavailable** (GPS denied/off): the agent asks the user to drop a pin or
  type their barangay/landmark instead of refusing to answer.
- **Off-topic or out-of-scope queries** (locations outside NCR, non-evacuation
  questions): the agent states its scope politely and offers what it *can* do.
- A hard timeout (e.g., 30s) bounds the whole agent run; on expiry the partial
  reasoning gathered so far is summarized rather than discarded.
- Agent answers are advisory: every response includes a standing note to follow
  official LGU/DRRM instructions if they conflict with the app.

### US-3.2 — Agent tool: latest weather status (PAGASA)

> As the agent, I need to fetch the latest weather status for the user's area,
> so my recommendation reflects current conditions (e.g., typhoon, heavy rainfall).

**Acceptance criteria:**
- Primary source is the PAGASA NCR regional forecast page
  (https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd), scraped server-side.
  PAGASA has no public API; the page renders data in styled divs (not tables), so the
  scraper parses by CSS selectors.
- The scraper extracts: forecast issued-at timestamp, sky condition, temperature range,
  wind, **Heavy Rainfall Warnings**, and **thunderstorm advisories including the list of
  affected municipalities** (so the agent can reason per-city, not just region-wide).
- Scrape results are cached (~15–30 min) — PAGASA updates a few times daily, so the
  page is not hit on every agent query.
- Optionally complemented by a coordinates-based API (e.g., Open-Meteo) for
  per-location current rainfall, since the PAGASA forecast is one blanket forecast
  for all of NCR.

**Errors & fallbacks:**
- **Page structure changed:** if expected selectors match nothing, the scraper fails
  loudly (alert/log for the developers) and returns a structured "source unavailable"
  result — it must never silently return empty data that the agent reads as
  "no warnings, all clear."
- **PAGASA unreachable** (site down, timeout): the tool serves the last cached scrape
  if one exists, clearly marked stale with its issued-at timestamp; the agent
  discloses staleness in its answer ("latest available forecast is from 5:00 AM").
- **Cache empty and source down:** the tool returns "weather unavailable"; the agent
  proceeds per US-3.1 partial-failure behavior and, if Open-Meteo is configured,
  falls back to it for current conditions.
- **Stale beyond a hard limit** (e.g., >12h): cached data is treated as unavailable
  rather than presented as current.
- Scraper requests identify themselves (User-Agent) and respect a minimum interval;
  retries use backoff so the tool never hammers PAGASA during an outage — which is
  exactly when a typhoon is likeliest.
- Municipality names parsed from advisories that can't be matched to a known NCR
  city/municipality are kept as free text and surfaced to the agent rather than dropped.

### US-3.3 — Agent tool: latest official hazard reports

> As the agent, I need to fetch the latest hazard reports issued by DRRM authorities
> from the Supabase database, so I can avoid recommending shelters or routes through
> affected areas with credible, official information.

**Acceptance criteria:**
- Hazard reports live in a Supabase `reports` table (suggested columns: `id`,
  `authority_id`, `hazard_type`, `description`, `location`, `created_at`,
  optionally `severity` and `resolved_at`).
- Only reports from verified DRRM authority accounts exist in this table — enforced
  at the database level via Supabase Auth + Row Level Security (insert restricted to
  users with an authority role), not just in the app UI.
- The agent tool queries reports filtered by recency (configurable window, e.g., 24h)
  and proximity to the user's location or candidate routes.
- Reports marked resolved (`resolved_at` set) or past the recency window are excluded
  from agent reasoning.
- Report locations resolve to map coordinates usable by the routing tool (US-3.4).

**Errors & fallbacks:**
- **Supabase unreachable or query error:** the tool retries with backoff (bounded,
  ~2 attempts), then returns a structured "reports unavailable" result. The agent
  states that official reports could not be checked and falls back to weather data —
  it must never treat a failed query as "no hazards reported."
- **Zero active reports** is a distinct, valid result ("no official reports in your
  area right now") and is reported as such — clearly different from "couldn't check."
- **Malformed rows** (missing coordinates, unknown hazard_type): skipped with a log;
  one bad row never fails the whole query. Reports without resolvable coordinates are
  still surfaced to the agent as area-level text warnings.
- **Auth/RLS misconfiguration** (read unexpectedly denied): treated as
  "reports unavailable" with a developer alert, not as an empty result.
- A short client-side cache (1–2 min) of the last successful query is served during
  brief outages, marked with its fetched-at time.

### US-3.4 — Agent tool: hazard-aware routing to safest evacuation center

> As a user, I want the agent to draw directions to the *safest* evacuation center —
> not merely the nearest — so the route itself doesn't put me in danger.

**Acceptance criteria:**
- Tool computes a route from the user's location to a selected evacuation center
  and renders it on the 3D map.
- Route planning penalizes/avoids segments flagged by weather data (US-3.2) and
  hazard reports (US-3.3) — e.g., flooded roads — even if that yields a longer path.
- If the nearest center or all routes to it are compromised, the agent selects the
  next-best center and explains the trade-off ("X is closer, but the only route
  crosses a reported flood; routing you to Y instead").
- The chosen route and destination are visually distinguished on the map (highlighted
  path, destination marker); known hazards near the route are marked so the user
  sees *why* the path bends.
- Walking is the default routing profile (flooding typically rules out vehicles);
  driving is selectable when conditions allow.

**Errors & fallbacks:**
- **Routing engine failure** (graph asset missing/corrupt, origin/destination too
  far from any walkable way, disconnected subgraph): fall back to showing the
  destination marker with a straight-line bearing and distance, clearly labeled
  "directions unavailable — showing destination only."
- **No safe route exists** (all candidate paths cross active hazards): the agent says
  so explicitly, shows the *least*-hazardous option clearly marked with its risks,
  and advises contacting local DRRM — it never silently presents a hazardous route
  as safe.
- **No reachable facility** (extreme case — every candidate center or route is
  compromised): the agent states this honestly and falls back to advising the user
  to shelter in place and contact emergency services, with hotline numbers shown.
- **User location unavailable:** routing requires an origin; the tool prompts for a
  dropped pin / typed landmark (same flow as US-3.1) before computing.
- **Origin or destination outside NCR / off the road network:** snapped to the
  nearest routable point within bounds, with the snap distance disclosed if large
  (>250 m).
- **Mid-route changes:** if a new hazard report lands on the active route while
  navigation is displayed, the route is re-evaluated and the user is alerted before
  being rerouted (no silent path swaps).
- Stale hazard inputs: routes computed from cached/stale weather or reports carry the
  same staleness disclosure as US-3.2/US-3.3.

---

## Epic 4: Official Hazard Reports (DRRM Authorities)

### US-4.1 — DRRM authority issues a hazard report

> As a DRRM officer, I want to publish a hazard report (e.g., "may baha sa España,
> hindi madaanan"), so residents and the evacuation agent route around the affected area.

**Acceptance criteria:**
- DRRM officers sign in through Supabase Auth with an authority role (provisioned
  manually or by an admin — no public sign-up for this role).
- The report form captures hazard type, description, severity, and location
  (pin on map, NCR-bounded).
- Officers can mark their reports as resolved when the hazard clears, which removes
  them from agent reasoning and the map.
- Regular users have read-only access to reports (RLS: select for all,
  insert/update for authority role only).
- Officers can edit or correct their own active reports; edits update `created_at`
  semantics sensibly (an `updated_at` column, not a fake-fresh report).

**Errors & fallbacks:**
- **Validation:** submissions missing hazard type or location are rejected inline
  with field-level messages; a pin outside the NCR boundary is rejected before
  submission with the boundary shown.
- **Submit failure** (network drop, Supabase error): the form preserves all entered
  data and offers retry — an officer in the field never retypes a report. Pending
  reports are queued locally and submitted when connectivity returns, with a clear
  "pending sync" status.
- **Session expiry mid-form:** re-authentication flows back to the filled form, not
  to a blank one.
- **Unauthorized attempt** (non-authority user reaching the endpoint): rejected at
  the database level by RLS regardless of UI state; the API returns a clear
  permission error, and the event is logged.
- **Duplicate-looking reports** (same hazard type within ~200 m of an active report):
  the form warns the officer and shows the existing report before allowing submission
  (allowed, but deliberate).
- Resolving a report is reversible for a grace period (undo), guarding against
  accidental taps clearing an active hazard.

### US-4.2 — See live reports on the map

> As a user, I want recent official hazard reports displayed as a map layer,
> so I can see affected areas at a glance without asking the agent.

**Acceptance criteria:**
- Recent reports render as markers/heat overlay on the 3D map, toggleable like the
  evacuation layers (US-2.1), with severity reflected visually.
- Markers show hazard type, description, issuing authority, and time-ago on tap.
- Reports past the recency window or marked resolved drop off automatically.
- New/resolved reports appear/disappear without requiring an app restart (Supabase
  realtime subscription or periodic refresh ≤2 min).

**Errors & fallbacks:**
- **Realtime subscription drops:** the app falls back to polling and resyncs the
  full active-report set on reconnect, so no report is missed or shown after
  resolution.
- **Fetch failure:** the last known report set stays visible, marked with a stale
  banner ("reports as of HH:MM — reconnecting…"); it is never silently cleared,
  and never presented as live.
- **Zero active reports** renders as an explicit calm state ("No active hazard
  reports in Metro Manila") in the layer control, distinct from a fetch error.
- Reports with unresolvable coordinates are listed in a text panel for the layer
  rather than dropped invisibly.

---

## Cross-cutting requirements

- **Honest degradation everywhere:** every data source failure must be distinguishable
  from "no hazards" — the app must never let an outage masquerade as an all-clear.
  This is the single most safety-critical behavior in the system.
- **Staleness disclosure:** any cached/stale data shown to the user or used by the
  agent carries its as-of timestamp.
- **Offline baseline:** with no connectivity at all, the app still shows cached map
  tiles, the NCR-filtered facility layers (bundled locally), and the last synced
  hazard reports with stale banners. The agent is unavailable offline, but the
  nearest-centers fallback and full A\* routing to a user-picked center still work
  (the routing engine and pedestrian graph are on-device); routes computed offline
  use last-synced hazard data and carry the staleness disclosure.
- **Emergency hotlines** (NDRRMC, MMDA, 911) are reachable from a static screen that
  requires no network and no agent.

---

## Open decisions

- **User location:** routing (US-3.4) implies a GPS permission flow; no story written yet.
- **Per-location rainfall supplement for US-3.2:** PAGASA (decided) gives one regional
  forecast; whether to add Open-Meteo or similar for exact-coordinates rainfall is open.
- **DRRM officer interface:** role-gated section inside the same app (less work, MVP-friendly)
  vs. a separate admin dashboard (closer to real DRRMO operations). Stories above work
  either way, but this affects architecture early.
