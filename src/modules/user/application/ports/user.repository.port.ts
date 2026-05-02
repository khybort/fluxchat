import type { User, UserRole, UserWithCredentials } from '../../domain/user.types.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string | null;
}

export interface ListUsersParams {
  cursor: string | undefined;
  limit: number;
  /** Case-insensitive substring filter on email or name. Empty/undefined disables filtering. */
  q?: string | undefined;
}

/**
 * Port that the application layer needs from persistence to read/write users.
 * Implementation in {@link ../../adapters/persistence/user.prisma.repository.ts}.
 *
 * `findCredentialsByEmail` is the only path that returns the password hash —
 * use it ONLY in the auth module's login use case to verify credentials. Never
 * forward `UserWithCredentials` over the wire.
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findCredentialsByEmail(email: string): Promise<UserWithCredentials | null>;
  /**
   * Cursor-paginated user list, newest first. Over-fetches by 1 so the caller
   * can detect `hasMore`. Used by the admin UI for per-user flag overrides.
   */
  findAll(params: ListUsersParams): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  /**
   * Hard-delete by id. The Chat → User FK is `onDelete: Cascade`, so chats +
   * messages are removed in the same transaction. Returns true when a row
   * was deleted, false when the id didn't exist.
   */
  delete(id: string): Promise<boolean>;
  /** Count of users carrying a given role — drives the admin UI's
   *  "don't delete the last admin" safeguard. */
  countByRole(role: UserRole): Promise<number>;
}
