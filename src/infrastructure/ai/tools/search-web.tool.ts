import { type ToolDefinition, z } from './types.js';

interface SearchWebArgs {
  query: string;
  maxResults?: number | undefined;
}

interface SearchHit {
  title: string;
  snippet: string;
  url: string;
}

interface SearchWebResult {
  query: string;
  abstract: string | null;
  abstractSource: string | null;
  abstractUrl: string | null;
  results: SearchHit[];
  source: 'duckduckgo';
}

interface DdgResponse {
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Topics?: Array<{ Text?: string; FirstURL?: string }>;
  }>;
}

const DDG_TIMEOUT_MS = 4_000;

/** Flatten DDG's nested topics so headings + leaves all become candidates. */
const flattenTopics = (
  topics: NonNullable<DdgResponse['RelatedTopics']>,
): Array<{ Text?: string; FirstURL?: string }> => {
  const out: Array<{ Text?: string; FirstURL?: string }> = [];
  for (const topic of topics) {
    if (topic.FirstURL && topic.Text) out.push(topic);
    if (topic.Topics) out.push(...flattenTopics(topic.Topics));
  }
  return out;
};

/**
 * Live web search via the DuckDuckGo Instant Answer API. Free, no API key,
 * works without registration. Returns the curated abstract (when DDG has
 * one) plus up to N related-topic links.
 *
 * Failure modes:
 *   - DDG rate-limits or returns 5xx → fall back to an empty result, not
 *     an error. The tool ALWAYS returns a structured response so the AI
 *     can phrase a "no results found" reply instead of erroring out.
 *   - Network timeout (4s) → same fallback.
 *   - Non-JSON body → same fallback.
 *
 * For demo prompts ("Who is Ada Lovelace?", "What is Anthropic?") DDG
 * usually has a high-quality abstract.
 */
export const searchWebTool: ToolDefinition<SearchWebArgs, SearchWebResult> = {
  name: 'searchWeb',
  description:
    'Search the web for up-to-date information using DuckDuckGo. Returns a curated ' +
    'abstract plus related links. Use this for questions about current events, ' +
    "people, companies, or anything outside the model's training data.",
  parameters: z.object({
    query: z.string().min(1).max(200).describe('Search query in natural language.'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Cap on related-topic results to return (default 3).'),
  }),
  execute: async ({ query, maxResults }) => {
    const cap = maxResults ?? 3;
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const empty: SearchWebResult = {
      query,
      abstract: null,
      abstractSource: null,
      abstractUrl: null,
      results: [],
      source: 'duckduckgo',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'fluxchat-ai-tool/1.0' },
      });
      if (!res.ok) return empty;
      const data = (await res.json()) as DdgResponse;
      const topics = data.RelatedTopics ? flattenTopics(data.RelatedTopics) : [];
      const results: SearchHit[] = topics
        .slice(0, cap)
        .map((t) => ({
          title: (t.Text ?? '').split(' - ')[0] ?? '',
          snippet: t.Text ?? '',
          url: t.FirstURL ?? '',
        }))
        .filter((r) => r.url && r.title);

      return {
        query,
        abstract: data.AbstractText && data.AbstractText.length > 0 ? data.AbstractText : null,
        abstractSource: data.AbstractSource ?? null,
        abstractUrl: data.AbstractURL && data.AbstractURL.length > 0 ? data.AbstractURL : null,
        results,
        source: 'duckduckgo',
      };
    } catch {
      // Timeouts, network errors, JSON parse failures all degrade to empty.
      return empty;
    } finally {
      clearTimeout(timer);
    }
  },
  detectIntent: (prompt) => {
    const lower = prompt.toLowerCase();
    if (!/(search|google|bul|ara|kim\s+|nedir|who is|what is)/.test(lower)) {
      return null;
    }
    // Strip the verb prefix; everything after is the query.
    const cleaned = prompt
      .replace(/^(search|google|find|look\s*up|ara|bul)\s+/i, '')
      .replace(/^(who\s+is|what\s+is|kim|ne)\s+/i, '')
      .trim();
    return { query: cleaned || prompt };
  },
};
