import { motion } from 'framer-motion';
import { SlidersHorizontalIcon, UsersIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { listAdminUsers } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminUser } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, initialsOf } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

import { UserFlagOverridesDialog } from './admin/user-flag-overrides-dialog';

const PAGE_SIZE = 20;

export const AdminUsersPage = (): React.JSX.Element => {
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

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <UsersIcon className="h-4 w-4" weight="bold" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">Users</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Apply per-user flag overrides — useful for opting an individual user into (or out of)
              a behavior without affecting their cohort.
            </p>
          </div>

          {loading ? (
            <UserListSkeleton />
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
              No users yet.
            </div>
          ) : (
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
            </>
          )}
        </motion.div>
      </div>

      {editing ? <UserFlagOverridesDialog user={editing} onClose={() => setEditing(null)} /> : null}
    </ScrollArea>
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
        {user.role === 'admin' ? (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            admin
          </Badge>
        ) : null}
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
