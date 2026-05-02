import { randomUUID } from 'node:crypto';

import type { Logger } from '../logger/logger.js';

/**
 * Lightweight tracing scaffold. Today every span emits a structured `span` log
 * line with `traceId`, `spanId`, `name`, `durationMs`, and `outcome`. That alone
 * gives you searchable per-operation timings in any log aggregator (Datadog,
 * Loki, Grafana Cloud) with zero extra dependencies.
 *
 * Extension hook for full OTel: wire `@opentelemetry/sdk-node` in
 * `src/server.ts` before this module loads — `OTEL_EXPORTER_OTLP_ENDPOINT` is
 * the established env var for that. Span names below already follow the
 * `<service>.<action>` convention OTel auto-instrumentation expects.
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: bigint;
}

export const createSpan = (name: string, parentTraceId?: string): SpanContext => ({
  traceId: parentTraceId ?? randomUUID(),
  spanId: randomUUID(),
  name,
  startedAt: process.hrtime.bigint(),
});

export const finishSpan = (
  span: SpanContext,
  outcome: 'ok' | 'error',
  logger: Logger,
  error?: unknown,
): void => {
  const durationMs = Number(process.hrtime.bigint() - span.startedAt) / 1_000_000;
  logger.pino.info(
    {
      traceId: span.traceId,
      spanId: span.spanId,
      name: span.name,
      durationMs: Math.round(durationMs * 100) / 100,
      outcome,
      ...(error instanceof Error ? { err: { name: error.name, message: error.message } } : {}),
    },
    'span',
  );
};

/**
 * Wrap an async operation in a span. Always logs once with the outcome — `ok`
 * if the promise resolves, `error` (with the error name + message) otherwise.
 * The thrown error propagates unchanged so call sites don't need to rewrap.
 *
 * The logger is injected (not pulled from the Logger singleton) so spans land
 * in the same correlation chain as the surrounding request — DI from the
 * caller's `this.logger`, not a global lookup.
 */
export const withSpan = async <T>(
  name: string,
  fn: (span: SpanContext) => Promise<T>,
  logger: Logger,
  parentTraceId?: string,
): Promise<T> => {
  const span = createSpan(name, parentTraceId);
  try {
    const result = await fn(span);
    finishSpan(span, 'ok', logger);
    return result;
  } catch (error: unknown) {
    finishSpan(span, 'error', logger, error);
    throw error;
  }
};
