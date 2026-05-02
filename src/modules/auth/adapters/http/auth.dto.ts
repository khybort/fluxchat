import { z } from 'zod';

import { AUTH } from '../../../../shared/constants.js';

export const RegisterBodySchema = z.object({
  email: z.string().email().max(AUTH.EMAIL_MAX_LENGTH),
  password: z.string().min(AUTH.PASSWORD_MIN_LENGTH).max(AUTH.PASSWORD_MAX_LENGTH),
  name: z.string().min(1).max(AUTH.NAME_MAX_LENGTH).optional(),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email().max(AUTH.EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(AUTH.PASSWORD_MAX_LENGTH),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;
