import { type ToolDefinition, z } from './types.js';

interface WeatherArgs {
  location: string;
  units?: 'celsius' | 'fahrenheit' | undefined;
}

interface WeatherResult {
  location: string;
  units: 'celsius' | 'fahrenheit';
  temperature: number;
  condition: string;
  humidity: number;
  windKph: number;
  source: 'mock';
}

/**
 * Deterministic mock weather. The case explicitly suggests `getCurrentWeather`
 * as the canonical demo tool — we keep the contract but enrich the response
 * with humidity + wind so AI replies feel less skeletal.
 *
 * Determinism: every field is derived from a stable hash of the location
 * string, so the same prompt always yields the same reading. Lets tests
 * assert specific numbers and lets the percentage-rollout demo pair this
 * tool with the AI_TOOLS_ENABLED flag without flaky output.
 */
const CONDITIONS = [
  'partly cloudy',
  'sunny',
  'overcast',
  'light rain',
  'misty',
  'clear sky',
  'thunderstorms',
  'windy',
];

const hashLocation = (loc: string): number => {
  let h = 0;
  for (const ch of loc) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

export const weatherTool: ToolDefinition<WeatherArgs, WeatherResult> = {
  name: 'getCurrentWeather',
  description:
    'Look up the current weather for a city or region. Returns temperature, condition, ' +
    'humidity, and wind speed. Use this whenever the user asks about weather, temperature, ' +
    'or what to wear.',
  parameters: z.object({
    location: z
      .string()
      .min(1)
      .describe('City name or location, e.g. "Istanbul" or "San Francisco, CA"'),
    units: z
      .enum(['celsius', 'fahrenheit'])
      .optional()
      .describe('Temperature units; defaults to celsius.'),
  }),
  execute: ({ location, units }) => {
    const u = units ?? 'celsius';
    const hash = hashLocation(location.trim().toLowerCase());
    const tempC = (hash % 30) + 5;
    const temperature = u === 'celsius' ? tempC : Math.round((tempC * 9) / 5 + 32);
    return {
      location,
      units: u,
      temperature,
      condition: CONDITIONS[hash % CONDITIONS.length] ?? 'partly cloudy',
      humidity: 30 + (hash % 50),
      windKph: 5 + (hash % 25),
      source: 'mock',
    };
  },
  detectIntent: (prompt) => {
    const lower = prompt.toLowerCase();
    if (!/(weather|temperature|hava\s*durumu|sicaklik|sıcaklık)/.test(lower)) {
      return null;
    }
    const match = prompt.match(/in\s+([A-ZÇĞİÖŞÜ][\w\sÇĞİÖŞÜçğıöşü-]+)/);
    return { location: match?.[1]?.trim() ?? 'Istanbul' };
  },
  flag: { name: 'TOOL_CURRENT_WEATHER_ENABLED', default: true },
};
