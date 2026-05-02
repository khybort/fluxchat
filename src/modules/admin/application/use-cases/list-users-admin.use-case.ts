import { PAGINATION } from '../../../../shared/constants.js';
import { buildPagedResult } from '../../../../shared/pagination/cursor.js';
import type { PageResult } from '../../../../shared/types/pagination.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { IUserRepository } from '../../../user/application/ports/user.repository.port.js';
import type { User } from '../../../user/domain/user.types.js';

export interface ListUsersAdminInput {
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * Cursor-paginated user list — feeds the admin UI's per-user flag override
 * picker. Cross-module dependency (admin uses user's IUserRepository port);
 * port import path is explicit so the boundary is visible at the import line.
 */
export class ListUsersAdminUseCase implements IUseCase<ListUsersAdminInput, PageResult<User>> {
  constructor(private readonly users: IUserRepository) {}

  public async execute(input: ListUsersAdminInput): Promise<PageResult<User>> {
    const limit = input.limit ?? PAGINATION.DEFAULT_LIMIT;
    const rows = await this.users.findAll({ cursor: input.cursor, limit });
    return buildPagedResult(rows, limit, (r) => r.id);
  }
}
