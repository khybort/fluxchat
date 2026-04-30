import type { Logger as PinoLogger } from 'pino';

import type { ClientType } from '../constants.js';

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: PinoLogger;
      user?: AuthUser;
      clientType: ClientType;
    }
  }
}

export {};
