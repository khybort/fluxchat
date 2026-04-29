/**
 * Vercel serverless entry point.
 *
 * Vercel exposes any file under `api/` as a serverless function. We rewrite
 * every request (`/(.*)`) to this single function via `vercel.json` so the
 * Express app handles routing as it does locally.
 *
 * Cold-start cost: ~150–300ms on the Hobby tier. Vercel keeps the function
 * process warm between requests for several minutes, so the singletons
 * (Config, Logger, PrismaService, FeatureFlagService) survive across warm
 * invocations and there's no per-request connect/disconnect cost.
 *
 * SSE streaming works on Vercel Node.js Serverless Functions; the function
 * timeout is set to 60s in `vercel.json` (Hobby max). Longer streams need
 * a long-lived host (Fly.io / Render / Railway) — out of scope for the demo.
 */
import { createApp } from '../src/app.js';
import { buildContainer } from '../src/di/container.js';

const container = buildContainer();
const app = createApp(container);

// Vercel's serverless function loader expects a default export. The project's
// `import/no-default-export` rule is suspended only for this file.
// eslint-disable-next-line import/no-default-export
export default app;
