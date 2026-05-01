import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveChat, deleteChat, listChats } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

interface ChatSidebarProps {
  onNavigate?: () => void;
}

export const ChatSidebar = ({ onNavigate }: ChatSidebarProps): React.JSX.Element => {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const { chatId: activeChatId } = useParams<{ chatId: string }>();
  const refreshNonce = useChatStore((s) => s.refreshNonce);
  const consumePending = useChatStore((s) => s.consumePending);
  const notifyChatDeleted = useChatStore((s) => s.notifyChatDeleted);
  const [chats, setChats] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Chat | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // First reload triggered by refreshNonce: fold the pending optimistic chat in
    // immediately so the user sees it before the network round-trip lands.
    const optimistic = consumePending();
    if (optimistic) {
      setChats((prev) => [optimistic, ...prev.filter((c) => c.id !== optimistic.id)]);
    } else {
      setLoading(true);
    }
    setError(null);

    listChats(token, {})
      .then((page) => {
        if (cancelled) return;
        setChats(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'Failed to load chats';
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, refreshNonce, consumePending]);

  const filtered = useMemo(() => {
    if (!query.trim()) return chats;
    const q = query.toLowerCase();
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, query]);

  const loadMore = async (): Promise<void> => {
    if (!token || !cursor || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listChats(token, { cursor });
      setChats((prev) => [...prev, ...page.data]);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load more';
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNew = (): void => {
    navigate('/chat');
    onNavigate?.();
  };

  const handleDelete = async (chat: Chat): Promise<void> => {
    if (!token) return;
    setPendingDelete(chat.id);
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await deleteChat(token, chat.id);
      toast.success('Chat deleted');
      notifyChatDeleted();
      if (activeChatId === chat.id) {
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete chat';
      toast.error(message);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    } finally {
      setPendingDelete(null);
    }
  };

  const handleArchive = async (chat: Chat): Promise<void> => {
    if (!token) return;
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await archiveChat(token, chat.id);
      toast.success('Chat archived');
      notifyChatDeleted();
      if (activeChatId === chat.id) {
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to archive chat';
      toast.error(message);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 px-4 py-4">
        <Button
          onClick={handleNew}
          variant="gradient"
          className="w-full justify-center gap-2 rounded-2xl py-4 font-bold"
        >
          <MaterialIcon name="chat_bubble" filled className="text-base" />
          New chat
        </Button>
        <div className="relative">
          <MaterialIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant"
          />
          <Input
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
        <span>Recent</span>
        <MaterialIcon name="expand_more" className="text-sm" />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState query={query} hasChats={chats.length > 0} />
          ) : (
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {filtered.map((chat, index) => (
                  <motion.li
                    key={chat.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ delay: index * 0.02, duration: 0.2 }}
                    className="group relative"
                  >
                    <NavLink
                      to={`/chat/${chat.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl px-4 py-3 pr-9 text-left text-sm transition-all',
                          'border-l-4 border-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface',
                          (isActive || chat.id === activeChatId) &&
                            'border-primary-container bg-gradient-to-r from-primary-container/20 to-transparent text-on-surface',
                        )
                      }
                    >
                      <MaterialIcon
                        name="chat_bubble"
                        className="text-xl flex-none text-primary-container"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-tight">
                          {chat.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-on-surface-variant">
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                      </span>
                    </NavLink>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Chat actions"
                          onClick={(e) => {
                            // Stop the click from reaching the NavLink underneath.
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className={cn(
                            'absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
                            'text-muted-foreground transition-colors hover:bg-accent-foreground/10 hover:text-foreground',
                            'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                            'data-[state=open]:opacity-100',
                          )}
                          disabled={pendingDelete === chat.id}
                        >
                          {pendingDelete === chat.id ? (
                            <MaterialIcon
                              name="progress_activity"
                              className="h-3.5 w-3.5 animate-spin"
                            />
                          ) : (
                            <MaterialIcon name="more_horiz" className="h-4 w-4" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onSelect={() => setConfirmArchive(chat)}
                          className="focus:bg-tertiary/10 focus:text-tertiary"
                        >
                          <MaterialIcon name="archive" className="text-base" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setConfirmDelete(chat)}
                          className="text-error focus:bg-error/10 focus:text-error"
                        >
                          <MaterialIcon name="delete" className="text-base" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {hasMore && !loading && filtered.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-center text-xs text-muted-foreground"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <MaterialIcon name="progress_activity" className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <MaterialIcon name="expand_more" className="h-3 w-3" />
                  Load more
                </>
              )}
            </Button>
          ) : null}
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.title ?? ''}"?`}
        description="This cannot be undone. The chat and all of its messages will be removed."
        confirmLabel="Delete"
        tone="destructive"
        icon="delete_forever"
        onConfirm={async () => {
          if (confirmDelete) await handleDelete(confirmDelete);
        }}
      />
      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(open) => !open && setConfirmArchive(null)}
        title={`Archive "${confirmArchive?.title ?? ''}"?`}
        description="The chat is hidden from the active list. You can restore it from the Archive page."
        confirmLabel="Archive"
        tone="warning"
        icon="archive"
        onConfirm={async () => {
          if (confirmArchive) await handleArchive(confirmArchive);
        }}
      />
    </div>
  );
};

const EmptyState = ({
  query,
  hasChats,
}: {
  query: string;
  hasChats: boolean;
}): React.JSX.Element => (
  <div className="flex flex-col items-center justify-center gap-2 px-2 py-10 text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
      <MaterialIcon name="chat_bubble" className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="text-sm font-medium">{hasChats && query ? 'No matches' : 'No chats yet'}</p>
    <p className="text-xs text-muted-foreground">
      {hasChats && query
        ? 'Try a different search term.'
        : 'Send your first message to get started.'}
    </p>
  </div>
);
