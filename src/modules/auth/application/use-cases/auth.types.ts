/**
 * Application-layer view types shared across the auth use cases. Not entities
 * (those live in the user module's domain) — these are the orchestration
 * shapes the use cases produce and the controller forwards as JSON.
 */
export interface AuthUserView {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export interface AuthResult {
  token: string;
  user: AuthUserView;
  expiresInSeconds: number;
}
