import { create } from 'zustand';

import { getHealthz } from '@/api/chat';
import type { FeatureFlagsSnapshot } from '@/api/types';

interface FlagsState {
  flags: FeatureFlagsSnapshot | null;
  /** Last successful refresh, used for staleness checks. */
  fetchedAt: number | null;
  /** Set the flag snapshot directly — admin save responses use this so the
   *  whole app sees the new values without a network round trip. */
  setFlags: (flags: FeatureFlagsSnapshot) => void;
  /** Pull the latest snapshot from /healthz. Idempotent + safe to call from
   *  multiple subscribers; in-flight calls de-dupe via the module-level
   *  promise below. */
  refresh: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useFlagsStore = create<FlagsState>((set) => ({
  flags: null,
  fetchedAt: null,
  setFlags: (flags) => set({ flags, fetchedAt: Date.now() }),
  refresh: () => {
    if (inflight) return inflight;
    inflight = getHealthz()
      .then((res) => {
        set({ flags: res.flags, fetchedAt: Date.now() });
      })
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));
