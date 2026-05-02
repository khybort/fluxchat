import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { createChat } from '@/api/chat';
import { ApiError } from '@/api/client';
import { openSseStream } from '@/api/sse';
import type { Message, StreamEvent, ToolCall } from '@/api/types';
import { uuid } from '@/lib/uuid';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

type Phase = 'idle' | 'thinking' | 'tool' | 'streaming';

export interface PendingMessage {
  userId: string;
  assistantId: string;
  assistantText: string;
  tools: ToolCall[];
  phase: Phase;
}

interface UseChatStreamOptions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  justCreatedChatIdRef: React.MutableRefObject<string | null>;
}

interface UseChatStream {
  pending: PendingMessage | null;
  busy: boolean;
  cancel: () => void;
  handleSend: (text: string) => Promise<void>;
  handleRegenerate: () => Promise<void>;
}

const applyEvent = (
  event: StreamEvent,
  setPending: React.Dispatch<React.SetStateAction<PendingMessage | null>>,
): void => {
  setPending((current) => {
    if (!current) return current;
    switch (event.type) {
      case 'thinking':
        return { ...current, phase: 'thinking' };
      case 'tool_execution':
        return { ...current, phase: 'tool', tools: [...current.tools, event.tool] };
      case 'delta':
        return {
          ...current,
          phase: 'streaming',
          assistantText: current.assistantText + event.text,
        };
      case 'done':
        return {
          ...current,
          phase: 'streaming',
          assistantText: event.fullText || current.assistantText,
        };
      case 'error':
        toast.error(event.message);
        return current;
      default:
        return current;
    }
  });
};

const commitPending = (
  pending: PendingMessage,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
): void => {
  if (!pending.assistantText.trim()) return;
  const message: Message = {
    id: pending.assistantId,
    chatId: '',
    role: 'assistant',
    content: pending.assistantText,
    createdAt: new Date().toISOString(),
  };
  setMessages((prev) => [...prev, message]);
};

export const useChatStream = ({
  setMessages,
  justCreatedChatIdRef,
}: UseChatStreamOptions): UseChatStream => {
  const token = useAuthStore((s) => s.token) ?? '';
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const notifyChatCreated = useChatStore((s) => s.notifyChatCreated);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setPending(null);
  }, []);

  const runStream = useCallback(
    async (path: string, body: Record<string, unknown>, errorLabel: string): Promise<void> => {
      try {
        const controller = new AbortController();
        abortRef.current = controller;

        for await (const event of openSseStream({
          path,
          body,
          token,
          signal: controller.signal,
        })) {
          applyEvent(event, setPending);
        }

        setPending((current) => {
          if (current) commitPending(current, setMessages);
          return null;
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User-initiated cancel — give them positive feedback so they know
          // the click took. Silent return left the spinner-stop ambiguous.
          toast.info('Request cancelled');
          setPending(null);
          return;
        }
        const message = err instanceof ApiError ? err.message : errorLabel;
        toast.error(message);
        setPending(null);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [token, setMessages],
  );

  const handleSend = useCallback(
    async (text: string): Promise<void> => {
      if (!token) return;

      let activeChatId = chatId;
      if (!activeChatId) {
        try {
          const newChat = await createChat(token, { title: text.slice(0, 60) });
          activeChatId = newChat.id;
          notifyChatCreated(newChat);
          justCreatedChatIdRef.current = newChat.id;
          navigate(`/chat/${newChat.id}`, { replace: true });
        } catch (err: unknown) {
          const message = err instanceof ApiError ? err.message : 'Failed to start a chat';
          toast.error(message);
          return;
        }
      }

      const userId = uuid();
      const userMessage: Message = {
        id: userId,
        chatId: activeChatId,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setPending({
        userId,
        assistantId: uuid(),
        assistantText: '',
        tools: [],
        phase: 'thinking',
      });
      setBusy(true);

      await runStream(
        `/api/chats/${encodeURIComponent(activeChatId)}/completion`,
        { message: text },
        'Completion failed',
      );
    },
    [chatId, token, navigate, notifyChatCreated, setMessages, runStream, justCreatedChatIdRef],
  );

  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!chatId || !token || busy) return;

    let droppedAssistantId: string | null = null;
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        const candidate = next[i];
        if (candidate?.role === 'assistant') {
          droppedAssistantId = candidate.id;
          next.splice(i, 1);
          break;
        }
      }
      return next;
    });
    if (!droppedAssistantId) return;

    setPending({
      userId: '',
      assistantId: uuid(),
      assistantText: '',
      tools: [],
      phase: 'thinking',
    });
    setBusy(true);

    await runStream(`/api/chats/${encodeURIComponent(chatId)}/regenerate`, {}, 'Regenerate failed');
  }, [chatId, token, busy, setMessages, runStream]);

  return { pending, busy, cancel, handleSend, handleRegenerate };
};
