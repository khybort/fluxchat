import { AnimatePresence, motion } from 'framer-motion';
import { ChatsCircle, Robot, Sparkle } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { completion, createChat, getHealthz, getHistory } from '@/api/chat';
import { ApiError } from '@/api/client';
import { openSseStream } from '@/api/sse';
import type {
  CompletionJsonResponse,
  FeatureFlagsSnapshot,
  Message,
  StreamEvent,
  ToolCall,
} from '@/api/types';
import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { StreamingStatus } from '@/components/chat/streaming-status';
import { ToolExecutionCard } from '@/components/chat/tool-execution-card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { uuid } from '@/lib/uuid';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';

type Phase = 'idle' | 'thinking' | 'tool' | 'streaming';

interface PendingMessage {
  userId: string;
  assistantId: string;
  assistantText: string;
  tools: ToolCall[];
  phase: Phase;
}

export const ChatPage = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const notifyChatCreated = useChatStore((s) => s.notifyChatCreated);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<FeatureFlagsSnapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial flags snapshot
  useEffect(() => {
    let cancelled = false;
    void getHealthz()
      .then((res) => {
        if (!cancelled) setFlags(res.flags);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Load history when chat changes
  useEffect(() => {
    if (!chatId || !token) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setPending(null);

    getHistory(token, chatId, { limit: 50 })
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
  }, [chatId, token, navigate]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, pending?.assistantText, pending?.tools.length, pending?.phase]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setPending(null);
  }, []);

  const handleSend = useCallback(
    async (text: string): Promise<void> => {
      if (!token) return;

      // Auto-create a chat when the user sends their first message from /chat
      // (no chatId in the URL). The title is the first 60 chars of the message
      // — this matches what most chat UIs do as a sensible default.
      let activeChatId = chatId;
      if (!activeChatId) {
        try {
          const newChat = await createChat(token, { title: text.slice(0, 60) });
          activeChatId = newChat.id;
          notifyChatCreated(newChat);
          navigate(`/chat/${newChat.id}`, { replace: true });
        } catch (err) {
          const message = err instanceof ApiError ? err.message : 'Failed to start a chat';
          toast.error(message);
          return;
        }
      }

      const userId = uuid();
      const assistantId = uuid();
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
        assistantId,
        assistantText: '',
        tools: [],
        phase: 'thinking',
      });
      setBusy(true);

      const streamingEnabled = flags?.STREAMING_ENABLED ?? true;

      try {
        if (streamingEnabled) {
          const controller = new AbortController();
          abortRef.current = controller;

          for await (const event of openSseStream({
            path: `/api/chats/${encodeURIComponent(activeChatId)}/completion`,
            body: { message: text },
            token,
            signal: controller.signal,
          })) {
            applyEvent(event, setPending);
          }

          // Finalize: lift the streamed assistant text into messages
          setPending((current) => {
            if (current) commitPending(current, setMessages);
            return null;
          });
        } else {
          const response: CompletionJsonResponse = await completion(token, activeChatId, text);
          const assistantMessage: Message = {
            id: assistantId,
            chatId: activeChatId,
            role: 'assistant',
            content: response.message.content,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setPending(null);
          if (response.toolCalls.length > 0) {
            toast.message('Tools used', {
              description: response.toolCalls.map((t) => t.name).join(', '),
            });
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // user cancelled — pending already cleared by cancel()
          return;
        }
        const message = err instanceof ApiError ? err.message : 'Completion failed';
        toast.error(message);
        setPending(null);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [chatId, token, flags?.STREAMING_ENABLED],
  );

  if (!chatId) {
    return <NewChatPanel onSubmit={handleSend} busy={busy} flags={flags} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex items-center justify-between gap-2 border-b border-border/40 bg-card/20 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-from/30 via-brand-via/20 to-brand-to/30 text-primary shadow-[0_0_18px_-6px_hsl(var(--primary)/0.5)]">
            <Robot className="h-4 w-4" weight="duotone" />
          </span>
          <div>
            <p className="text-sm font-semibold">Conversation</p>
            <p className="text-[11px] text-muted-foreground">
              {messages.length} message{messages.length === 1 ? '' : 's'} ·{' '}
              {flags?.STREAMING_ENABLED ? 'streaming' : 'json'}
              {flags?.AI_TOOLS_ENABLED ? ' · tools on' : ''}
            </p>
          </div>
        </div>
        {pending ? (
          <Badge
            variant="secondary"
            className="gap-1.5 border border-primary/20 bg-primary/10 capitalize"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gradient-to-r from-brand-from via-brand-via to-brand-to opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-br from-brand-from to-brand-via" />
            </span>
            {pending.phase}
          </Badge>
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
        />
      </div>

      <ScrollArea className="flex-1" viewportRef={scrollRef}>
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 md:px-6">
          {loadingHistory ? (
            <HistorySkeleton />
          ) : (
            <>
              {messages.length === 0 && !pending ? <ConversationEmpty /> : null}

              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </AnimatePresence>

              {pending ? (
                <>
                  <AnimatePresence initial={false}>
                    {pending.tools.map((tool, idx) => (
                      <ToolExecutionCard key={`${pending.assistantId}-tool-${idx}`} tool={tool} />
                    ))}
                  </AnimatePresence>

                  {pending.phase === 'thinking' && pending.assistantText.length === 0 ? (
                    <StreamingStatus label="Thinking…" />
                  ) : null}
                  {pending.phase === 'tool' && pending.assistantText.length === 0 ? (
                    <StreamingStatus label="Calling tools…" />
                  ) : null}

                  {pending.assistantText.length > 0 || pending.phase === 'streaming' ? (
                    <MessageBubble
                      message={{
                        role: 'assistant',
                        content: pending.assistantText,
                        createdAt: new Date().toISOString(),
                      }}
                      streaming
                    />
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>

      <Composer onSubmit={handleSend} onCancel={cancel} busy={busy} />
    </div>
  );
};

const HistorySkeleton = (): React.JSX.Element => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, idx) => (
      <Skeleton
        key={idx}
        className={`h-16 w-full ${idx % 2 === 0 ? 'max-w-md' : 'ml-auto max-w-sm'}`}
      />
    ))}
  </div>
);

const ConversationEmpty = (): React.JSX.Element => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center gap-3 py-16 text-center"
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from/25 via-brand-via/15 to-brand-to/25 text-primary shadow-[0_0_30px_-6px_hsl(var(--brand-via)/0.5)]">
      <Sparkle className="h-6 w-6" weight="duotone" />
    </div>
    <div>
      <p className="text-lg font-semibold">
        <span className="text-brand-gradient">Start the conversation</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask anything. Try “What’s the weather in Istanbul?” when AI tools are enabled.
      </p>
    </div>
  </motion.div>
);

interface NewChatPanelProps {
  onSubmit: (text: string) => void | Promise<void>;
  busy: boolean;
  flags: FeatureFlagsSnapshot | null;
}

const NewChatPanel = ({ onSubmit, busy, flags }: NewChatPanelProps): React.JSX.Element => (
  <div className="relative flex h-full flex-col">
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="aurora-orb h-[26rem] w-[26rem] animate-aurora bg-brand-via/15" />
    </div>
    <div className="relative flex flex-1 items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg px-2 text-center"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from via-brand-via to-brand-to text-primary-foreground shadow-[0_0_50px_-4px_hsl(var(--brand-via)/0.65)]">
          <ChatsCircle className="h-7 w-7" weight="duotone" />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">
          <span className="text-brand-gradient">Start a new conversation</span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Type a message below — we&apos;ll spin up a fresh chat for you.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {flags?.STREAMING_ENABLED ? (
            <Badge variant="secondary" className="gap-1.5 border border-primary/20 bg-primary/10">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-brand-from to-brand-via" />
              Streaming on
            </Badge>
          ) : (
            <Badge variant="outline">Streaming off</Badge>
          )}
          {flags?.AI_TOOLS_ENABLED ? (
            <Badge
              variant="secondary"
              className="gap-1.5 border border-amber-400/30 bg-amber-400/10 text-amber-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Tools available
            </Badge>
          ) : null}
        </div>
      </motion.div>
    </div>
    <Composer onSubmit={onSubmit} busy={busy} placeholder="Ask me anything…" />
  </div>
);

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
