import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  clearAdminFlag,
  clearAllAdminFlags,
  listAdminFlags,
  reloadAdminFlags,
  updateAdminFlag,
} from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminFlagsResponse, FlagDefinition, FlagName } from '@/api/types';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

interface AdminFlagsState {
  data: AdminFlagsResponse | null;
  loading: boolean;
  reloading: boolean;
  /** Non-null when the initial load failed; powers the page's ErrorCard. */
  error: string | null;
  save: (name: FlagName, definition: FlagDefinition) => Promise<void>;
  clear: (name: FlagName) => Promise<void>;
  clearAll: () => Promise<void>;
  reload: () => Promise<void>;
  /** Re-runs the initial fetch — wired into the page's retry button. */
  retry: () => Promise<void>;
}

export const useAdminFlags = (): AdminFlagsState => {
  const token = useAuthStore((s) => s.token) ?? '';
  // Mirror every successful response into the global flags store so the
  // sidebar's "Runtime feature flags" panel + chat page reflect edits
  // immediately — no hard refresh, no /healthz round-trip needed.
  const setFlags = useFlagsStore((s) => s.setFlags);
  const [data, setData] = useState<AdminFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback(
    (response: AdminFlagsResponse) => {
      setData(response);
      setError(null);
      setFlags(response.snapshot);
    },
    [setFlags],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await listAdminFlags(token);
      applyResponse(response);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to load flags';
      // Set inline error so the page can render an ErrorCard with Retry —
      // toast alone left the user staring at an indefinite skeleton.
      setError(message);
    }
  }, [applyResponse, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const save = async (name: FlagName, definition: FlagDefinition): Promise<void> => {
    try {
      const response = await updateAdminFlag(token, name, definition);
      applyResponse(response);
      toast.success(`${name} updated`);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Save failed';
      toast.error(message);
    }
  };

  const clear = async (name: FlagName): Promise<void> => {
    try {
      const response = await clearAdminFlag(token, name);
      applyResponse(response);
      toast.success(`${name} override cleared`);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Clear failed';
      toast.error(message);
    }
  };

  const clearAll = async (): Promise<void> => {
    try {
      const response = await clearAllAdminFlags(token);
      applyResponse(response);
      toast.success('All flag overrides cleared');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Clear all failed';
      toast.error(message);
    }
  };

  const reload = async (): Promise<void> => {
    setReloading(true);
    try {
      await reloadAdminFlags(token);
      await refresh();
      toast.success('Reloaded from sources');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Reload failed';
      toast.error(message);
    } finally {
      setReloading(false);
    }
  };

  const retry = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return { data, loading, reloading, error, save, clear, clearAll, reload, retry };
};
