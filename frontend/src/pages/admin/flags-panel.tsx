import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { clearAdminFlag, listAdminFlags, reloadAdminFlags, updateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminFlagsResponse, FlagDefinition, FlagName } from '@/api/types';
import { FlagListSkeleton } from '@/components/admin/flag-list-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

import { FlagEditor } from './flag-editor';
import type { FlagDescriptor } from './flag-meta';
import { AI_TOOLS_MASTER, FLAG_GROUPS, MASTER_OFF_BADGE, TOOL_FLAGS } from './flag-meta';
import { MaterialIcon } from '@/components/ui/material-icon';

export const FlagsPanel = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  // Mirror every successful response into the global flags store so the
  // sidebar's "Runtime feature flags" panel + chat page reflect edits
  // immediately — no hard refresh, no /healthz round-trip needed.
  const setFlags = useFlagsStore((s) => s.setFlags);
  const [data, setData] = useState<AdminFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [editing, setEditing] = useState<FlagName | null>(null);
  const [confirmClear, setConfirmClear] = useState<FlagName | null>(null);

  const applyResponse = useCallback(
    (response: AdminFlagsResponse) => {
      setData(response);
      setFlags(response.snapshot);
    },
    [setFlags],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await listAdminFlags(token);
      applyResponse(response);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load flags';
      toast.error(message);
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

  const handleSave = async (name: FlagName, definition: FlagDefinition): Promise<void> => {
    try {
      const response = await updateAdminFlag(token, name, definition);
      applyResponse(response);
      toast.success(`${name} updated`);
      setEditing(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Save failed';
      toast.error(message);
    }
  };

  const handleClear = async (name: FlagName): Promise<void> => {
    try {
      const response = await clearAdminFlag(token, name);
      applyResponse(response);
      toast.success(`${name} override cleared`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Clear failed';
      toast.error(message);
    }
  };

  const handleReload = async (): Promise<void> => {
    setReloading(true);
    try {
      await reloadAdminFlags(token);
      await refresh();
      toast.success('Reloaded from sources');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Reload failed';
      toast.error(message);
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleReload()}
          disabled={reloading}
        >
          <MaterialIcon name="refresh" className={reloading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Reload
        </Button>
      </div>

      {loading || !data ? (
        <FlagListSkeleton />
      ) : (
        <div className="space-y-8">
          {FLAG_GROUPS.map((group) => {
            const masterOff = data.definitions[AI_TOOLS_MASTER].default === false;
            const groupHasToolFlags = group.flags.some((f) => TOOL_FLAGS.has(f.name));
            return (
              <section key={group.title} className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h2>
                    {groupHasToolFlags && masterOff ? (
                      <span className="rounded-full border border-dashed bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {MASTER_OFF_BADGE}
                      </span>
                    ) : null}
                  </div>
                  {group.hint ? (
                    <p className="mt-1 text-xs text-muted-foreground/80">{group.hint}</p>
                  ) : null}
                </div>
                <ul className="space-y-3">
                  {group.flags.map((flag) => (
                    <FlagRow
                      key={flag.name}
                      descriptor={flag}
                      data={data}
                      disabled={masterOff && TOOL_FLAGS.has(flag.name)}
                      onEdit={() => setEditing(flag.name)}
                      onClear={() => setConfirmClear(flag.name)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {editing && data ? (
        <FlagEditor
          name={editing}
          initial={data.definitions[editing]}
          onClose={() => setEditing(null)}
          onSave={(definition) => handleSave(editing, definition)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmClear !== null}
        onOpenChange={(open) => !open && setConfirmClear(null)}
        title={`Clear override for ${confirmClear ?? ''}?`}
        description="The flag falls back to its env or JSON file default. Per-user rules and percentage rollout (if any) are also dropped."
        confirmLabel="Clear"
        tone="destructive"
        icon="delete"
        onConfirm={async () => {
          if (confirmClear) await handleClear(confirmClear);
        }}
      />
    </>
  );
};

const FlagRow = ({
  descriptor,
  data,
  disabled = false,
  onEdit,
  onClear,
}: {
  descriptor: FlagDescriptor;
  data: AdminFlagsResponse;
  disabled?: boolean;
  onEdit: () => void;
  onClear: () => void;
}): React.JSX.Element => {
  const definition = data.definitions[descriptor.name];
  const liveValue = data.snapshot[descriptor.name];

  const customised = useMemo(
    () =>
      Boolean(
        (definition.rules && definition.rules.length > 0) ||
        typeof definition.percentage === 'number',
      ),
    [definition],
  );

  return (
    <li
      className={cn(
        'rounded-lg border bg-card transition-colors hover:bg-accent/30',
        disabled ? 'opacity-60' : '',
      )}
    >
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold">{descriptor.name}</code>
            <LiveValueBadge value={liveValue} />
            {disabled ? (
              <Badge variant="outline" className="border-dashed font-normal text-muted-foreground">
                master OFF
              </Badge>
            ) : null}
            {definition.rules && definition.rules.length > 0 ? (
              <Badge variant="outline" className="font-normal">
                {definition.rules.length} rule{definition.rules.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
            {typeof definition.percentage === 'number' ? (
              <Badge variant="outline" className="font-normal">
                {definition.percentage}% rollout
              </Badge>
            ) : null}
            {customised ? (
              <Badge
                variant="secondary"
                className="border-primary/30 bg-primary/10 font-normal text-primary"
              >
                customised
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{descriptor.blurb}</p>
          <p className="text-xs text-muted-foreground/80">{descriptor.effect}</p>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={disabled}>
            <MaterialIcon name="edit" className="h-3.5 w-3.5" />
            Edit
          </Button>
          {customised && !TOOL_FLAGS.has(descriptor.name) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-error hover:bg-error/10"
              aria-label="Clear override"
            >
              <MaterialIcon name="delete" className="text-base" />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
};

const LiveValueBadge = ({ value }: { value: boolean | number }): React.JSX.Element => {
  if (typeof value === 'boolean') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
          value ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            value ? 'bg-success' : 'bg-muted-foreground/60',
          )}
        />
        {value ? 'on' : 'off'}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
      {value}
    </span>
  );
};
