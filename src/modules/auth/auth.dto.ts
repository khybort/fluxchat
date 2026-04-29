import { z } from 'zod';

export const RegisterBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100).optional(),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(100),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;
