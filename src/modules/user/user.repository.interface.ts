import type { User, UserWithCredentials } from './user.types.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string | null;
}

export interface ListUsersParams {
  cursor: string | undefined;
  limit: number;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /**
   * Returns the row including the password hash. Use ONLY in the auth module
   * to verify a login. Never expose the credentials object outside auth.
   */
  findCredentialsByEmail(email: string): Promise<UserWithCredentials | null>;
  /**
   * Cursor-paginated user list, newest first. Over-fetches by 1 so the caller
   * can detect `hasMore`. Used by the admin UI for per-user flag overrides.
   */
  findAll(params: ListUsersParams): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
}
