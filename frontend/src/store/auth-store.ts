import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthUser } from '@/api/types';

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (input: { token: string; user: AuthUser }) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

const STORAGE_KEY = 'appnation-chat-auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
