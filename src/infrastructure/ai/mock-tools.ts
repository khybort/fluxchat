import type { ToolCall } from './ai.types.js';

/**
 * Deterministic mock of a `getCurrentWeather` tool, used both by the mock
 * provider and the OpenAI provider when AI_TOOLS_ENABLED is true.
 *
 * In real systems this lives behind an interface and is registered with the
 * AI SDK's `tools` map. We keep it simple here.
 */
export const getCurrentWeather = (location: string): ToolCall => {
  const normalized = location.trim().toLowerCase();
  const tempC = (Array.from(normalized).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 30) + 5;
  return {
    name: 'getCurrentWeather',
    args: { location },
    result: { tempC, condition: 'partly cloudy', source: 'mock' },
  };
};

/**
 * Decide whether the user prompt asks about weather. Trivial heuristic so the
 * tool is exercised deterministically in demos and tests.
 */
export const detectWeatherIntent = (prompt: string): string | null => {
  const lower = prompt.toLowerCase();
  if (!/(weather|temperature|hava\s*durumu|sicaklik|sıcaklık)/.test(lower)) {
    return null;
  }
  const match = prompt.match(/in\s+([A-ZÇĞİÖŞÜ][\w\sÇĞİÖŞÜçğıöşü]+)/);
  return match?.[1]?.trim() ?? 'Istanbul';
};
