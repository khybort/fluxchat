export type MessageRole = 'user' | 'assistant' | 'system';

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface ListParams {
  cursor: string | undefined;
  limit: number;
}

export interface PageResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}
