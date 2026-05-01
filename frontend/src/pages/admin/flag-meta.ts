import type { FlagName } from '@/api/types';

export const AI_TOOLS_MASTER = 'AI_TOOLS_ENABLED' as const;

export const TOOL_FLAGS: ReadonlySet<FlagName> = new Set([
  'TOOL_CALCULATOR_ENABLED',
  'TOOL_CURRENT_TIME_ENABLED',
  'TOOL_CURRENT_WEATHER_ENABLED',
  'TOOL_CONVERT_CURRENCY_ENABLED',
  'TOOL_SEARCH_WEB_ENABLED',
]);

export const NUMERIC_FLAGS: ReadonlyArray<FlagName> = ['PAGINATION_LIMIT', 'RATE_LIMIT_PER_MINUTE'];

export const FLAG_LIST: ReadonlyArray<FlagName> = [
  'STREAMING_ENABLED',
  'AI_TOOLS_ENABLED',
  'CHAT_HISTORY_ENABLED',
  'PAGINATION_LIMIT',
  'RATE_LIMIT_PER_MINUTE',
  'COMPLETION_ENABLED',
  'TOOL_CALCULATOR_ENABLED',
  'TOOL_CURRENT_TIME_ENABLED',
  'TOOL_CURRENT_WEATHER_ENABLED',
  'TOOL_CONVERT_CURRENCY_ENABLED',
  'TOOL_SEARCH_WEB_ENABLED',
];

export const MASTER_OFF_BADGE = 'Inherited from master OFF';
export const MASTER_GROUP_HINT =
  'Subordinate to AI_TOOLS_ENABLED — when the master is off these are ignored even if turned on here.';

export interface FlagDescriptor {
  name: FlagName;
  blurb: string;
  effect: string;
}

export interface FlagGroup {
  title: string;
  hint?: string;
  flags: FlagDescriptor[];
}

export const FLAG_GROUPS: FlagGroup[] = [
  {
    title: 'Core',
    flags: [
      {
        name: 'STREAMING_ENABLED',
        blurb: 'Stream the AI response token-by-token via SSE.',
        effect: 'Off → response arrives as a single JSON payload, no streaming caret.',
      },
      {
        name: 'AI_TOOLS_ENABLED',
        blurb: 'Master switch for the AI tool catalog.',
        effect: 'Off → no tools are exposed to the model regardless of per-tool flags below.',
      },
      {
        name: 'CHAT_HISTORY_ENABLED',
        blurb: 'Return the full message history (cursor-paginated).',
        effect: 'Off → only the last 10 messages are returned. Useful for mobile / free tier.',
      },
      {
        name: 'PAGINATION_LIMIT',
        blurb: 'Maximum items per page in the chat list and history.',
        effect: 'Numeric ceiling — clamped to [10, 100] when read.',
      },
      {
        name: 'RATE_LIMIT_PER_MINUTE',
        blurb: 'Per-route, per-(user, clientType) request ceiling each minute.',
        effect: 'Lower → 429 hits sooner. Mobile + web sessions track separate buckets.',
      },
      {
        name: 'COMPLETION_ENABLED',
        blurb: 'Kill-switch for the AI completion route.',
        effect:
          'Off → POST /api/chats/:id/completion returns 404 FEATURE_DISABLED. Other routes unaffected.',
      },
    ],
  },
  {
    title: 'AI Tools',
    hint: MASTER_GROUP_HINT,
    flags: [
      {
        name: 'TOOL_CALCULATOR_ENABLED',
        blurb: 'Safe arithmetic evaluation (+ - × ÷ and parentheses).',
        effect: "Off → math questions are answered from the model's training, no tool card.",
      },
      {
        name: 'TOOL_CURRENT_TIME_ENABLED',
        blurb: 'IANA-timezone-aware current date + time.',
        effect: 'Off → "what time is it in Tokyo?" answered without tool grounding.',
      },
      {
        name: 'TOOL_CURRENT_WEATHER_ENABLED',
        blurb: 'Mock weather lookup (deterministic — same city, same numbers).',
        effect: 'Off → weather questions answered from training data, often with disclaimers.',
      },
      {
        name: 'TOOL_CONVERT_CURRENCY_ENABLED',
        blurb: 'FX conversion over USD / EUR / TRY / GBP / JPY / CHF / CAD.',
        effect: 'Off → currency conversion answered from stale training-time rates.',
      },
      {
        name: 'TOOL_SEARCH_WEB_ENABLED',
        blurb: 'Real DuckDuckGo Instant Answer search (no API key, 4s timeout).',
        effect: 'Off → no live web grounding, model answers from training data only.',
      },
    ],
  },
];
