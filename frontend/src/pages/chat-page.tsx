import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveChat, deleteChat } from '@/api/chat';
import { ApiError } from '@/api/client';
import { ChatHeader } from '@/components/chat/chat-header';
import { Composer } from '@/components/chat/composer';
import { ConversationEmpty, HistorySkeleton } from '@/components/chat/conversation-empty';
import { MessageBubble } from '@/components/chat/message-bubble';
import { NewChatPanel } from '@/components/chat/new-chat-panel';
import { StreamingStatus } from '@/components/chat/streaming-status';
import { ToolExecutionCard } from '@/components/chat/tool-execution-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useFlagsStore } from '@/store/flags-store';

export const ChatPage = (): React.JSX.Element => {
  const token = useAuthStore((s) => s.token) ?? '';
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const notifyChatDeleted = useChatStore((s) => s.notifyChatDeleted);
  const flags = useFlagsStore((s) => s.flags);
  const refreshFlags = useFlagsStore((s) => s.refresh);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks the chatId we just minted in `handleSend`. The history loader
  // skips its fetch for that one id so the optimistic state survives the
  // URL change.
  const justCreatedChatIdRef = useRef<string | null>(null);

  const { messages, setMessages, loadingHistory } = useChatHistory(chatId, justCreatedChatIdRef);
  const { pending, busy, cancel, handleSend, handleRegenerate } = useChatStream({
    setMessages,
    justCreatedChatIdRef,
  });

  // Lazy-hydrate the flag store on first mount in case AppShell hasn't finished
  // its own fetch yet (e.g. direct deep-link to a chat URL).
  useEffect(() => {
    if (!flags) void refreshFlags();
  }, [flags, refreshFlags]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, pending?.assistantText, pending?.tools.length, pending?.phase]);

  const handleDeleteCurrent = useCallback(async (): Promise<void> => {
    if (!chatId || !token) return;
    try {
      await deleteChat(token, chatId);
      toast.success('Chat deleted');
      notifyChatDeleted();
      navigate('/chat', { replace: true });
    } catch (err: unknown) {
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
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to archive chat';
      toast.error(message);
    }
  }, [chatId, token, navigate, notifyChatDeleted]);

  if (!chatId) {
    return <NewChatPanel onSubmit={handleSend} busy={busy} flags={flags} />;
  }

  return (
    <div className="relative flex h-full flex-col">
      <ChatHeader
        chatId={chatId}
        messageCount={messages.length}
        flags={flags}
        pendingPhase={pending?.phase ?? null}
        onArchive={() => setConfirmArchive(true)}
        onDelete={() => setConfirmDelete(true)}
      />

      <ScrollArea className="flex-1 mt-4" viewportRef={scrollRef}>
        <div className="w-full space-y-message-gap px-4 pb-40 pt-2 md:px-12">
          {loadingHistory ? (
            <HistorySkeleton />
          ) : (
            <>
              {messages.length === 0 && !pending ? <ConversationEmpty /> : null}

              <AnimatePresence initial={false}>
                {messages.map((m, idx) => {
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
