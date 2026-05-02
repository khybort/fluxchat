import { useState } from 'react';

import type { AdminFlagsResponse, FlagDefinition, FlagName } from '@/api/types';
import { FlagListSkeleton } from '@/components/admin/flag-list-skeleton';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorCard } from '@/components/ui/error-card';
import { MaterialIcon } from '@/components/ui/material-icon';

import { FlagEditor } from './flag-editor';
import { AI_TOOLS_MASTER, FLAG_GROUPS, MASTER_OFF_BADGE, TOOL_FLAGS } from './flag-meta';
import { FlagRow } from './flags-panel/flag-row';
import { useAdminFlags } from './flags-panel/use-admin-flags';

interface FlagsListProps {
  data: AdminFlagsResponse;
  onEdit: (name: FlagName) => void;
  onClear: (name: FlagName) => void;
}

const FlagsList = ({ data, onEdit, onClear }: FlagsListProps): React.JSX.Element => {
  const masterOff = data.definitions[AI_TOOLS_MASTER].default === false;
  return (
    <div className="space-y-8">
      {FLAG_GROUPS.map((group) => {
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
                  onEdit={() => onEdit(flag.name)}
                  onClear={() => onClear(flag.name)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

export const FlagsPanel = (): React.JSX.Element => {
  const flags = useAdminFlags();
  const [editing, setEditing] = useState<FlagName | null>(null);
  const [confirmClear, setConfirmClear] = useState<FlagName | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const handleSave = async (name: FlagName, definition: FlagDefinition): Promise<void> => {
    await flags.save(name, definition);
    setEditing(null);
  };

  const hasAnyOverride = (flags.data?.overriddenNames.length ?? 0) > 0;

  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmClearAll(true)}
          disabled={!hasAnyOverride}
          className="text-error hover:bg-error/10 disabled:text-muted-foreground"
        >
          <MaterialIcon name="delete_sweep" className="h-4 w-4" />
          Clear all overrides
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void flags.reload()}
          disabled={flags.reloading}
        >
          <MaterialIcon
            name="refresh"
            className={flags.reloading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          />
          Reload
        </Button>
      </div>

      {flags.loading ? (
        <FlagListSkeleton />
      ) : flags.error ? (
        <ErrorCard
          title="Couldn't load feature flags"
          message={flags.error}
          onRetry={() => void flags.retry()}
        />
      ) : flags.data ? (
        <FlagsList data={flags.data} onEdit={setEditing} onClear={setConfirmClear} />
      ) : null}

      {editing && flags.data ? (
        <FlagEditor
          name={editing}
          initial={flags.data.definitions[editing]}
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
          if (confirmClear) await flags.clear(confirmClear);
        }}
      />

      <ConfirmDialog
        open={confirmClearAll}
        onOpenChange={setConfirmClearAll}
        title="Clear ALL flag overrides?"
        description="Wipes every override across every flag — rules, percentage rollouts, and per-user overrides. Each flag falls back to its file/env/code default. This action cannot be undone."
        confirmLabel="Clear all"
        tone="destructive"
        icon="delete_sweep"
        onConfirm={async () => {
          await flags.clearAll();
        }}
      />
    </>
  );
};
