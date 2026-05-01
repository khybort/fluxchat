import { type ToolDefinition, z } from './types.js';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'TRY', 'GBP', 'JPY', 'CHF', 'CAD'] as const;
type Currency = (typeof SUPPORTED_CURRENCIES)[number];

interface CurrencyArgs {
  amount: number;
  from: Currency;
  to: Currency;
}

interface CurrencyResult {
  amount: number;
  from: Currency;
  to: Currency;
  converted: number;
  rate: number;
  asOf: string;
  source: 'fixed-rate-2026-q2';
}

/**
 * Reference rates expressed in USD (1 USD = N units). Snapshot taken
 * 2026-Q2; not live FX. The mock is deterministic so demo screenshots
 * survive across days. For a production app, swap this map for a fetch
 * to ECB, Open Exchange Rates, or a Stripe FX endpoint.
 */
const USD_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  TRY: 32.5,
  GBP: 0.79,
  JPY: 149.2,
  CHF: 0.88,
  CAD: 1.36,
};

export const currencyTool: ToolDefinition<CurrencyArgs, CurrencyResult> = {
  name: 'convertCurrency',
  description:
    'Convert an amount of money from one currency to another using the most ' +
    'recent reference rates. Supports USD, EUR, TRY, GBP, JPY, CHF, CAD. Use this ' +
    'whenever the user asks "how much is X in Y" or "convert N currency".',
  parameters: z.object({
    amount: z.number().positive().describe('Amount in the source currency.'),
    from: z.enum(SUPPORTED_CURRENCIES).describe('Source currency code.'),
    to: z.enum(SUPPORTED_CURRENCIES).describe('Target currency code.'),
  }),
  execute: ({ amount, from, to }) => {
    const fromRate = USD_RATES[from];
    const toRate = USD_RATES[to];
    const rate = toRate / fromRate;
    const converted = Math.round(amount * rate * 100) / 100;
    return {
      amount,
      from,
      to,
      converted,
      rate: Math.round(rate * 10000) / 10000,
      asOf: '2026-04-01',
      source: 'fixed-rate-2026-q2',
    };
  },
  detectIntent: (prompt) => {
    // "100 USD to TRY" / "convert 50 EUR to GBP"
    const match = prompt.match(
      /(\d+(?:\.\d+)?)\s*(USD|EUR|TRY|GBP|JPY|CHF|CAD)\s*(?:to|in|→|->)\s*(USD|EUR|TRY|GBP|JPY|CHF|CAD)/i,
    );
    if (!match) return null;
    const [, amount, from, to] = match;
    if (!amount || !from || !to) return null;
    return {
      amount: Number(amount),
      from: from.toUpperCase() as Currency,
      to: to.toUpperCase() as Currency,
    };
  },
};
