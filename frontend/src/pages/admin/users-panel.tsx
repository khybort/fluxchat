import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listAdminUsers } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminUser } from '@/api/types';
import { UserRoleBadge } from '@/components/admin/user-role-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, initialsOf } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

import { UserFlagOverridesDialog } from './user-flag-overrides-dialog';

const PAGE_SIZE = 20;

export const UsersPanel = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const loadFirstPage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listAdminUsers(token, { limit: PAGE_SIZE });
      setUsers(res.data);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load users';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async (): Promise<void> => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listAdminUsers(token, { cursor, limit: PAGE_SIZE });
      setUsers((prev) => [...prev, ...res.data]);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load more users';
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <UserListSkeleton />;
  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
        No users yet.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {users.map((user) => (
          <UserRow key={user.id} user={user} onEdit={() => setEditing(user)} />
        ))}
      </ul>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      {editing ? <UserFlagOverridesDialog user={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
};

const UserRow = ({ user, onEdit }: { user: AdminUser; onEdit: () => void }): React.JSX.Element => (
  <li className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/30">
    <div
      className={cn(
        'flex h-9 w-9 flex-none items-center justify-center rounded-full font-mono text-xs font-semibold',
        user.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {initialsOf(user.name ?? user.email)}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{user.name ?? user.email}</span>
        <UserRoleBadge role={user.role} />
      </div>
      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
    </div>
    <Button size="sm" variant="outline" onClick={onEdit}>
      <SlidersHorizontalIcon className="h-3.5 w-3.5" weight="bold" />
      Override flags
    </Button>
  </li>
);

const UserListSkeleton = (): React.JSX.Element => (
  <ul className="space-y-2">
    {Array.from({ length: 6 }).map((_, idx) => (
      <li key={idx} className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-32" />
      </li>
    ))}
  </ul>
);
