import { create } from 'zustand';

import { getMyFlags } from '@/api/auth';
import { getHealthz } from '@/api/chat';
import type { FeatureFlagsSnapshot } from '@/api/types';

import { useAuthStore } from './auth-store';

interface FlagsState {
  flags: FeatureFlagsSnapshot | null;
  /** Last successful refresh, used for staleness checks. */
  fetchedAt: number | null;
  /** Set the flag snapshot directly — admin save responses use this so the
   *  whole app sees the new values without a network round trip. */
  setFlags: (flags: FeatureFlagsSnapshot) => void;
  /** Pull the latest snapshot. Authenticated callers hit
   *  `/api/auth/me/flags` so per-user rules drive UI gating; otherwise
   *  fall back to `/healthz` (baseline defaults). Idempotent + safe to
   *  call from multiple subscribers; in-flight calls de-dupe. */
  refresh: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

const fetchSnapshot = async (set: (state: Partial<FlagsState>) => void): Promise<void> => {
  const token = useAuthStore.getState().token;
  try {
    if (token) {
      const res = await getMyFlags(token);
      set({ flags: res.flags, fetchedAt: Date.now() });
    } else {
      const res = await getHealthz();
      set({ flags: res.flags, fetchedAt: Date.now() });
    }
  } catch {
    // Best-effort: keep the previous snapshot on failure.
  }
};

export const useFlagsStore = create<FlagsState>((set) => ({
  flags: null,
  fetchedAt: null,
  setFlags: (flags) => set({ flags, fetchedAt: Date.now() }),
  refresh: () => {
    if (inflight) return inflight;
    inflight = fetchSnapshot(set).finally(() => {
      inflight = null;
    });
    return inflight;
  },
}));

// Re-fetch whenever the auth token changes (login, logout, or another tab
// updates persisted storage). Without this, a user who logs in mid-session
// keeps the unauthenticated `/healthz` snapshot and never sees rules that
// target their userId/role.
let lastToken: string | null = useAuthStore.getState().token;
useAuthStore.subscribe((state) => {
  if (state.token === lastToken) return;
  lastToken = state.token;
  void useFlagsStore.getState().refresh();
});
