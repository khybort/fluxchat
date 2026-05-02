import { useMemo, useState } from 'react';

import type { AdminUser } from '@/api/types';
import { FlagListSkeleton } from '@/components/admin/flag-list-skeleton';
import { UserRoleBadge } from '@/components/admin/user-role-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import {
  AI_TOOLS_MASTER,
  FLAG_LIST,
  MASTER_OFF_BADGE,
  NUMERIC_FLAGS,
  TOOL_FLAGS,
} from './flag-meta';
import { FlagRow } from './user-flag-overrides-row';
import { useUserOverrides } from './user-flag-overrides/use-user-overrides';

interface Props {
  user: AdminUser;
  onClose: () => void;
}

export const UserFlagOverridesDialog = ({ user, onClose }: Props): React.JSX.Element => {
  const { definitions, overrides, saving, dirtyFlags, setRow, save } = useUserOverrides({
    userId: user.id,
    userEmail: user.email,
    onSaved: onClose,
  });
  const [query, setQuery] = useState('');

  const visibleFlags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FLAG_LIST;
    return FLAG_LIST.filter((flag) => flag.toLowerCase().includes(q));
  }, [query]);

  const masterEffective = useMemo(() => {
    if (!overrides || !definitions) return true;
    const m = overrides[AI_TOOLS_MASTER];
    return m.enabled ? Boolean(m.value) : Boolean(definitions[AI_TOOLS_MASTER].default);
  }, [overrides, definitions]);

  const firstVisibleToolFlag = visibleFlags.find((flag) => TOOL_FLAGS.has(flag));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-base">Per-user flag overrides</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{user.email}</span>
            <UserRoleBadge role={user.role} />
            <span className="text-muted-foreground">
              · Toggle a flag to add or remove a rule scoped to this user.
            </span>
          </DialogDescription>
        </DialogHeader>

        {overrides && definitions ? (
          <div className="border-b px-6 py-3">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flags…"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!overrides || !definitions ? (
            <FlagListSkeleton count={6} />
          ) : visibleFlags.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No flags match <span className="font-mono">{query}</span>.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleFlags.map((flag) => {
                const isToolFlag = TOOL_FLAGS.has(flag);
                const showBadgeAbove = flag === firstVisibleToolFlag && !masterEffective;
                return (
                  <div key={flag}>
                    {showBadgeAbove ? (
                      <li className="mb-2 list-none rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {MASTER_OFF_BADGE}
                      </li>
                    ) : null}
                    <FlagRow
                      flag={flag}
                      row={overrides[flag]}
                      definition={definitions[flag]}
                      isNumeric={NUMERIC_FLAGS.includes(flag)}
                      disabled={isToolFlag && !masterEffective}
                      onChange={(partial) => setRow(flag, partial)}
                    />
                  </div>
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
              onClick={() => void save()}
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
