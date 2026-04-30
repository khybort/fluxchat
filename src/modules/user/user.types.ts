export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/** Internal type — leaves the auth/user module only via deliberate read paths. */
export interface UserWithCredentials extends User {
  passwordHash: string;
}
