import { create } from 'zustand';

import type { Chat } from '@/api/types';

interface ChatStore {
  /** Bumped whenever the sidebar list needs to re-fetch (create / delete). */
  refreshNonce: number;
  /** Optional optimistic chat to splice into the sidebar before the next refetch. */
  pending: Chat | null;
  notifyChatCreated: (chat: Chat) => void;
  /** Trigger a sidebar refetch — used after a chat is deleted server-side. */
  notifyChatDeleted: () => void;
  consumePending: () => Chat | null;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  refreshNonce: 0,
  pending: null,
  notifyChatCreated: (chat) =>
    set((state) => ({ refreshNonce: state.refreshNonce + 1, pending: chat })),
  notifyChatDeleted: () => set((state) => ({ refreshNonce: state.refreshNonce + 1 })),
  consumePending: () => {
    const { pending } = get();
    if (pending) set({ pending: null });
    return pending;
  },
}));
