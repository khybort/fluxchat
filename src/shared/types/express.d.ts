import type { Logger as PinoLogger } from 'pino';

import type { ClientType } from '../constants.js';

export interface AuthUser {
  id: string;
  email: string;
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
