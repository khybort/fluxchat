import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveChat, deleteChat, listChats } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Chat } from '@/api/types';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

interface ChatListState {
  chats: Chat[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  pendingDelete: string | null;
  activeChatId: string | undefined;
  loadMore: () => Promise<void>;
  handleDelete: (chat: Chat) => Promise<void>;
  handleArchive: (chat: Chat) => Promise<void>;
}

export const useChatList = (): ChatListState => {
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
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

  const loadMore = async (): Promise<void> => {
    if (!token || !cursor || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await listChats(token, { cursor });
      setChats((prev) => [...prev, ...page.data]);
      setCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to load more';
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (chat: Chat): Promise<void> => {
    if (!token) return;
    setPendingDelete(chat.id);
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await deleteChat(token, chat.id);
      toast.success('Chat deleted');
      notifyChatDeleted();
      if (activeChatId === chat.id) navigate('/chat', { replace: true });
    } catch (err: unknown) {
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
      if (activeChatId === chat.id) navigate('/chat', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to archive chat';
      toast.error(message);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    }
  };

  return {
    chats,
    loading,
    loadingMore,
    error,
    hasMore,
    pendingDelete,
    activeChatId,
    loadMore,
    handleDelete,
    handleArchive,
  };
};
