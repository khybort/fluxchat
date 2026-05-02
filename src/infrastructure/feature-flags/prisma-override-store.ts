import type { Prisma } from '@prisma/client';

import type { IFlagOverrideStore } from '../../shared/feature-flags/override-store.js';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * Prisma-backed implementation of {@link IFlagOverrideStore}. Reads/writes
 * the `feature_flag_overrides` table. Keeps the service layer DB-agnostic
 * — FeatureFlagService talks only to the interface.
 */
export class PrismaFlagOverrideStore implements IFlagOverrideStore {
  constructor(private readonly prisma: PrismaService) {}

  public async loadAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.client.featureFlagOverride.findMany();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.name] = row.definition;
    }
    return out;
  }

  public async upsert(name: string, definition: unknown, updatedBy: string): Promise<void> {
    await this.prisma.client.featureFlagOverride.upsert({
      where: { name },
      create: {
        name,
        definition: definition as Prisma.InputJsonValue,
        updatedBy,
      },
      update: {
        definition: definition as Prisma.InputJsonValue,
        updatedBy,
      },
    });
  }

  public async remove(name: string): Promise<void> {
    await this.prisma.client.featureFlagOverride.deleteMany({ where: { name } });
  }

  public async removeAll(): Promise<void> {
    await this.prisma.client.featureFlagOverride.deleteMany({});
  }
}
