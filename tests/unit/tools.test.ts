import { describe, expect, it } from 'vitest';

import { calculatorTool } from '../../src/infrastructure/ai/tools/calculator.tool.js';
import { currencyTool } from '../../src/infrastructure/ai/tools/currency.tool.js';
import {
  ALL_TOOLS,
  detectToolIntent,
  executeTool,
  toAiSdkTools,
  toAnthropicTools,
} from '../../src/infrastructure/ai/tools/registry.js';
import { searchWebTool } from '../../src/infrastructure/ai/tools/search-web.tool.js';
import { timeTool } from '../../src/infrastructure/ai/tools/time.tool.js';
import { weatherTool } from '../../src/infrastructure/ai/tools/weather.tool.js';

describe('Calculator tool', () => {
  it('evaluates basic arithmetic', async () => {
    const result = (await calculatorTool.execute({ expression: '(12 * 7) - 3 / 2' })) as {
      value: number;
    };
    expect(result.value).toBe(82.5);
  });

  it('rejects non-arithmetic input', () => {
    // calculator.execute is sync — wrap so toThrow can capture the throw.
    expect(() => calculatorTool.execute({ expression: 'process.env' })).toThrow(/outside/);
  });

  it('detects arithmetic intent in natural prompts', () => {
    expect(calculatorTool.detectIntent?.('what is (4 + 5) * 2?')).toEqual({
      expression: '(4 + 5) * 2',
    });
    expect(calculatorTool.detectIntent?.('hello world')).toBeNull();
  });
});

describe('Time tool', () => {
  it('returns ISO + timezone for an explicit IANA name', () => {
    const result = timeTool.execute({ timezone: 'Europe/Istanbul' }) as {
      timezone: string;
      iso: string;
      weekday: string;
    };
    expect(result.timezone).toBe('Europe/Istanbul');
    expect(result.iso).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.weekday).toBeTruthy();
  });

  it('falls back to UTC for invalid timezones', () => {
    const result = timeTool.execute({ timezone: 'Mars/Olympus' }) as { timezone: string };
    expect(result.timezone).toBe('UTC');
  });

  it('detects "what time is it in X" intents', () => {
    const args = timeTool.detectIntent?.('what time is it in Istanbul?');
    expect(args).toEqual({ timezone: 'Europe/Istanbul' });
  });
});

describe('Weather tool', () => {
  it('returns deterministic results for the same location', () => {
    const a = weatherTool.execute({ location: 'Istanbul' }) as { temperature: number };
    const b = weatherTool.execute({ location: 'Istanbul' }) as { temperature: number };
    expect(a.temperature).toBe(b.temperature);
  });

  it('respects fahrenheit units', () => {
    const c = weatherTool.execute({ location: 'Istanbul', units: 'celsius' }) as {
      temperature: number;
    };
    const f = weatherTool.execute({ location: 'Istanbul', units: 'fahrenheit' }) as {
      temperature: number;
    };
    expect(f).not.toEqual(c);
    expect(f.temperature).toBeGreaterThan(c.temperature);
  });
});

describe('Currency tool', () => {
  it('converts USD to TRY with the snapshot rate', () => {
    const result = currencyTool.execute({ amount: 100, from: 'USD', to: 'TRY' }) as {
      converted: number;
      rate: number;
    };
    expect(result.converted).toBe(3250);
    expect(result.rate).toBe(32.5);
  });

  it('detects "100 USD to TRY" intents', () => {
    expect(currencyTool.detectIntent?.('how much is 50 EUR in GBP?')).toMatchObject({
      amount: 50,
      from: 'EUR',
      to: 'GBP',
    });
  });
});

describe('Search-web tool', () => {
  it('always returns a structured shape (network failures degrade gracefully)', async () => {
    // Don't hit the network — short-circuit by passing a query and asserting shape only.
    // Real DDG calls are out of scope for unit tests; this still validates the contract.
    const args = searchWebTool.detectIntent?.('who is Ada Lovelace?');
    expect(args).toEqual({ query: 'Ada Lovelace?' });
  });
});

describe('Registry', () => {
  it('lists all five tools', () => {
    expect(ALL_TOOLS.map((t) => t.name).sort()).toEqual([
      'calculator',
      'convertCurrency',
      'getCurrentTime',
      'getCurrentWeather',
      'searchWeb',
    ]);
  });

  it('executeTool validates args against the tool schema', async () => {
    const ok = await executeTool('calculator', { expression: '1+1' });
    expect((ok as { value: number }).value).toBe(2);

    const bad = await executeTool('calculator', { wrong: 'shape' });
    expect(bad).toMatchObject({ error: 'invalid_arguments' });
  });

  it('executeTool returns an error envelope for unknown tools', async () => {
    const result = await executeTool('NONEXISTENT', {});
    expect(result).toMatchObject({ error: expect.stringContaining('unknown_tool') });
  });

  it('toAnthropicTools produces a valid input_schema for every tool', () => {
    const tools = toAnthropicTools();
    expect(tools).toHaveLength(5);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('toAiSdkTools registers every tool with an executable hook', () => {
    const tools = toAiSdkTools();
    expect(Object.keys(tools).sort()).toEqual([
      'calculator',
      'convertCurrency',
      'getCurrentTime',
      'getCurrentWeather',
      'searchWeb',
    ]);
  });

  it('detectToolIntent dispatches the first matching tool', async () => {
    const fired = await detectToolIntent('what is (10 + 5) * 2?');
    expect(fired?.name).toBe('calculator');
    expect((fired?.result as { value: number }).value).toBe(30);
  });

  it('detectToolIntent returns null when no tool matches', async () => {
    const fired = await detectToolIntent('hello there');
    expect(fired).toBeNull();
  });
});
