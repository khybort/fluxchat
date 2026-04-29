import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { Logger } from '../logger/logger.js';

type PrismaEventClient = PrismaClient & {
  $on: (event: 'error' | 'warn', cb: (event: Prisma.LogEvent) => void) => void;
};

export class PrismaService {
  private static instance: PrismaService | null = null;
  public readonly client: PrismaClient;

  private constructor(logger: Logger) {
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
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
