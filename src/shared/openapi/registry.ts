import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import './zod.js';

/**
 * Single registry shared across all module-level `*.openapi.ts` files.
 * Each module imports this singleton, registers its schemas + paths, and
 * `build-spec.ts` reads from it to assemble the final OpenAPI document.
 */
export const openApiRegistry = new OpenAPIRegistry();
