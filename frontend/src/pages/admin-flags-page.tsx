import { motion } from 'framer-motion';
import { ArrowsClockwiseIcon, FlagIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { clearAdminFlag, listAdminFlags, reloadAdminFlags, updateAdminFlag } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminFlagsResponse, FlagDefinition, FlagName } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useFlagsStore } from '@/store/flags-store';

import { FlagEditor } from './admin/flag-editor';

interface FlagDescriptor {
  name: FlagName;
  /** Short, user-facing intent — what the flag actually controls. */
  blurb: string;
  /** Concrete, "if I flip this, here's what changes" caption. */
  effect: string;
}

interface FlagGroup {
  title: string;
  /** Optional caption rendered under the group heading. */
  hint?: string;
  flags: FlagDescriptor[];
}

const FLAG_GROUPS: FlagGroup[] = [
  {
    title: 'Core',
    flags: [
      {
        name: 'STREAMING_ENABLED',
        blurb: 'Stream the AI response token-by-token via SSE.',
        effect: 'Off → response arrives as a single JSON payload, no streaming caret.',
      },
      {
        name: 'AI_TOOLS_ENABLED',
        blurb: 'Master switch for the AI tool catalog.',
        effect: 'Off → no tools are exposed to the model regardless of per-tool flags below.',
      },
      {
        name: 'CHAT_HISTORY_ENABLED',
        blurb: 'Return the full message history (cursor-paginated).',
        effect: 'Off → only the last 10 messages are returned. Useful for mobile / free tier.',
      },
      {
        name: 'PAGINATION_LIMIT',
        blurb: 'Maximum items per page in the chat list and history.',
        effect: 'Numeric ceiling — clamped to [10, 100] when read.',
      },
      {
        name: 'RATE_LIMIT_PER_MINUTE',
        blurb: 'Per-route, per-(user, clientType) request ceiling each minute.',
        effect: 'Lower → 429 hits sooner. Mobile + web sessions track separate buckets.',
      },
      {
        name: 'COMPLETION_ENABLED',
        blurb: 'Kill-switch for the AI completion route.',
        effect:
          'Off → POST /api/chats/:id/completion returns 404 FEATURE_DISABLED. Other routes unaffected.',
      },
    ],
  },
  {
    title: 'AI Tools',
    hint: 'Subordinate to AI_TOOLS_ENABLED — flagged off here means the tool is hidden from the model even when the master switch is on.',
    flags: [
      {
        name: 'TOOL_CALCULATOR_ENABLED',
        blurb: 'Safe arithmetic evaluation (+ - × ÷ and parentheses).',
        effect: "Off → math questions are answered from the model's training, no tool card.",
      },
      {
        name: 'TOOL_CURRENT_TIME_ENABLED',
        blurb: 'IANA-timezone-aware current date + time.',
        effect: 'Off → "what time is it in Tokyo?" answered without tool grounding.',
      },
      {
        name: 'TOOL_CURRENT_WEATHER_ENABLED',
        blurb: 'Mock weather lookup (deterministic — same city, same numbers).',
        effect: 'Off → weather questions answered from training data, often with disclaimers.',
      },
      {
        name: 'TOOL_CONVERT_CURRENCY_ENABLED',
        blurb: 'FX conversion over USD / EUR / TRY / GBP / JPY / CHF / CAD.',
        effect: 'Off → currency conversion answered from stale training-time rates.',
      },
      {
        name: 'TOOL_SEARCH_WEB_ENABLED',
        blurb: 'Real DuckDuckGo Instant Answer search (no API key, 4s timeout).',
        effect: 'Off → no live web grounding, model answers from training data only.',
      },
    ],
  },
];

export const AdminFlagsPage = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  // Mirror every successful response into the global flags store so the
  // sidebar's "Runtime feature flags" panel + chat page reflect edits
  // immediately — no hard refresh, no /healthz round-trip needed.
  const setFlags = useFlagsStore((s) => s.setFlags);
  const [data, setData] = useState<AdminFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [editing, setEditing] = useState<FlagName | null>(null);

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
    if (!window.confirm(`Clear override for ${name}? Falls back to file/env default.`)) return;
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
                Edits persist in the database and apply on the next request — no redeploy. Clear an
                override to revert to the JSON file or env default.
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
            <div className="space-y-8">
              {FLAG_GROUPS.map((group) => (
                <section key={group.title} className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h2>
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
                        onEdit={() => setEditing(flag.name)}
                        onClear={() => void handleClear(flag.name)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
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

const FlagRow = ({
  descriptor,
  data,
  onEdit,
  onClear,
}: {
  descriptor: FlagDescriptor;
  data: AdminFlagsResponse;
  onEdit: () => void;
  onClear: () => void;
}): React.JSX.Element => {
  const definition = data.definitions[descriptor.name];
  const liveValue = data.snapshot[descriptor.name];

  // Heuristic: a definition is considered "customised by admin" when it has
  // rules or a percentage. (We don't get a separate "is from DB?" flag from
  // the server today — when we do, key off that instead.)
  const customised = useMemo(
    () =>
      Boolean(
        (definition.rules && definition.rules.length > 0) ||
        typeof definition.percentage === 'number',
      ),
    [definition],
  );

  return (
    <li className="rounded-lg border bg-card transition-colors hover:bg-accent/30">
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-semibold">{descriptor.name}</code>
            <LiveValueBadge value={liveValue} />
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
          <Button size="sm" variant="outline" onClick={onEdit}>
            <PencilSimpleIcon className="h-3.5 w-3.5" weight="bold" />
            Edit
          </Button>
          {customised ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-destructive hover:bg-destructive/10"
              aria-label="Clear override"
            >
              <TrashIcon className="h-3.5 w-3.5" weight="bold" />
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

const FlagListSkeleton = (): React.JSX.Element => (
  <ul className="space-y-3">
    {Array.from({ length: 6 }).map((_, idx) => (
      <li key={idx} className="rounded-lg border bg-card p-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3 w-2/3" />
        <Skeleton className="mt-1 h-3 w-1/2" />
      </li>
    ))}
  </ul>
);
