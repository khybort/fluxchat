import { create } from 'zustand';

import type { Chat } from '@/api/types';

interface ChatStore {
  /** Bumped whenever a new chat is created so sidebar lists refresh themselves. */
  refreshNonce: number;
  /** Optional optimistic chat to splice into the sidebar before the next refetch. */
  pending: Chat | null;
  notifyChatCreated: (chat: Chat) => void;
  consumePending: () => Chat | null;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  refreshNonce: 0,
  pending: null,
  notifyChatCreated: (chat) =>
    set((state) => ({ refreshNonce: state.refreshNonce + 1, pending: chat })),
  consumePending: () => {
    const { pending } = get();
    if (pending) set({ pending: null });
    return pending;
  },
}));
