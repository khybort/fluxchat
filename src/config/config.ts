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
  featureFlagDefaults: {
    STREAMING_ENABLED: boolean;
    PAGINATION_LIMIT: number;
    AI_TOOLS_ENABLED: boolean;
    CHAT_HISTORY_ENABLED: boolean;
    RATE_LIMIT_PER_MINUTE: number;
    COMPLETION_ENABLED: boolean;
    TOOL_CALCULATOR_ENABLED: boolean;
    TOOL_CURRENT_TIME_ENABLED: boolean;
    TOOL_CURRENT_WEATHER_ENABLED: boolean;
    TOOL_CONVERT_CURRENCY_ENABLED: boolean;
    TOOL_SEARCH_WEB_ENABLED: boolean;
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
  featureFlagDefaults: {
    STREAMING_ENABLED: env.STREAMING_ENABLED,
    PAGINATION_LIMIT: env.PAGINATION_LIMIT,
    AI_TOOLS_ENABLED: env.AI_TOOLS_ENABLED,
    CHAT_HISTORY_ENABLED: env.CHAT_HISTORY_ENABLED,
    RATE_LIMIT_PER_MINUTE: env.RATE_LIMIT_PER_MINUTE,
    COMPLETION_ENABLED: env.COMPLETION_ENABLED,
    TOOL_CALCULATOR_ENABLED: env.TOOL_CALCULATOR_ENABLED,
    TOOL_CURRENT_TIME_ENABLED: env.TOOL_CURRENT_TIME_ENABLED,
    TOOL_CURRENT_WEATHER_ENABLED: env.TOOL_CURRENT_WEATHER_ENABLED,
    TOOL_CONVERT_CURRENCY_ENABLED: env.TOOL_CONVERT_CURRENCY_ENABLED,
    TOOL_SEARCH_WEB_ENABLED: env.TOOL_SEARCH_WEB_ENABLED,
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
