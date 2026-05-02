import type { Express } from 'express';
// swagger-ui-express is CJS-only — default import is required at runtime.
// eslint-disable-next-line import/no-named-as-default
import swaggerUi from 'swagger-ui-express';

import { buildOpenApiSpec } from './build-spec.js';
import type { Logger } from '../../infrastructure/logger/logger.js';
import { NotFoundError } from '../errors/app-error.js';

// swagger-ui-express serves CSS/JS/favicon assets from the `swagger-ui-dist`
// package's filesystem (`express.static(getAbsoluteSwaggerFsPath())`). Vercel's
// serverless bundler only traces JS imports, so those static asset files are
// NOT included in the deployed Lambda — the asset requests fall through to
// the App Check middleware and return 401. Pin the assets to a public CDN
// instead so the page works on serverless without a custom bundler step.
// Pin to the same major version that's resolved in node_modules so prod
// matches local dev behaviour.
const SWAGGER_UI_DIST_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5';

const SWAGGER_UI_OPTIONS: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'AppNation Chat API',
  customCssUrl: `${SWAGGER_UI_DIST_CDN}/swagger-ui.css`,
  customJs: [
    `${SWAGGER_UI_DIST_CDN}/swagger-ui-bundle.js`,
    `${SWAGGER_UI_DIST_CDN}/swagger-ui-standalone-preset.js`,
  ],
  customfavIcon: `${SWAGGER_UI_DIST_CDN}/favicon-32x32.png`,
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
    displayRequestDuration: true,
    tryItOutEnabled: true,
  },
};

export interface MountDocsOptions {
  enabled: boolean;
  logger: Logger;
}

/**
 * Mounts the API documentation surface when `DOCS_ENABLED=true`:
 *   - `GET /docs.json` returns the raw OpenAPI 3.1 document
 *   - `GET /docs` serves Swagger UI rendered against that document
 *
 * When `DOCS_ENABLED=false` we still register handlers for both paths but they
 * deliberately return `404 NOT_FOUND`. This keeps the user-visible behavior
 * unambiguous ("the docs route doesn't exist on this deployment") instead of
 * letting downstream auth middleware reply with a confusing 401.
 *
 * Mount BEFORE `appCheckMiddleware` — Swagger UI must be browsable without a
 * Firebase App Check token. The DOCS_ENABLED flag is the only gate.
 */
export const mountDocs = (app: Express, options: MountDocsOptions): void => {
  if (!options.enabled) {
    options.logger.pino.info('docs_disabled');
    app.use(['/docs', '/docs.json'], (_req, _res, next) => {
      next(new NotFoundError('Documentation is disabled'));
    });
    return;
  }

  const spec = buildOpenApiSpec();

  app.get('/docs.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(spec);
  });

  app.use('/docs', swaggerUi.serveFiles(spec, SWAGGER_UI_OPTIONS));
  app.get('/docs', swaggerUi.setup(spec, SWAGGER_UI_OPTIONS));

  options.logger.pino.info({ paths: Object.keys(spec.paths ?? {}).length }, 'docs_mounted');
};
