import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listAdminFlags, updateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { FlagDefinition, FlagName, FlagRule } from '@/api/types';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

import { FLAG_LIST } from '../flag-meta';
import type { OverrideRow } from '../user-flag-overrides-row';

const findUserRule = (
  definition: FlagDefinition,
  userId: string,
): { index: number; rule: FlagRule } | null => {
  const rules = definition.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    const keys = Object.keys(rule.if);
    if (keys.length === 1 && rule.if.userId === userId) {
      return { index: i, rule };
    }
  }
  return null;
};

const applyOverride = (
  definition: FlagDefinition,
  userId: string,
  enabled: boolean,
  value: boolean | number,
): FlagDefinition => {
  const rules = [...(definition.rules ?? [])];
  const found = findUserRule(definition, userId);
  if (enabled) {
    const newRule: FlagRule = { if: { userId }, value };
    if (found) rules[found.index] = newRule;
    else rules.unshift(newRule);
  } else if (found) {
    rules.splice(found.index, 1);
  }
  const next: FlagDefinition = { default: definition.default };
  if (rules.length > 0) next.rules = rules;
  if (typeof definition.percentage === 'number') next.percentage = definition.percentage;
  return next;
};

interface UseUserOverridesOptions {
  userId: string;
  userEmail: string;
  onSaved: () => void;
}

interface UseUserOverrides {
  definitions: Record<FlagName, FlagDefinition> | null;
  overrides: Record<FlagName, OverrideRow> | null;
  saving: boolean;
  dirtyFlags: FlagName[];
  setRow: (flag: FlagName, partial: { enabled?: boolean; value?: boolean | number }) => void;
  save: () => Promise<void>;
}

export const useUserOverrides = ({
  userId,
  userEmail,
  onSaved,
}: UseUserOverridesOptions): UseUserOverrides => {
  const token = useAuthStore((s) => s.token) ?? '';
  // Re-fetch the global flag store via /api/auth/me/flags after a save
  // so the sidebar reflects per-user evaluated values. Pushing the
  // admin endpoint's context-free `snapshot` here was incorrect — it
  // would erase admin role rule effects from the current user's view.
  const refreshGlobalFlags = useFlagsStore((s) => s.refresh);

  const [definitions, setDefinitions] = useState<Record<FlagName, FlagDefinition> | null>(null);
  const [overrides, setOverrides] = useState<Record<FlagName, OverrideRow> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAdminFlags(token)
      .then((res) => {
        if (cancelled) return;
        setDefinitions(res.definitions);
        const next = {} as Record<FlagName, OverrideRow>;
        for (const flag of FLAG_LIST) {
          const definition = res.definitions[flag];
          const found = findUserRule(definition, userId);
          const enabled = Boolean(found);
          const value = found?.rule.value ?? definition.default;
          next[flag] = { enabled, value, initial: { enabled, value } };
        }
        setOverrides(next);
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Failed to load flags';
        toast.error(message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  const dirtyFlags = useMemo(() => {
    if (!overrides) return [] as FlagName[];
    const out: FlagName[] = [];
    for (const flag of FLAG_LIST) {
      const row = overrides[flag];
      if (row.enabled !== row.initial.enabled || (row.enabled && row.value !== row.initial.value)) {
        out.push(flag);
      }
    }
    return out;
  }, [overrides]);

  const setRow = (
    flag: FlagName,
    partial: { enabled?: boolean; value?: boolean | number },
  ): void => {
    setOverrides((prev) => {
      if (!prev) return prev;
      return { ...prev, [flag]: { ...prev[flag], ...partial } };
    });
  };

  const save = async (): Promise<void> => {
    if (!definitions || !overrides || dirtyFlags.length === 0) return;
    setSaving(true);
    try {
      for (const flag of dirtyFlags) {
        const row = overrides[flag];
        const next = applyOverride(definitions[flag], userId, row.enabled, row.value);
        await updateAdminFlag(token, flag, next);
      }
      // Pull the per-user evaluated snapshot — admin's own role rules
      // may interact with the override they just edited (e.g. they
      // toggled a flag for someone else, but their own admin-rule
      // value should still hold).
      await refreshGlobalFlags();
      toast.success(
        `Updated ${dirtyFlags.length} override${dirtyFlags.length === 1 ? '' : 's'} for ${userEmail}`,
      );
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return { definitions, overrides, saving, dirtyFlags, setRow, save };
};
