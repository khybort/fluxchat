import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveChat, createChat, deleteChat, getHistory } from '@/api/chat';
import { ApiError } from '@/api/client';
import { openSseStream } from '@/api/sse';
import type { FeatureFlagsSnapshot, Message, StreamEvent, ToolCall } from '@/api/types';
import { Composer } from '@/components/chat/composer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { WelcomeBento } from '@/components/chat/welcome-bento';
import { StreamingStatus } from '@/components/chat/streaming-status';
import { ToolExecutionCard } from '@/components/chat/tool-execution-card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { uuid } from '@/lib/uuid';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useFlagsStore } from '@/store/flags-store';
import { MaterialIcon } from '@/components/ui/material-icon';

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
  const notifyChatDeleted = useChatStore((s) => s.notifyChatDeleted);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Flags come from the shared zustand store so admin edits in /admin/flags
  // (or another tab) propagate here without a hard refresh.
  const flags = useFlagsStore((s) => s.flags);
  const refreshFlags = useFlagsStore((s) => s.refresh);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks the chatId we just minted in `handleSend`. The chatId-watcher
  // useEffect skips its history-fetch + pending-reset for that one id, so
  // the optimistic user message + "thinking" state painted by the handler
  // survive the URL change. Without this, the very first message in a
  // brand-new chat would render with no feedback because the watcher would
  // wipe the state right after navigate().
  const justCreatedChatIdRef = useRef<string | null>(null);

  // Lazy-hydrate the store on first mount in case AppShell hasn't finished
  // its own fetch yet (e.g. direct deep-link to a chat URL).
  useEffect(() => {
    if (!flags) void refreshFlags();
  }, [flags, refreshFlags]);

  // Load history when chat changes
  useEffect(() => {
    if (!chatId || !token) {
      setMessages([]);
      return;
    }
    // If this chatId was created by `handleSend` in the current session, the
    // handler has already painted the optimistic user message and the
    // "thinking" pending state. The chat row has no messages on the server
    // yet (the user message is being written + the AI is mid-stream), so a
    // history fetch would only race the handler and clobber its state.
    if (justCreatedChatIdRef.current === chatId) {
      justCreatedChatIdRef.current = null;
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
          // Tell the chatId-watcher useEffect to leave the state we're
          // about to set alone for this one id — the optimistic user
          // message + thinking pending must survive the URL change.
          justCreatedChatIdRef.current = newChat.id;
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

      // Always open via openSseStream regardless of `STREAMING_ENABLED`. The
      // helper transparently adapts a JSON response (when the server has
      // streaming off) into the same event sequence an SSE response yields, so
      // there is no client/server flag-drift class — a brief mismatch between
      // /healthz and the lambda that handles a request can no longer surface
      // as "Completion failed".
      try {
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

        setPending((current) => {
          if (current) commitPending(current, setMessages);
          return null;
        });
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
    [chatId, token, navigate, notifyChatCreated],
  );

  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!chatId || !token || busy) return;

    // Drop the trailing assistant message locally so the pending "thinking"
    // state visibly replaces it. The backend deletes its row on regenerate;
    // we keep the UI in sync optimistically.
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

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      for await (const event of openSseStream({
        path: `/api/chats/${encodeURIComponent(chatId)}/regenerate`,
        body: {},
        token,
        signal: controller.signal,
      })) {
        applyEvent(event, setPending);
      }
      setPending((current) => {
        if (current) commitPending(current, setMessages);
        return null;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof ApiError ? err.message : 'Regenerate failed';
      toast.error(message);
      setPending(null);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [chatId, token, busy]);

  const handleDeleteCurrent = useCallback(async (): Promise<void> => {
    if (!chatId || !token) return;
    try {
      await deleteChat(token, chatId);
      toast.success('Chat deleted');
      notifyChatDeleted();
      navigate('/chat', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to delete chat';
      toast.error(message);
    }
  }, [chatId, token, navigate, notifyChatDeleted]);

  const handleArchiveCurrent = useCallback(async (): Promise<void> => {
    if (!chatId || !token) return;
    try {
      await archiveChat(token, chatId);
      toast.success('Chat archived');
      notifyChatDeleted();
      navigate('/chat', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to archive chat';
      toast.error(message);
    }
  }, [chatId, token, navigate, notifyChatDeleted]);

  if (!chatId) {
    return <NewChatPanel onSubmit={handleSend} busy={busy} flags={flags} />;
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface-container/40 backdrop-blur-md px-4 py-3 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary">
            <MaterialIcon name="smart_toy" filled className="text-base" />
          </span>
          <div>
            <p className="text-sm font-semibold text-on-surface">Conversation</p>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
              {messages.length} message{messages.length === 1 ? '' : 's'} ·{' '}
              {flags?.STREAMING_ENABLED ? 'streaming' : 'json'}
              {flags?.AI_TOOLS_ENABLED ? ' · tools on' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending ? (
            <Badge variant="success" className="gap-1.5 capitalize">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-tertiary" />
              </span>
              {pending.phase}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            className="group inline-flex items-center gap-2 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-tertiary/10 hover:text-tertiary"
          >
            <MaterialIcon name="archive" className="text-lg" />
            <span className="hidden text-xs font-bold uppercase tracking-wider md:inline">
              Archive
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="group inline-flex items-center gap-2 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
          >
            <MaterialIcon name="delete" className="text-lg" />
            <span className="hidden text-xs font-bold uppercase tracking-wider md:inline">
              Delete chat
            </span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Chat info"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/10 hover:text-on-surface"
              >
                <MaterialIcon name="info" className="text-lg" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="max-w-xs">
              <div className="space-y-1 text-[11px]">
                <p>
                  <span className="text-on-surface-variant">Chat ID:</span>{' '}
                  <span className="font-mono">{chatId}</span>
                </p>
                <p>
                  <span className="text-on-surface-variant">Messages:</span>{' '}
                  <span className="font-mono">{messages.length}</span>
                </p>
                <p>
                  <span className="text-on-surface-variant">Mode:</span>{' '}
                  <span className="font-mono">
                    {flags?.STREAMING_ENABLED ? 'streaming' : 'json'}
                  </span>
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ScrollArea className="flex-1 mt-4" viewportRef={scrollRef}>
        <div className="w-full space-y-message-gap px-4 pb-40 pt-2 md:px-12">
          {loadingHistory ? (
            <HistorySkeleton />
          ) : (
            <>
              {messages.length === 0 && !pending ? <ConversationEmpty /> : null}

              <AnimatePresence initial={false}>
                {messages.map((m, idx) => {
                  // Regenerate button stays visible on every "current last
                  // assistant" turn — clicking it deletes the row server-side
                  // and streams a fresh assistant turn in place.
                  const isLastAssistant =
                    m.role === 'assistant' &&
                    !messages.slice(idx + 1).some((later) => later.role === 'assistant');
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                    />
                  );
                })}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
        <div className="pointer-events-auto">
          <Composer onSubmit={handleSend} onCancel={cancel} busy={busy} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this chat?"
        description="This cannot be undone. The chat and all of its messages will be removed."
        confirmLabel="Delete"
        tone="destructive"
        icon="delete_forever"
        onConfirm={handleDeleteCurrent}
      />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this chat?"
        description="The chat is hidden from the active list. You can restore it from the Archive page."
        confirmLabel="Archive"
        tone="warning"
        icon="archive"
        onConfirm={handleArchiveCurrent}
      />
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
    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-foreground">
      <MaterialIcon name="auto_awesome" className="h-5 w-5" />
    </div>
    <div>
      <p className="text-base font-semibold">Start the conversation</p>
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
    <div className="flex flex-1 items-center overflow-y-auto pb-40">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl px-6 py-12"
      >
        <div className="mb-12 flex flex-col items-center text-center">
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-tr from-primary-container to-tertiary shadow-[0_0_40px_hsl(var(--primary-container)/0.4)]">
            <MaterialIcon name="auto_awesome" filled className="text-5xl text-white" />
          </div>
          <h2 className="text-display-xl text-on-surface">What shall we build today?</h2>
          <p className="mt-4 max-w-2xl text-body-lg text-on-surface-variant">
            Your AI-powered workspace is ready. Pick a quick action below or type a message to start
            creating, analyzing, or coding.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {flags?.STREAMING_ENABLED ? (
              <Badge variant="success">
                <MaterialIcon name="bolt" className="mr-1 text-sm" />
                Streaming on
              </Badge>
            ) : (
              <Badge variant="outline">Streaming off</Badge>
            )}
            {flags?.AI_TOOLS_ENABLED ? (
              <Badge variant="warning">
                <MaterialIcon name="build" className="mr-1 text-sm" />
                Tools available
              </Badge>
            ) : null}
          </div>
        </div>
        <WelcomeBento onSelect={(p) => void onSubmit(p)} disabled={busy} />
      </motion.div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
      <div className="pointer-events-auto">
        <Composer onSubmit={onSubmit} busy={busy} placeholder="Type your creative request…" />
      </div>
    </div>
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
