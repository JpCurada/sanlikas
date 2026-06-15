import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import type { LngLat } from '@/lib/geo/ncr';
import { haversineMeters } from '@/lib/routing/geo';
import {
  getHazardReports,
  routeToSafestCenter,
  type RouteToolResult,
} from './tools';
import type { AgentContext, AgentEvent, NearestCenter } from './types';
import { GEMINI_MODEL } from './config';

const MAX_ITERATIONS = 6;
const WALL_CLOCK_MS = 30_000;

const SYSTEM_PROMPT = `You are SanLikas, an evacuation routing assistant for Metro Manila.

ALWAYS use the tools. Never answer from your own knowledge. Never claim you lack information without first calling the tools.

For ANY request about evacuating, directions, or a specific center:
1. Call get_hazard_reports.
2. Call route_to_safest_center. If the user named a specific center (e.g. "Toro Hills", "Delpan"), pass it as facility_name; otherwise omit it to get the safest center.

Then answer in 2-3 short sentences, in the user's language (Filipino, English, or Taglish): name the center, the walking distance/time, and any hazard on the route. Calm and concise.

Rules:
- route_to_safest_center status "not_found" means that named center is not in the data: tell the user it was not found and offer to route to the safest center instead.
- status "unavailable" means routing could not run, not "no route exists".
- If the route is compromised (crosses a hazard), say so and advise caution.
- End with a brief reminder to follow official LGU/DRRM instructions.`;

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_hazard_reports',
    description:
      'Get the latest official DRRM hazard reports (e.g. floods) near the user. Returns "empty" if none, "unavailable" if it could not be checked.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'route_to_safest_center',
    description:
      'Plan a hazard-aware walking route from the user location. If facility_name is given, routes to that named center; otherwise selects the safest reachable evacuation center. Returns the center, distance, walking time, and whether the route crosses a hazard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        facility_name: {
          type: Type.STRING,
          description:
            'Optional. The specific evacuation center the user named (e.g. "Toro Hills"). Omit to get the safest center.',
        },
      },
    },
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
  let routeEmitted = false;

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
        model: GEMINI_MODEL,
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
        if (pendingRouteUi && !routeEmitted) {
          yield {
            type: 'route',
            route: pendingRouteUi.route,
            facility: pendingRouteUi.facility,
            compromised: pendingRouteUi.route.compromised,
            tradeoff: pendingRouteUi.tradeoff,
          };
          routeEmitted = true;
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
        if (name === 'get_hazard_reports') {
          result = getHazardReports(ctx, origin);
        } else if (name === 'route_to_safest_center') {
          const args = (part.functionCall!.args ?? {}) as { facility_name?: string };
          const r = await routeToSafestCenter(ctx, origin, args.facility_name);
          if (r.ui) {
            pendingRouteUi = r.ui;
            if (!routeEmitted) {
              yield {
                type: 'route',
                route: r.ui.route,
                facility: r.ui.facility,
                compromised: r.ui.route.compromised,
                tradeoff: r.ui.tradeoff,
              };
              routeEmitted = true;
            }
          }
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
      if (!routeEmitted) {
        yield {
          type: 'route',
          route: pendingRouteUi.route,
          facility: pendingRouteUi.facility,
          compromised: pendingRouteUi.route.compromised,
          tradeoff: pendingRouteUi.tradeoff,
        };
        routeEmitted = true;
      }
      yield {
        type: 'text',
        chunk: pendingRouteUi.tradeoff,
      };
    } else {
      yield* emitFallback(origin, ctx);
    }
    yield { type: 'done' };
  } catch (err) {
    console.warn('[agent] Gemini request failed:', err);
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
