import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import type { LngLat } from '@/lib/geo/ncr';
import { haversineMeters } from '@/lib/routing/geo';
import {
  getHazardReports,
  getWeatherStatus,
  routeToSafestCenter,
  type RouteToolResult,
} from './tools';
import type { AgentContext, AgentEvent, NearestCenter } from './types';

const MODEL = 'gemini-2.5-flash';
const MAX_ITERATIONS = 6;
const WALL_CLOCK_MS = 30_000;

const SYSTEM_PROMPT = `You are SanLikas, an evacuation assistant for Metro Manila, Philippines.
The user asks where to evacuate (often "Saan tayo lilikas?"). Reply in the SAME language they used (Filipino, English, or Taglish).

Your job: recommend the SAFEST reachable evacuation center and explain why — not merely the nearest.

Process: check the latest weather, check official DRRM hazard reports near the user, then plan a hazard-aware route. Call the tools to do this; do not guess.

Critical honesty rules:
- A tool result of "empty" means "nothing reported" (genuinely clear). A result of "unavailable" means "could NOT be checked" — never treat unavailable as all-clear. Say explicitly when you could not check something.
- If routing returns a compromised route (crosses a hazard), say so plainly and advise caution.
- Always end with a short reminder to follow official LGU/DRRM instructions.

Keep replies concise and calm — the user may be in an emergency. After you have routed, give a 2-3 sentence recommendation naming the center and the reason.`;

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_weather_status',
    description: 'Get the latest weather and rainfall warning status for Metro Manila.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_hazard_reports',
    description:
      'Get the latest official DRRM hazard reports (e.g. floods) near the user. Returns status "empty" if none, "unavailable" if it could not be checked.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'route_to_safest_center',
    description:
      'Plan a hazard-aware walking route to the safest reachable evacuation center from the user location, avoiding reported hazards and flood-prone roads. Returns the chosen center, distance, walking time, and whether the route is compromised.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

/**
 * Run one turn of the ReAct agent. Yields typed events for the UI to render
 * (design §4). The agent never touches the map — it emits a `route` event and
 * the UI draws it. On total failure it emits a `fallback` with nearest centers
 * by straight-line distance (works even if Gemini is down).
 */
export async function* runAgentTurn(
  apiKey: string,
  userMessage: string,
  ctx: AgentContext,
): AsyncGenerator<AgentEvent> {
  if (!ctx.origin) {
    yield {
      type: 'text',
      chunk:
        'Hindi ko makita ang inyong lokasyon. Mag-drop po ng pin sa mapa o sabihin ang inyong barangay para makapagplano ako ng ruta.',
    };
    yield { type: 'done' };
    return;
  }
  const origin = ctx.origin;

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = [
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  // Captured for the UI route event when the routing tool runs.
  let pendingRouteUi: RouteToolResult['ui'] | null = null;

  const deadline = Date.now() + WALL_CLOCK_MS;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (Date.now() > deadline) {
        yield {
          type: 'text',
          chunk: 'Sorry, masyadong matagal ang pagproseso. Subukan muli, o gamitin ang listahan ng pinakamalapit na sentro sa ibaba.',
        };
        yield* emitFallback(origin, ctx);
        yield { type: 'done' };
        return;
      }

      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations }],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);

      // Record the assistant turn so the conversation stays coherent.
      contents.push({ role: 'model', parts });

      if (calls.length === 0) {
        // Final answer.
        const text = response.text ?? parts.map((p) => p.text ?? '').join('');
        if (text) yield { type: 'text', chunk: text };
        if (pendingRouteUi) {
          yield {
            type: 'route',
            route: pendingRouteUi.route,
            facility: pendingRouteUi.facility,
            compromised: pendingRouteUi.route.compromised,
            tradeoff: pendingRouteUi.tradeoff,
          };
        }
        yield { type: 'done' };
        return;
      }

      // Execute each requested tool, append a functionResponse.
      const responseParts = [];
      for (const part of calls) {
        const name = part.functionCall!.name!;
        yield { type: 'status', label: statusLabel(name) };

        let result: unknown;
        if (name === 'get_weather_status') {
          result = getWeatherStatus(ctx);
        } else if (name === 'get_hazard_reports') {
          result = getHazardReports(ctx, origin);
        } else if (name === 'route_to_safest_center') {
          const r = await routeToSafestCenter(ctx, origin);
          if (r.ui) pendingRouteUi = r.ui;
          result = { status: r.status, summary: r.summary };
        } else {
          result = { status: 'unavailable', error: `unknown tool ${name}` };
        }

        responseParts.push({
          functionResponse: { name, response: result as Record<string, unknown> },
        });
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    // Ran out of iterations — summarize with what we have.
    if (pendingRouteUi) {
      yield {
        type: 'route',
        route: pendingRouteUi.route,
        facility: pendingRouteUi.facility,
        compromised: pendingRouteUi.route.compromised,
        tradeoff: pendingRouteUi.tradeoff,
      };
      yield { type: 'text', chunk: pendingRouteUi.tradeoff };
    } else {
      yield* emitFallback(origin, ctx);
    }
    yield { type: 'done' };
  } catch (err) {
    yield {
      type: 'error',
      message: 'Hindi maabot ang AI assistant. Narito ang pinakamalapit na mga sentro:',
    };
    yield* emitFallback(origin, ctx);
    yield { type: 'done' };
  }
}

function statusLabel(toolName: string): string {
  switch (toolName) {
    case 'get_weather_status':
      return 'Tinitingnan ang panahon…';
    case 'get_hazard_reports':
      return 'Sinusuri ang mga ulat ng panganib…';
    case 'route_to_safest_center':
      return 'Naghahanap ng pinakaligtas na ruta…';
    default:
      return 'Nagpoproseso…';
  }
}

/** Distance-based nearest-centers fallback — works with zero connectivity. */
function* emitFallback(origin: LngLat, ctx: AgentContext): Generator<AgentEvent> {
  const centers: NearestCenter[] = [...ctx.facilities]
    .map((facility) => ({
      facility,
      straightLineMeters: haversineMeters(
        origin,
        facility.geometry.coordinates as LngLat,
      ),
    }))
    .sort((a, b) => a.straightLineMeters - b.straightLineMeters)
    .slice(0, 5);
  yield { type: 'fallback', centers };
}
