import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { deleteAdminUser, listAdminUsers } from '@/api/admin';
import { ApiError } from '@/api/client';
import type { AdminUser } from '@/api/types';
import { UserRoleBadge } from '@/components/admin/user-role-badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorCard } from '@/components/ui/error-card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, initialsOf } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

import { UserFlagOverridesDialog } from './user-flag-overrides-dialog';
import { MaterialIcon } from '@/components/ui/material-icon';

const PAGE_SIZE = 20;

export const UsersPanel = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminUsers(token, { limit: PAGE_SIZE });
      setUsers(res.data);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load users';
      // Inline error replaces the skeleton so users see something actionable
      // instead of staring at it forever. "Load more" failures stay as toasts
      // since the existing list is still useful.
      setError(message);
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

  const handleDelete = async (user: AdminUser): Promise<void> => {
    setDeletingId(user.id);
    try {
      await deleteAdminUser(token, user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(`Deleted ${user.email}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete user';
      toast.error(message);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  if (loading) return <UserListSkeleton />;
  if (error) {
    return (
      <ErrorCard title="Couldn't load users" message={error} onRetry={() => void loadFirstPage()} />
    );
  }
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
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUser?.id}
            isDeleting={deletingId === user.id}
            onEdit={() => setEditing(user)}
            onDelete={() => setConfirmDelete(user)}
          />
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

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.email ?? 'this user'}?`}
        description="This permanently removes the account, all of their chats, and every message. The action cannot be undone."
        confirmLabel="Delete user"
        tone="destructive"
        icon="delete_forever"
        onConfirm={async () => {
          if (confirmDelete) await handleDelete(confirmDelete);
        }}
      />
    </>
  );
};

interface UserRowProps {
  user: AdminUser;
  isSelf: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const UserRow = ({
  user,
  isSelf,
  isDeleting,
  onEdit,
  onDelete,
}: UserRowProps): React.JSX.Element => (
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
    <div className="flex flex-none items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={onEdit} disabled={isDeleting}>
        <MaterialIcon name="tune" className="h-3.5 w-3.5" />
        Override flags
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={isSelf || isDeleting}
        className="text-error hover:bg-error/10 disabled:text-muted-foreground"
        aria-label={isSelf ? 'You cannot delete yourself' : `Delete ${user.email}`}
        title={isSelf ? "You can't delete your own account" : 'Delete user'}
      >
        <MaterialIcon
          name={isDeleting ? 'progress_activity' : 'delete'}
          className={cn('text-base', isDeleting && 'animate-spin')}
        />
      </Button>
    </div>
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
