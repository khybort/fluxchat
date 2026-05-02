import { beforeEach, describe, expect, it } from 'vitest';

import { DeleteUserAdminUseCase } from '../../src/modules/admin/application/use-cases/delete-user-admin.use-case.js';
import { ConflictError, NotFoundError } from '../../src/shared/errors/app-error.js';
import { InMemoryUserRepository } from '../helpers/in-memory-user-repository.js';

describe('DeleteUserAdminUseCase', () => {
  let users: InMemoryUserRepository;
  let useCase: DeleteUserAdminUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    useCase = new DeleteUserAdminUseCase(users);
  });

  const promote = (id: string): void => {
    const row = users.rows.find((r) => r.id === id);
    if (row) row.role = 'admin';
  };

  it('deletes a regular user and returns the deleted id', async () => {
    const target = await users.create({ email: 'a@a.com', passwordHash: 'h', name: null });
    const requester = await users.create({ email: 'admin@a.com', passwordHash: 'h', name: null });
    promote(requester.id);

    const result = await useCase.execute({ targetId: target.id, requesterId: requester.id });

    expect(result.deletedId).toBe(target.id);
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]?.id).toBe(requester.id);
  });

  it('refuses to delete the requester themselves with ConflictError', async () => {
    const requester = await users.create({ email: 'admin@a.com', passwordHash: 'h', name: null });
    promote(requester.id);

    await expect(
      useCase.execute({ targetId: requester.id, requesterId: requester.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(users.rows).toHaveLength(1);
  });

  it('throws NotFoundError when the target id does not exist', async () => {
    const requester = await users.create({ email: 'admin@a.com', passwordHash: 'h', name: null });
    promote(requester.id);

    await expect(
      useCase.execute({ targetId: 'ghost', requesterId: requester.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to delete the last admin with ConflictError', async () => {
    const target = await users.create({ email: 'a@a.com', passwordHash: 'h', name: null });
    promote(target.id);
    const requester = await users.create({ email: 'admin@a.com', passwordHash: 'h', name: null });
    promote(requester.id);
    // Now demote requester so target is the only admin left.
    const requesterRow = users.rows.find((r) => r.id === requester.id);
    if (requesterRow) requesterRow.role = 'user';

    // Self-delete check fires first if ids match — give the request a
    // distinct requester id so we land on the last-admin branch.
    await expect(
      useCase.execute({ targetId: target.id, requesterId: requester.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(users.rows).toHaveLength(2);
  });

  it('allows deleting an admin when other admins remain', async () => {
    const targetAdmin = await users.create({ email: 'a@a.com', passwordHash: 'h', name: null });
    promote(targetAdmin.id);
    const requester = await users.create({ email: 'b@a.com', passwordHash: 'h', name: null });
    promote(requester.id);

    const result = await useCase.execute({
      targetId: targetAdmin.id,
      requesterId: requester.id,
    });

    expect(result.deletedId).toBe(targetAdmin.id);
    expect(users.rows.map((r) => r.id)).toEqual([requester.id]);
  });
});
