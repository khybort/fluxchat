import { AnimatePresence, motion } from 'framer-motion';
import {
  CaretDownIcon,
  ChatCircleIcon,
  ChatTeardropDotsIcon,
  CircleNotchIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listChats } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const { chatId } = useParams<{ chatId: string }>();
  const refreshNonce = useChatStore((s) => s.refreshNonce);
  const consumePending = useChatStore((s) => s.consumePending);
  const [chats, setChats] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-2 px-3 py-3">
        <Button onClick={handleNew} className="w-full justify-start gap-2" size="sm">
          <ChatTeardropDotsIcon className="h-4 w-4" weight="regular" />
          New chat
        </Button>
        <div className="relative">
          <MagnifyingGlassIcon
            weight="bold"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search chats…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
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
                  >
                    <NavLink
                      to={`/chat/${chat.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                          'hover:bg-accent',
                          (isActive || chat.id === chatId) &&
                            'bg-accent font-medium text-accent-foreground',
                        )
                      }
                    >
                      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-secondary text-muted-foreground group-hover:text-foreground">
                        <ChatCircleIcon className="h-3.5 w-3.5" weight="bold" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium leading-tight">
                          {chat.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                      </span>
                    </NavLink>
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
                <CircleNotchIcon className="h-3 w-3 animate-spin" weight="bold" />
              ) : (
                <>
                  <CaretDownIcon className="h-3 w-3" weight="bold" />
                  Load more
                </>
              )}
            </Button>
          ) : null}
        </div>
      </ScrollArea>
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
      <ChatCircleIcon className="h-4 w-4 text-muted-foreground" weight="regular" />
    </div>
    <p className="text-sm font-medium">{hasChats && query ? 'No matches' : 'No chats yet'}</p>
    <p className="text-xs text-muted-foreground">
      {hasChats && query
        ? 'Try a different search term.'
        : 'Send your first message to get started.'}
    </p>
  </div>
);
