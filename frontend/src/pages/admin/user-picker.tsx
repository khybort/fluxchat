import { useEffect, useMemo, useRef, useState } from 'react';

import { listAdminUsers } from '@/api/admin';
import type { AdminUser } from '@/api/types';
import { UserRoleBadge } from '@/components/admin/user-role-badge';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

interface UserPickerProps {
  /** Currently picked user's id, or null. */
  selectedId: string | null;
  /** Optional: show this email next to the trigger when selectedId matches. */
  selectedEmail?: string | null;
  onPick: (user: AdminUser) => void;
  onClear: () => void;
}

const SEARCH_LIMIT = 20;
const DEBOUNCE_MS = 200;

/**
 * Combobox-style user picker. Click → popover with debounced search input
 * + result list. Click a user → parent learns the full row (id, email, role)
 * so it can auto-fill multiple fields. The popover is absolutely positioned
 * relative to the trigger button.
 */
export const UserPicker = ({
  selectedId,
  selectedEmail,
  onPick,
  onClear,
}: UserPickerProps): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce the search input so we don't fire a request on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // Fetch when popover opens or search term changes.
  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setLoading(true);
    const params: Parameters<typeof listAdminUsers>[1] = { limit: SEARCH_LIMIT };
    if (debounced) params.q = debounced;
    listAdminUsers(token, params)
      .then((res) => {
        if (!cancelled) setUsers(res.data);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debounced, token]);

  // Click outside / Escape → close.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-focus the search input when the popover opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const triggerLabel = useMemo(() => {
    if (!selectedId) return 'Pick user…';
    if (selectedEmail) return selectedEmail;
    return selectedId.slice(0, 8) + '…';
  }, [selectedId, selectedEmail]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-left text-sm transition-colors hover:bg-white/10',
          selectedId ? 'text-on-surface' : 'text-muted-foreground',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <MaterialIcon name="search" className="h-3.5 w-3.5 flex-none" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        {selectedId ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation();
                onClear();
              }
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-error/10 hover:text-error"
            aria-label="Clear selection"
          >
            <MaterialIcon name="close" className="h-3.5 w-3.5" />
          </span>
        ) : (
          <MaterialIcon
            name="expand_more"
            className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '')}
          />
        )}
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-9 z-30 rounded-md border bg-popover shadow-lg">
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              placeholder="Search by email or name…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="p-3 text-center text-xs text-muted-foreground">Loading…</div>
            ) : users.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                {debounced ? `No users match "${debounced}"` : 'No users yet'}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {users.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(user);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                        selectedId === user.id ? 'bg-accent/60' : '',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{user.name ?? user.email}</span>
                        {user.name ? (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {user.email}
                          </span>
                        ) : null}
                      </span>
                      <UserRoleBadge role={user.role} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
