import { type Env, EnvSchema } from './env.schema.js';

export interface AppConfig {
  app: {
    nodeEnv: 'development' | 'test' | 'production';
    port: number;
    corsOrigins: string[];
    appCheckToken: string;
    adminToken: string | undefined;
    docsEnabled: boolean;
  };
  database: {
    url: string;
  };
  redisUrl: string | undefined;
  auth: {
    jwtSecret: string;
  };
  ai: {
    anthropicApiKey: string | undefined;
    anthropicModel: string;
    groqApiKey: string | undefined;
    groqModel: string;
    groqBaseUrl: string;
    openAiApiKey: string | undefined;
    openAiModel: string;
  };
  logging: {
    level: Env['LOG_LEVEL'];
  };
  featureFlagsFile: string | undefined;
}

const buildConfig = (env: Env): AppConfig => ({
  app: {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appCheckToken: env.APP_CHECK_TOKEN,
    adminToken: env.ADMIN_TOKEN,
    docsEnabled: env.DOCS_ENABLED,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redisUrl: env.REDIS_URL,
  auth: {
    jwtSecret: env.JWT_SECRET,
  },
  ai: {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
    groqBaseUrl: env.GROQ_BASE_URL,
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  featureFlagsFile: env.FEATURE_FLAGS_FILE,
});

export class Config {
  private static instance: Config | null = null;
  public readonly values: AppConfig;

  private constructor(values: AppConfig) {
    this.values = values;
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      const parsed = EnvSchema.safeParse(process.env);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
      }
      Config.instance = new Config(buildConfig(parsed.data));
    }
    return Config.instance;
  }

  /** Test-only. Do not call from production code. */
  public static resetForTesting(): void {
    Config.instance = null;
  }
}
