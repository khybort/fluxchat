/**
 * Side-effect import that augments zod with `.openapi()` chainable metadata.
 *
 * MUST be imported BEFORE any module-specific `*.openapi.ts` file references
 * `.openapi(...)` on a zod schema. The bootstrap path (src/app.ts) imports this
 * first; modules then `import './zod.js'` defensively at the top of their
 * registration files in case they are loaded standalone (e.g. from tests).
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
