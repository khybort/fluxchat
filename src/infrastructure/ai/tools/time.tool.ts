import { type ToolDefinition, z } from './types.js';

interface TimeArgs {
  timezone?: string | undefined;
}

interface TimeResult {
  timezone: string;
  iso: string;
  formatted: string;
  weekday: string;
  unixMs: number;
}

const isValidTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const timeTool: ToolDefinition<TimeArgs, TimeResult> = {
  name: 'getCurrentTime',
  description:
    'Return the current date + time in the requested IANA timezone (e.g. "Europe/Istanbul", ' +
    '"America/New_York"). Defaults to UTC if no timezone is given. Use this for any ' +
    '"what time is it" / "what day is it" question.',
  parameters: z.object({
    timezone: z.string().optional().describe('IANA timezone identifier; defaults to UTC.'),
  }),
  execute: ({ timezone }) => {
    const tz = timezone && isValidTimezone(timezone) ? timezone : 'UTC';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long',
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    return {
      timezone: tz,
      iso: now.toISOString(),
      formatted: formatter.format(now),
      weekday,
      unixMs: now.getTime(),
    };
  },
  detectIntent: (prompt) => {
    const lower = prompt.toLowerCase();
    if (!/(what.{0,5}(time|day|date)|saat\s*ka[çc]|what's\s+the\s+time)/.test(lower)) {
      return null;
    }
    // Pull a timezone hint like "in Istanbul" / "in New York" / "in Tokyo".
    const match = prompt.match(/in\s+([A-Z][\w\s/-]+)/);
    const hint = match?.[1]?.trim();
    if (!hint) return {};
    // Map common city → IANA names. Keeps the demo bullet-proof.
    const cityToTz: Record<string, string> = {
      istanbul: 'Europe/Istanbul',
      london: 'Europe/London',
      'new york': 'America/New_York',
      tokyo: 'Asia/Tokyo',
      paris: 'Europe/Paris',
      berlin: 'Europe/Berlin',
      'san francisco': 'America/Los_Angeles',
    };
    const tz = cityToTz[hint.toLowerCase()];
    return tz ? { timezone: tz } : { timezone: hint };
  },
};
