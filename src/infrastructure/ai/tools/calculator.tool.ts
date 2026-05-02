import { type ToolDefinition, z } from './types.js';
import { ToolExecutionError } from '../../../shared/errors/app-error.js';

const SAFE_EXPRESSION = /^[0-9+\-*/().\s]+$/;
const TOOL_NAME = 'calculator';
const MAX_EXPRESSION_LENGTH = 200;

interface CalculatorArgs {
  expression: string;
}

interface CalculatorResult {
  expression: string;
  value: number;
}

/**
 * Safe arithmetic evaluator. Whitelists digits + the four operators +
 * parentheses, then runs `new Function('return …')` in strict mode. No
 * identifiers means no access to globals — `eval`-class injection is
 * unreachable. Anything outside the whitelist throws.
 */
const evaluateSafely = (raw: string): number => {
  const trimmed = raw.trim();
  if (!trimmed) throw new ToolExecutionError(TOOL_NAME, 'Empty expression');
  if (!SAFE_EXPRESSION.test(trimmed)) {
    throw new ToolExecutionError(TOOL_NAME, 'Expression contains characters outside [0-9+-*/().]');
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const result = new Function('"use strict"; return (' + trimmed + ');')() as unknown;
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new ToolExecutionError(TOOL_NAME, 'Expression did not evaluate to a finite number');
  }
  return result;
};

export const calculatorTool: ToolDefinition<CalculatorArgs, CalculatorResult> = {
  name: 'calculator',
  description:
    'Evaluate a basic arithmetic expression. Supports digits, decimal point, the four ' +
    'operators (+ - * /), and parentheses. Use this for any math the model would ' +
    'otherwise have to compute by hand.',
  parameters: z.object({
    expression: z
      .string()
      .min(1)
      .max(MAX_EXPRESSION_LENGTH)
      .describe('Arithmetic expression, e.g. "(12 * 7) - 3 / 2"'),
  }),
  execute: ({ expression }) => ({
    expression,
    value: evaluateSafely(expression),
  }),
  detectIntent: (prompt) => {
    // Pull out a contiguous arithmetic-looking substring like "12 * 7" or
    // "(12+7)/2". The starting class includes '(' so leading parentheses
    // aren't dropped — otherwise the parens won't balance and the safe-eval
    // step rejects the expression.
    const match = prompt.match(/[\d.(][\d.+\-*/() ]*[\d.)]/);
    if (!match) return null;
    const expr = match[0].trim();
    if (!/[+\-*/]/.test(expr)) return null;
    // Bail on mismatched parens before reaching execute() so the mock
    // dispatcher doesn't fall through to an error envelope.
    let depth = 0;
    for (const ch of expr) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth < 0) return null;
    }
    if (depth !== 0) return null;
    return { expression: expr };
  },
  flag: { name: 'TOOL_CALCULATOR_ENABLED', default: true },
};
