import { MaterialIcon } from '@/components/ui/material-icon';

interface EmptyStateProps {
  query: string;
  hasChats: boolean;
}

export const EmptyState = ({ query, hasChats }: EmptyStateProps): React.JSX.Element => (
  <div className="flex flex-col items-center justify-center gap-2 px-2 py-10 text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
      <MaterialIcon name="chat_bubble" className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="text-sm font-medium">{hasChats && query ? 'No matches' : 'No chats yet'}</p>
    <p className="text-xs text-muted-foreground">
      {hasChats && query
        ? 'Try a different search term.'
        : 'Send your first message to get started.'}
    </p>
  </div>
);
