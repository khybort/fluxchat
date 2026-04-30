import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { Logger } from '../logger/logger.js';

const SLOW_QUERY_MS = 200;

type PrismaEventClient = PrismaClient & {
  $on: (event: 'error' | 'warn', cb: (event: Prisma.LogEvent) => void) => void;
} & {
  $on: (event: 'query', cb: (event: Prisma.QueryEvent) => void) => void;
};

export class PrismaService {
  private static instance: PrismaService | null = null;
  public readonly client: PrismaClient;

  private constructor(logger: Logger) {
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        // Stream every query so we can WARN on slow ones. Downstream filtering
        // keeps the noisy fast-path queries off the log pipeline in prod.
        { emit: 'event', level: 'query' },
      ],
    });

    // Prisma narrows $on overloads via the const-shape of `log`. The cast bridges
    // the gap when `log` is typed structurally rather than as a literal tuple.
    const eventClient = client as PrismaEventClient;
    eventClient.$on('error', (event) => {
      logger.pino.error({ event }, 'prisma_error');
    });
    eventClient.$on('warn', (event) => {
      logger.pino.warn({ event }, 'prisma_warn');
    });
    eventClient.$on('query', (event) => {
      // Operationally we only care about queries slower than SLOW_QUERY_MS. The
      // duration field is reported in milliseconds by Prisma since 5.x. We
      // strip the (potentially long) raw query body from the log line on
      // purpose — the target field plus duration is enough to spot a culprit.
      if (event.duration >= SLOW_QUERY_MS) {
        logger.pino.warn(
          {
            durationMs: event.duration,
            target: event.target,
            params: event.params,
          },
          'prisma_slow_query',
        );
      }
    });

    this.client = client;
  }

  public static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService(Logger.getInstance());
    }
    return PrismaService.instance;
  }

  /** Test-only. */
  public static resetForTesting(): void {
    PrismaService.instance = null;
  }

  public async connect(): Promise<void> {
    await this.client.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }
}
