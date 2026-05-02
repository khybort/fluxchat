import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { getHistory } from '@/api/chat';
import { ApiError } from '@/api/client';
import type { Message } from '@/api/types';
import { useAuthStore } from '@/store/auth-store';

const HISTORY_PAGE_LIMIT = 50;

interface UseChatHistory {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadingHistory: boolean;
  justCreatedChatIdRef: React.MutableRefObject<string | null>;
}

/**
 * Loads chat history when the chatId changes. Skips the fetch when the chatId
 * was just minted by `handleSend` so the optimistic user message + thinking
 * pending state survive the URL change.
 */
export const useChatHistory = (
  chatId: string | undefined,
  justCreatedChatIdRef: React.MutableRefObject<string | null>,
): UseChatHistory => {
  const token = useAuthStore((s) => s.token) ?? '';
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!chatId || !token) {
      setMessages([]);
      return;
    }
    if (justCreatedChatIdRef.current === chatId) {
      justCreatedChatIdRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);

    getHistory(token, chatId, { limit: HISTORY_PAGE_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setMessages(page.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          toast.error('Chat not found');
          navigate('/chat', { replace: true });
          return;
        }
        const message = err instanceof ApiError ? err.message : 'Failed to load history';
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, token, navigate, justCreatedChatIdRef]);

  return { messages, setMessages, loadingHistory, justCreatedChatIdRef };
};
