import type { AuthResult, AuthUserView } from './auth.types.js';
import type { GetCurrentUserFlagsOutput } from './get-current-user-flags.use-case.js';
import type { GetCurrentUserInput } from './get-current-user.use-case.js';
import type { LoginUserInput } from './login-user.use-case.js';
import type { RegisterUserInput } from './register-user.use-case.js';
import type { FlagContext } from '../../../../shared/feature-flags/feature-flag.types.js';
import type { IUseCase } from '../../../../shared/use-case/use-case.interface.js';

/**
 * Use case bag for the auth module. Each entry is a single-method `IUseCase`
 * the controller delegates to — controller depends on the bag interface, not
 * on any concrete implementation. Composition root assembles this in `wireApp`.
 */
export interface AuthUseCases {
  register: IUseCase<RegisterUserInput, AuthResult>;
  login: IUseCase<LoginUserInput, AuthResult>;
  getCurrentUser: IUseCase<GetCurrentUserInput, AuthUserView>;
  getCurrentUserFlags: IUseCase<FlagContext, GetCurrentUserFlagsOutput>;
}
