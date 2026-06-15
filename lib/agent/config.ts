/**
 * Gemini API key for the demo (direct from app — see plan.md decision).
 * Must move behind the gemini-proxy Edge Function before any public release
 * (design §4); a key in the bundle is extractable.
 */
export const GEMINI_API_KEY = (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
export const GEMINI_MODEL =
  (process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash';

export const GEMINI_KEY_PRESENT = GEMINI_API_KEY.length > 0;
