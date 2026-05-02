import { AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { MaterialIcon } from '@/components/ui/material-icon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

import { ChatListItem } from './chat-sidebar/chat-list-item';
import { EmptyState } from './chat-sidebar/empty-state';
import { useChatList } from './chat-sidebar/use-chat-list';

interface ChatSidebarProps {
  onNavigate?: () => void;
}

export const ChatSidebar = ({ onNavigate }: ChatSidebarProps): React.JSX.Element => {
  const navigate = useNavigate();
  const list = useChatList();
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Chat | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return list.chats;
    const q = query.toLowerCase();
    return list.chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [list.chats, query]);

  const handleNew = (): void => {
    navigate('/chat');
    onNavigate?.();
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
          {list.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : list.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {list.error}
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState query={query} hasChats={list.chats.length > 0} />
          ) : (
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {filtered.map((chat, index) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    index={index}
                    isActive={chat.id === list.activeChatId}
                    pendingDelete={list.pendingDelete === chat.id}
                    onNavigate={onNavigate}
                    onArchive={setConfirmArchive}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}

          {list.hasMore && !list.loading && filtered.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-center text-xs text-muted-foreground"
              onClick={() => void list.loadMore()}
              disabled={list.loadingMore}
            >
              {list.loadingMore ? (
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
          if (confirmDelete) await list.handleDelete(confirmDelete);
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
          if (confirmArchive) await list.handleArchive(confirmArchive);
        }}
      />
    </div>
  );
};
