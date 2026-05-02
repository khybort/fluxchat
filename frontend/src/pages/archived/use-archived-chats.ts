import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { deleteChat, listArchivedChats, unarchiveChat } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Chat } from '@/api/types';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

const PAGE_SIZE = 20;

interface ArchivedChats {
  chats: Chat[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  restore: (chat: Chat) => Promise<void>;
  deletePermanently: (chat: Chat) => Promise<void>;
}

export const useArchivedChats = (): ArchivedChats => {
  const token = useAuthStore((s) => s.token) ?? '';
  const navigate = useNavigate();
  const notifyChatDeleted = useChatStore((s) => s.notifyChatDeleted);

  const [chats, setChats] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listArchivedChats(token, { limit: PAGE_SIZE });
      setChats(res.data);
      setCursor(res.pagination.nextCursor);
      setHasMore(res.pagination.hasMore);
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to load more';
      toast.error(message);
    } finally {
      setLoadingMore(false);
    }
  };

  const restore = async (chat: Chat): Promise<void> => {
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await unarchiveChat(token, chat.id);
      notifyChatDeleted();
      toast.success('Restored');
      navigate(`/chat/${chat.id}`);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to restore';
      toast.error(message);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
    }
  };

  const deletePermanently = async (chat: Chat): Promise<void> => {
    const previous = chats;
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    try {
      await deleteChat(token, chat.id);
      toast.success('Deleted permanently');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Delete failed';
      toast.error(message);
      setChats(previous);
    }
  };

  return { chats, loading, loadingMore, hasMore, loadMore, restore, deletePermanently };
};
