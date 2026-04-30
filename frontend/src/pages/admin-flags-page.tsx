import { motion } from 'framer-motion';
import { ArrowsClockwiseIcon, FlagIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { clearAdminFlag, listAdminFlags, reloadAdminFlags, updateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type {
  AdminFlagsResponse,
  FlagDefinition,
  FlagName,
  FeatureFlagsSnapshot,
} from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth-store';

import { FlagEditor } from './admin/flag-editor';

const FLAG_NAMES: FlagName[] = [
  'STREAMING_ENABLED',
  'PAGINATION_LIMIT',
  'AI_TOOLS_ENABLED',
  'CHAT_HISTORY_ENABLED',
  'RATE_LIMIT_PER_MINUTE',
  'COMPLETION_ENABLED',
];

export const AdminFlagsPage = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const [data, setData] = useState<AdminFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [editing, setEditing] = useState<FlagName | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await listAdminFlags(token);
      setData(response);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load flags';
      toast.error(message);
    }
  }, [token]);

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
      setData(response);
      toast.success(`${name} updated`);
      setEditing(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Save failed';
      toast.error(message);
    }
  };

  const handleClear = async (name: FlagName): Promise<void> => {
    if (!window.confirm(`Clear override for ${name}? Falls back to file/env default.`)) return;
    try {
      const response = await clearAdminFlag(token, name);
      setData(response);
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
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <FlagIcon className="h-4 w-4" weight="bold" />
                </span>
                <h1 className="text-xl font-semibold tracking-tight">Feature flags</h1>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Edits persist in the database and apply on the next request — no redeploy. The bare
                value falls back to the FEATURE_FLAGS_FILE / env default when you clear an override.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleReload()}
              disabled={reloading}
            >
              <ArrowsClockwiseIcon
                className={reloading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                weight="bold"
              />
              Reload
            </Button>
          </div>

          {loading || !data ? (
            <FlagListSkeleton />
          ) : (
            <ul className="space-y-3">
              {FLAG_NAMES.map((name) => {
                const definition = data.definitions[name];
                const liveValue = data.snapshot[name];
                return (
                  <li
                    key={name}
                    className="rounded-md border bg-card p-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-semibold">{name}</code>
                          <FlagSummary definition={definition} liveValue={liveValue} />
                        </div>
                        <FlagPreview definition={definition} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(name)}>
                          <PencilSimpleIcon className="h-3.5 w-3.5" weight="bold" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleClear(name)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <TrashIcon className="h-3.5 w-3.5" weight="bold" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </div>

      {editing && data ? (
        <FlagEditor
          name={editing}
          initial={data.definitions[editing]}
          onClose={() => setEditing(null)}
          onSave={(definition) => handleSave(editing, definition)}
        />
      ) : null}
    </ScrollArea>
  );
};

const FlagListSkeleton = (): React.JSX.Element => (
  <ul className="space-y-3">
    {Array.from({ length: 6 }).map((_, idx) => (
      <li key={idx} className="rounded-md border bg-card p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </li>
    ))}
  </ul>
);

const FlagSummary = ({
  definition,
  liveValue,
}: {
  definition: FlagDefinition;
  liveValue: FeatureFlagsSnapshot[FlagName];
}): React.JSX.Element => (
  <div className="flex items-center gap-1.5 text-xs">
    <Badge variant="secondary" className="font-mono">
      live: {String(liveValue)}
    </Badge>
    {definition.rules && definition.rules.length > 0 ? (
      <Badge variant="outline">{definition.rules.length} rule(s)</Badge>
    ) : null}
    {typeof definition.percentage === 'number' ? (
      <Badge variant="outline">{definition.percentage}% rollout</Badge>
    ) : null}
  </div>
);

const FlagPreview = ({ definition }: { definition: FlagDefinition }): React.JSX.Element => (
  <p className="mt-1 truncate text-xs text-muted-foreground">
    default <code className="font-mono">{String(definition.default)}</code>
    {definition.rules && definition.rules.length > 0
      ? ` · rules: ${definition.rules.map((r) => keysOf(r.if).join('+') || '*').join(', ')}`
      : ''}
  </p>
);

const keysOf = (obj: object): string[] => Object.keys(obj);
