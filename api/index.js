/**
 * Vercel serverless entry point.
 *
 * Imports the precompiled Express app from `dist/` (produced by `pnpm build`
 * in the install command) so Vercel doesn't have to run our TypeScript
 * compiler with its own tsconfig — keeping the runtime predictable and
 * matching what the local build artifact looks like exactly.
 *
 * Vercel rewrites `/(.*)` to this single function via `vercel.json`, so all
 * routing happens inside Express. The PrismaService singleton survives across
 * warm invocations; cold starts pay one DB connect.
 */
import { createApp } from '../dist/app.js';
import { buildContainer } from '../dist/di/container.js';

const container = buildContainer();
// Cold start must reflect DB overrides; otherwise admin-UI edits stay invisible
// until the lambda happens to handle the admin save itself. Top-level await is
// fine in Vercel's ESM runtime and the SELECT is cheap (<10 rows).
await container.flags.reload();
const app = createApp(container);

export default app;
