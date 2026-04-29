import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

import { openApiRegistry } from './registry.js';
import { Config } from '../../config/config.js';

export type OpenApiSpec = ReturnType<OpenApiGeneratorV31['generateDocument']>;

interface BuildSpecOptions {
  /** Override servers list. Defaults to `http://localhost:<port>`. */
  servers?: OpenApiSpec['servers'];
}

/**
 * Renders the OpenAPI 3.1 document from everything registered in `openApiRegistry`.
 * Called once at app boot (cheap — pure schema traversal, no I/O) and the result
 * is served from memory by `docs.middleware.ts`.
 */
export const buildOpenApiSpec = (options: BuildSpecOptions = {}): OpenApiSpec => {
  const config = Config.getInstance().values;
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);

  const servers = options.servers ?? [
    { url: `http://localhost:${config.app.port}`, description: 'Local development' },
  ];

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'AppNation Chat API',
      version: '0.1.0',
      description: [
        'AI-powered chat backend with runtime feature flagging.',
        '',
        '**Auth:** all chat endpoints require a JWT (Bearer) plus the App Check header. Public auth endpoints (`/register`, `/login`) drop the Bearer requirement but still require App Check.',
        '',
        '**Streaming:** the completion endpoint returns either `application/json` or `text/event-stream` depending on the runtime `STREAMING_ENABLED` flag — `/healthz` exposes the live snapshot.',
        '',
        '**Errors:** every non-2xx response shares the `ErrorResponse` envelope `{ error: { code, message, details? }, requestId }`.',
      ].join('\n'),
    },
    servers,
    tags: [
      { name: 'Auth', description: 'Registration, login, current user.' },
      { name: 'Chat', description: 'Chats, message history, AI completion (SSE or JSON).' },
      { name: 'System', description: 'Health and feature-flag introspection.' },
    ],
  });
};
