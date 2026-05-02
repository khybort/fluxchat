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
  // After every admin write/read, re-fetch the GLOBAL flag store via
  // /api/auth/me/flags so the sidebar's "Runtime feature flags" panel
  // shows the **per-user evaluated** values — not the admin endpoint's
  // context-free `snapshot`, which ignores rules and would for example
  // show AI_TOOLS_ENABLED=OFF for an admin even though the baked-in
  // userRole rule resolves it to ON for them. Refresh is in-flight
  // de-duped so back-to-back admin actions don't fan out to N requests.
  const refreshGlobalFlags = useFlagsStore((s) => s.refresh);
  const [data, setData] = useState<AdminFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback(
    (response: AdminFlagsResponse) => {
      setData(response);
      setError(null);
      void refreshGlobalFlags();
    },
    [refreshGlobalFlags],
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
