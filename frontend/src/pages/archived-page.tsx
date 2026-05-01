import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { deleteChat, listArchivedChats, unarchiveChat } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

const PAGE_SIZE = 20;

export const ArchivedPage = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const navigate = useNavigate();
  const notifyChatDeleted = useChatStore((s) => s.notifyChatDeleted);

  const [chats, setChats] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listArchivedChats(token, { limit: PAGE_SIZE });
      setChats(res.data);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load archive';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async (): Promise<void> => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listArchivedChats(token, { cursor, limit: PAGE_SIZE });
      setChats((prev) => [...prev, ...res.data]);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load more';
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRestore = async (chat: Chat): Promise<void> => {
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await unarchiveChat(token, chat.id);
      notifyChatDeleted();
      toast.success('Restored');
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to restore';
      toast.error(message);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    }
  };

  const handleDeletePermanently = async (chat: Chat): Promise<void> => {
    const previous = chats;
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await deleteChat(token, chat.id);
      toast.success('Deleted permanently');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Delete failed';
      toast.error(message);
      setChats(previous);
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
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary border border-tertiary/30">
              <MaterialIcon name="inventory_2" filled className="text-base" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-on-surface">Archive</h1>
              <p className="text-xs text-on-surface-variant">
                Chats you've archived. Restore to bring them back, or delete permanently.
              </p>
            </div>
          </div>

          {loading ? (
            <ListSkeleton />
          ) : chats.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ul className="space-y-2">
                {chats.map((chat) => (
                  <li
                    key={chat.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-container/40 p-4 backdrop-blur-md transition-colors hover:bg-surface-container/60"
                  >
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/5 text-on-surface-variant">
                      <MaterialIcon name="chat_bubble" className="text-base" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-on-surface">{chat.title}</p>
                      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                        Archived {formatRelativeTime(chat.archivedAt ?? chat.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => void handleRestore(chat)}>
                        <MaterialIcon name="unarchive" className="text-base" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(chat)}
                        className="text-error hover:bg-error/10"
                        aria-label="Delete permanently"
                      >
                        <MaterialIcon name="delete" className="text-base" />
                      </Button>
                    </div>
                  </li>
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

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.title ?? ''}" permanently?`}
        description="This cannot be undone. The chat and all of its messages will be erased."
        confirmLabel="Delete permanently"
        tone="destructive"
        icon="delete_forever"
        onConfirm={async () => {
          if (confirmDelete) await handleDeletePermanently(confirmDelete);
        }}
      />
    </ScrollArea>
  );
};

const ListSkeleton = (): React.JSX.Element => (
  <ul className="space-y-2">
    {Array.from({ length: 6 }).map((_, idx) => (
      <li
        key={idx}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-container/40 p-4 backdrop-blur-md"
      >
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-24" />
      </li>
    ))}
  </ul>
);

const EmptyState = (): React.JSX.Element => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-surface-container/20 px-6 py-16 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-on-surface-variant">
      <MaterialIcon name="inventory_2" className="text-2xl" />
    </span>
    <p className="text-sm font-medium text-on-surface">Nothing archived yet</p>
    <p className="text-xs text-on-surface-variant">
      Archive chats from the sidebar 3-dot menu or the conversation top bar.
    </p>
  </div>
);
