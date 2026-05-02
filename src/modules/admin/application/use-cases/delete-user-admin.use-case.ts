import { ConflictError, NotFoundError } from '../../../../shared/errors/app-error.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IUserRepository } from '../../../user/application/ports/user.repository.port.js';

export interface DeleteUserAdminInput {
  /** The user id the admin wants to remove. */
  targetId: string;
  /** The authenticated admin's user id, used to block self-deletion. */
  requesterId: string;
}

export interface DeleteUserAdminOutput {
  deletedId: string;
}

/**
 * Hard-delete a user account from the admin UI. Chats + messages cascade via
 * the schema FK (`onDelete: Cascade`), so this single call cleans up
 * everything they own.
 *
 * Two safeguards keep the system from locking itself out:
 *   1. **Self-delete** — an admin can't remove their own account; the JWT
 *      they're holding would still be valid until expiry but their row
 *      would be gone, leaving the session in a half-broken state.
 *   2. **Last admin** — when the target is the only admin, refuse: there
 *      would be no one left who can grant the role back, and the only way
 *      out would be a direct DB edit.
 */
export class DeleteUserAdminUseCase implements IUseCase<
  DeleteUserAdminInput,
  DeleteUserAdminOutput
> {
  constructor(private readonly users: IUserRepository) {}

  public async execute(input: DeleteUserAdminInput): Promise<DeleteUserAdminOutput> {
    if (input.targetId === input.requesterId) {
      throw new ConflictError('You cannot delete your own account');
    }

    const target = await this.users.findById(input.targetId);
    if (!target) {
      throw new NotFoundError('User not found');
    }

    if (target.role === 'admin') {
      const adminCount = await this.users.countByRole('admin');
      if (adminCount <= 1) {
        throw new ConflictError('Cannot delete the last admin');
      }
    }

    await this.users.delete(input.targetId);
    return { deletedId: input.targetId };
  }
}
