import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listAdminFlags, updateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type {
  AdminUser,
  FeatureFlagsSnapshot,
  FlagDefinition,
  FlagName,
  FlagRule,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

interface Props {
  user: AdminUser;
  onClose: () => void;
}

const NUMERIC_FLAGS: ReadonlyArray<FlagName> = ['PAGINATION_LIMIT', 'RATE_LIMIT_PER_MINUTE'];

const FLAG_LIST: ReadonlyArray<FlagName> = [
  'STREAMING_ENABLED',
  'AI_TOOLS_ENABLED',
  'CHAT_HISTORY_ENABLED',
  'PAGINATION_LIMIT',
  'RATE_LIMIT_PER_MINUTE',
  'COMPLETION_ENABLED',
  'TOOL_CALCULATOR_ENABLED',
  'TOOL_CURRENT_TIME_ENABLED',
  'TOOL_CURRENT_WEATHER_ENABLED',
  'TOOL_CONVERT_CURRENCY_ENABLED',
  'TOOL_SEARCH_WEB_ENABLED',
];

interface OverrideRow {
  /** True when this user has an explicit per-user rule for this flag. */
  enabled: boolean;
  /** The override value (only meaningful when `enabled`). */
  value: boolean | number;
  /** Original snapshot for diffing on save. */
  initial: { enabled: boolean; value: boolean | number };
}

/**
 * Find the user-specific rule (matches userId AND nothing else) inside a
 * flag definition. Returns its index + rule, or null if absent.
 */
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

/**
 * Apply an override edit to a definition, returning a new definition.
 * - enabled true → upsert a `{ if: { userId }, value }` rule (preserving order).
 * - enabled false → drop any existing user-specific rule.
 */
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
    if (found) {
      rules[found.index] = newRule;
    } else {
      rules.unshift(newRule);
    }
  } else if (found) {
    rules.splice(found.index, 1);
  }
  const next: FlagDefinition = { default: definition.default };
  if (rules.length > 0) next.rules = rules;
  if (typeof definition.percentage === 'number') next.percentage = definition.percentage;
  return next;
};

export const UserFlagOverridesDialog = ({ user, onClose }: Props): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const setFlags = useFlagsStore((s) => s.setFlags);

  const [definitions, setDefinitions] = useState<Record<FlagName, FlagDefinition> | null>(null);
  const [overrides, setOverrides] = useState<Record<FlagName, OverrideRow> | null>(null);
  const [saving, setSaving] = useState(false);

  // Load current flag definitions, derive the user-specific override view.
  useEffect(() => {
    let cancelled = false;
    listAdminFlags(token)
      .then((res) => {
        if (cancelled) return;
        setDefinitions(res.definitions);
        const next = {} as Record<FlagName, OverrideRow>;
        for (const flag of FLAG_LIST) {
          const definition = res.definitions[flag];
          const found = findUserRule(definition, user.id);
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
  }, [token, user.id]);

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

  const handleToggle = (flag: FlagName, enabled: boolean): void => {
    setOverrides((prev) => (prev ? { ...prev, [flag]: { ...prev[flag], enabled } } : prev));
  };

  const handleValueChange = (flag: FlagName, value: boolean | number): void => {
    setOverrides((prev) => (prev ? { ...prev, [flag]: { ...prev[flag], value } } : prev));
  };

  const handleSave = async (): Promise<void> => {
    if (!definitions || !overrides || dirtyFlags.length === 0) return;
    setSaving(true);
    try {
      // Sequential PATCHes — each returns a fresh full snapshot. We mirror the
      // last one into the global flags store so the chat sidebar reflects edits.
      let latestSnapshot: FeatureFlagsSnapshot | null = null;
      for (const flag of dirtyFlags) {
        const row = overrides[flag];
        const next = applyOverride(definitions[flag], user.id, row.enabled, row.value);
        const res = await updateAdminFlag(token, flag, next);
        latestSnapshot = res.snapshot;
      }
      if (latestSnapshot) setFlags(latestSnapshot);
      toast.success(
        `Updated ${dirtyFlags.length} override${dirtyFlags.length === 1 ? '' : 's'} for ${user.email}`,
      );
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Save failed';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-base">Per-user flag overrides</DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-mono">{user.email}</span> · role{' '}
            <span className="font-mono">{user.role}</span>. Toggle a flag to add or remove a rule
            scoped to this user. Other users are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!overrides || !definitions ? (
            <ul className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <li key={idx} className="rounded-md border bg-card p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {FLAG_LIST.map((flag) => {
                const row = overrides[flag];
                const definition = definitions[flag];
                const isNumeric = NUMERIC_FLAGS.includes(flag);
                return (
                  <li
                    key={flag}
                    className={cn(
                      'rounded-md border bg-card p-3 transition-colors',
                      row.enabled ? 'border-primary/40 bg-primary/[0.04]' : '',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.enabled}
                        onClick={() => handleToggle(flag, !row.enabled)}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full border transition-colors',
                          row.enabled ? 'border-primary bg-primary' : 'border-input bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform',
                            row.enabled ? 'translate-x-5' : 'translate-x-0.5',
                          )}
                        />
                        <span className="sr-only">
                          {row.enabled ? 'override enabled' : 'override disabled'}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <code className="text-sm font-semibold">{flag}</code>
                        <p className="text-xs text-muted-foreground">
                          base default:{' '}
                          <span className="font-mono">{String(definition.default)}</span>
                        </p>
                      </div>
                      <div className="w-28">
                        {isNumeric ? (
                          <Input
                            type="number"
                            value={typeof row.value === 'number' ? row.value : 0}
                            onChange={(e) => handleValueChange(flag, Number(e.target.value))}
                            disabled={!row.enabled}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <ValueToggle
                            value={Boolean(row.value)}
                            disabled={!row.enabled}
                            onChange={(v) => handleValueChange(flag, v)}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {dirtyFlags.length === 0
              ? 'No changes'
              : `${dirtyFlags.length} flag${dirtyFlags.length === 1 ? '' : 's'} pending`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || dirtyFlags.length === 0 || !overrides}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ValueToggle = ({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    disabled={disabled}
    onClick={() => onChange(!value)}
    className={cn(
      'inline-flex h-8 w-full items-center justify-center rounded-md border font-mono text-xs transition-colors',
      disabled
        ? 'cursor-not-allowed border-dashed bg-muted/30 text-muted-foreground'
        : value
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-muted hover:bg-accent',
    )}
  >
    {value ? 'true' : 'false'}
  </button>
);
