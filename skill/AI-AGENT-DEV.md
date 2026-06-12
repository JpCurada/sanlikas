# Agent: AI Agent Developer (Gemini ReAct)

You build the in-app ReAct loop, its tools, and the chat UI wiring, plus the PAGASA
scraper that feeds the weather tool. Authority docs: [docs/design.md](../docs/design.md)
§4, §6; [docs/user-stories.md](../docs/user-stories.md) US-3.1–3.3.

## ReAct loop (`lib/agent/`)

- `@google/genai` SDK, model `gemini-2.5-flash`, `baseUrl` pointed at the
  `gemini-proxy` Edge Function. The API key never exists in app code or config.
- Loop: send history + `functionDeclarations` → if `functionCall`, execute the tool
  locally, append `functionResponse`, repeat. Hard caps: **6 tool iterations**,
  **30 s wall clock** (then summarize partials, don't discard — US-3.1).
- Emit typed events to the UI (`status` / `text` / `route` / `fallback` — shapes in
  design §4). The loop never touches map components directly.
- System prompt requirements: reply in the user's language (FIL/EN/Taglish);
  always distinguish "no hazards reported" from "couldn't check"; always append the
  follow-official-instructions advisory; scope = Metro Manila evacuation only.

## Tools — all tri-state (`ok` / `empty` / `unavailable`)

| Tool | Implementation |
|---|---|
| `get_weather_status()` | read `weather_cache` row; compute `stale` from `scraped_at`/`scrape_ok`; > 12 h ⇒ `unavailable` |
| `get_hazard_reports(lat, lng, radius_m)` | `supabase.rpc('get_hazard_reports', …)`; query failure ⇒ `unavailable`, **never `[]`** |
| `route_to_safest_center(origin, facility_types?)` | `lib/routing/centerSelection.ts` — in-process call |

- Tool results returned to Gemini are compact JSON (token cost); the `route` event
  to the UI carries the full GeoJSON (Gemini never needs the polyline coordinates —
  send it summary stats: distance, duration, avoided hazards, compromised flag).

## Failure ladder (in order)

1. Gemini 5xx/timeout → retry once.
2. Still failing → emit `fallback`; UI shows nearest centers by haversine from
   bundled GeoJSON, each tappable to run local A\* routing (works offline).
3. Single tool `unavailable` → agent answers anyway, names what it couldn't check.
4. Location unavailable → ask for a dropped pin / typed landmark before routing.

## PAGASA scraper (`scripts/scrape-pagasa.ts`, runs in GitHub Actions)

- Target: https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd · cheerio +
  CSS selectors · project User-Agent · single attempt per run (the 20-min cron is
  the retry loop).
- Extract: issued-at, sky condition, temp range, wind, Heavy Rainfall Warnings,
  thunderstorm advisories + affected municipalities (match against a static NCR
  city list; keep unmatched names as free text).
- **Selectors match nothing ⇒ write `scrape_ok = false` (keep old payload) and
  `process.exit(1)`** — the failed workflow run *is* the alert. Never write an
  empty payload that reads as "all clear".
- Keep `__fixtures__/pagasa-ncr.html` (saved page) + a parser test against it;
  refresh the fixture when PAGASA changes layout.

## Evals (lightweight, scripted)

`scripts/eval-agent.ts` with ~10 canned scenarios (mock tool returns): flood
between user and nearest center ⇒ recommends farther center and says why; all
tools down ⇒ honest degradation; Taglish query ⇒ Taglish answer. Run before demos.
