import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Boot/wiring and pure types — exercised by smoke tests, not unit tests.
        'src/server.ts',
        'src/di/**',
        'src/**/*.types.ts',
        'src/**/*.dto.ts',
        'src/**/*.openapi*.ts',
        'src/**/*.mapper.ts',
        'src/shared/types/**',
        // Use case bag interfaces are type-only (no runtime).
        'src/modules/**/use-cases/*.use-cases.ts',
        // Port interfaces — type-only contracts owned by the application layer.
        'src/modules/**/application/ports/**',
        // Real Prisma-backed adapters are swapped for InMemory* in tests.
        // The port they implement is exercised; the Prisma adapter is
        // covered by deploy-time smoke tests against a real database.
        'src/modules/**/adapters/persistence/**',
        // Tracing scaffold — gated by env, no-op in tests.
        'src/infrastructure/tracing/**',
      ],
      thresholds: {
        // Global floor — keeps the suite honest while leaving headroom so a
        // single new file can land before a follow-up test catches up.
        lines: 75,
        functions: 85,
        branches: 78,
        statements: 75,
        // Hot-spot enforcement: use cases, strategies, policies and the error
        // handler must stay tightly tested. CLAUDE.md §16 mandates these.
        'src/modules/**/application/use-cases/*.use-case.ts': {
          lines: 85,
          branches: 70,
          functions: 100,
        },
        'src/modules/chat/application/strategies/*.ts': {
          lines: 95,
          branches: 85,
          functions: 100,
        },
        'src/modules/chat/application/policies/*.ts': {
          lines: 90,
          branches: 80,
          functions: 100,
        },
        'src/modules/auth/application/services/*.ts': {
          lines: 90,
          branches: 80,
          functions: 100,
        },
        'src/shared/errors/error-handler.ts': { lines: 80, branches: 70, functions: 75 },
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
