/**
 * Agent CLI harness — test the full ReAct agent + routing pipeline from the
 * terminal, with no phone / emulator / Metro. Loads the real NCR graph, real
 * facilities, and seed hazards, then runs runAgentTurn against your prompt and
 * prints every event (status, tool calls, route, final text).
 *
 * Usage (PowerShell):
 *   $env:EXPO_PUBLIC_GEMINI_API_KEY="<key>"; npx tsx scripts/agent-cli.mts "Saan tayo lilikas?"
 *
 * Or rely on .env being loaded:
 *   npx tsx -r dotenv/config scripts/agent-cli.mts "Paano pumunta sa Toro Hills?"
 *
 * Optional 2nd arg: origin as "lng,lat" (defaults to the demo Manila origin).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env so EXPO_PUBLIC_* vars are available without exporting them.
import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { __setGraphForTest } from '../lib/routing/graphCache';
import type { PedestrianGraph, HazardZone } from '../lib/routing/types';
import { runAgentTurn } from '../lib/agent/loop';
import { SEED_HAZARDS, DEMO_ORIGIN } from '../lib/hazards/seed';
import type { AgentContext } from '../lib/agent/types';
import type { LngLat } from '../lib/geo/ncr';

/**
 * Fetch live hazards from Supabase (the same get_active_hazards RPC the app
 * uses), so the CLI tests against real authority-filed reports. Falls back to
 * the bundled seed when Supabase is unconfigured or unreachable.
 */
async function fetchHazards(origin: LngLat): Promise<{ hazards: HazardZone[]; source: string }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { hazards: SEED_HAZARDS, source: 'seed (no Supabase config)' };
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc('get_active_hazards', {
      in_lng: origin[0],
      in_lat: origin[1],
      in_radius_m: 8000,
      in_max_age_hours: 24,
    });
    if (error) throw error;
    const hazards: HazardZone[] = (data as any[]).map((r) => ({
      id: r.id,
      kind: r.hazard_type,
      center: [r.lng, r.lat],
      hardRadiusM: r.hard_radius_m,
      softRadiusM: r.soft_radius_m,
      severity: r.severity,
      description: r.description,
    }));
    return { hazards, source: `Supabase (${hazards.length} live reports)` };
  } catch (err) {
    return { hazards: SEED_HAZARDS, source: `seed (Supabase failed: ${(err as Error).message})` };
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const prompt = process.argv[2] ?? 'Saan tayo lilikas?';
  const originArg = process.argv[3];
  const origin: LngLat = originArg
    ? (originArg.split(',').map(Number) as LngLat)
    : DEMO_ORIGIN;

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
  if (!apiKey) {
    console.error('No EXPO_PUBLIC_GEMINI_API_KEY found (.env or env var). Aborting.');
    process.exit(1);
  }

  // Load the bundled graph the same way the app does, then inject it.
  console.log('Loading NCR pedestrian graph...');
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets/graph/ncr-pedestrian-graph.json'), 'utf8'),
  );
  const adjacency: PedestrianGraph['adjacency'] = raw.nodes.map(() => []);
  for (const [a, b, m, f] of raw.edges) {
    adjacency[a].push([b, m, f]);
    adjacency[b].push([a, m, f]);
  }
  __setGraphForTest({ nodes: raw.nodes, adjacency, meta: raw.meta });

  const facilities = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets/facilities/evacuation.geojson'), 'utf8'),
  ).features;

  const { hazards, source } = await fetchHazards(origin);
  const ctx: AgentContext = { origin, facilities, hazards };

  console.log('────────────────────────────────────────');
  console.log('Prompt:', prompt);
  console.log('Origin:', origin.join(', '));
  console.log('Hazards:', hazards.length, '| Source:', source);
  console.log('────────────────────────────────────────');

  const t0 = Date.now();
  for await (const ev of runAgentTurn(apiKey, prompt, ctx)) {
    switch (ev.type) {
      case 'status':
        console.log(`  [tool] ${ev.label}`);
        break;
      case 'text':
        console.log(`\nANSWER:\n${ev.chunk}\n`);
        break;
      case 'route':
        console.log(
          `  [route] -> ${ev.facility.properties.name} ` +
            `| ${(ev.route.distanceMeters / 1000).toFixed(2)} km ` +
            `| ${ev.route.durationMinutesWalking} min ` +
            `| compromised=${ev.compromised}`,
        );
        break;
      case 'fallback':
        console.log('  [fallback] nearest centers:');
        ev.centers.forEach((c, i) =>
          console.log(
            `     ${i + 1}. ${c.facility.properties.name} (${(c.straightLineMeters / 1000).toFixed(1)} km)`,
          ),
        );
        break;
      case 'error':
        console.log(`  [error] ${ev.message}`);
        break;
      case 'done':
        console.log(`────────────────────────────────────────`);
        console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        break;
    }
  }
}

main().catch((err) => {
  console.error('\nAGENT RUN FAILED:');
  console.error(err?.message ?? err);
  process.exit(1);
});
