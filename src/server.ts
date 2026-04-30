import 'dotenv/config';

import { createApp } from './app.js';
import { Config } from './config/config.js';
import { buildContainer } from './di/container.js';
import { PrismaService } from './infrastructure/database/prisma.service.js';
import { Logger } from './infrastructure/logger/logger.js';
import { FeatureFlagService } from './shared/feature-flags/feature-flag.service.js';

const main = async (): Promise<void> => {
  // Initialization order is mandatory (CLAUDE.md §10):
  //   Config -> Logger -> FeatureFlagService -> PrismaService -> DI -> app -> listen
  const config = Config.getInstance();
  const logger = Logger.getInstance();
  const flags = FeatureFlagService.getInstance();
  const prisma = PrismaService.getInstance();

  await prisma.connect();
  logger.pino.info({ env: config.values.app.nodeEnv }, 'database_connected');

  const container = buildContainer();
  // Prisma is up + the override store is wired in buildContainer(). Pull DB
  // overrides into the in-memory state before we start serving requests so
  // the very first /api/chats sees the right flag values.
  await container.flags.reload();

  const app = createApp(container);
  const server = app.listen(config.values.app.port, () => {
    logger.pino.info({ port: config.values.app.port }, 'server_listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.pino.info({ signal }, 'shutdown_started');
    server.close(() => {
      logger.pino.info('http_server_closed');
    });
    try {
      await container.shutdown();
      logger.pino.info('container_resources_released');
    } catch (error) {
      logger.pino.error({ err: error }, 'shutdown_container_failed');
    }
    try {
      await prisma.disconnect();
      logger.pino.info('database_disconnected');
    } catch (error) {
      logger.pino.error({ err: error }, 'shutdown_disconnect_failed');
    }
    await logger.flush();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGHUP', () => {
    logger.pino.info('SIGHUP_received_reloading_flags');
    void flags.reload().catch((err: unknown) => {
      logger.pino.error({ err }, 'feature_flags_reload_failed');
    });
  });
  process.on('uncaughtException', (error) => {
    logger.pino.fatal({ err: error }, 'uncaught_exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.pino.fatal({ reason }, 'unhandled_rejection');
    process.exit(1);
  });
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', error);
  process.exit(1);
});
