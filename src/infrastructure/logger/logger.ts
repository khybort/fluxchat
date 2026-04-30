import { pino, type Logger as PinoLogger } from 'pino';

import { Config } from '../../config/config.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-firebase-app-check"]',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.openAiApiKey',
  '*.jwtSecret',
];

export class Logger {
  private static instance: Logger | null = null;
  public readonly pino: PinoLogger;

  private constructor(pinoLogger: PinoLogger) {
    this.pino = pinoLogger;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      const config = Config.getInstance().values;
      const isDev = config.app.nodeEnv === 'development';

      const pinoLogger = pino({
        level: config.logging.level,
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
        ...(isDev
          ? {
              transport: {
                target: 'pino-pretty',
                options: { colorize: true, translateTime: 'SYS:standard', singleLine: false },
              },
            }
          : {}),
        base: { env: config.app.nodeEnv },
      });

      Logger.instance = new Logger(pinoLogger);
    }
    return Logger.instance;
  }

  /** Test-only. */
  public static resetForTesting(): void {
    Logger.instance = null;
  }

  public child(bindings: Record<string, unknown>): PinoLogger {
    return this.pino.child(bindings);
  }

  public async flush(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.pino.flush(() => resolve());
    });
  }
}
