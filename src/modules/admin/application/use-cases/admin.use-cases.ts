import type { ClearFeatureFlagInput } from './clear-feature-flag.use-case.js';
import type { DeleteUserAdminInput, DeleteUserAdminOutput } from './delete-user-admin.use-case.js';
import type {
  EvaluateFeatureFlagInput,
  EvaluateFeatureFlagOutput,
} from './evaluate-feature-flag.use-case.js';
import type { ListFeatureFlagsOutput } from './list-feature-flags.use-case.js';
import type { ListUsersAdminInput } from './list-users-admin.use-case.js';
import type { ReloadFeatureFlagsOutput } from './reload-feature-flags.use-case.js';
import type { UpdateFeatureFlagInput } from './update-feature-flag.use-case.js';
import type { PageResult } from '../../../../shared/types/pagination.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';
import type { User } from '../../../user/domain/user.types.js';

/**
 * Use case bag for the admin module. Mirrors the chat + auth pattern — one
 * `IUseCase` per admin endpoint, controller binds to this interface.
 */
export interface AdminUseCases {
  listFlags: IUseCase<void, ListFeatureFlagsOutput>;
  updateFlag: IUseCase<UpdateFeatureFlagInput, ListFeatureFlagsOutput>;
  clearFlag: IUseCase<ClearFeatureFlagInput, ListFeatureFlagsOutput>;
  clearAllFlags: IUseCase<void, ListFeatureFlagsOutput>;
  reloadFlags: IUseCase<void, ReloadFeatureFlagsOutput>;
  evaluateFlag: IUseCase<EvaluateFeatureFlagInput, EvaluateFeatureFlagOutput>;
  listUsers: IUseCase<ListUsersAdminInput, PageResult<User>>;
  deleteUser: IUseCase<DeleteUserAdminInput, DeleteUserAdminOutput>;
}
