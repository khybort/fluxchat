import type { Chat } from '@/api/types';
import { Button } from '@/components/ui/button';
import { MaterialIcon } from '@/components/ui/material-icon';
import { formatRelativeTime } from '@/lib/utils';

interface ArchivedRowProps {
  chat: Chat;
  onRestore: (chat: Chat) => void;
  onRequestDelete: (chat: Chat) => void;
}

export const ArchivedRow = ({
  chat,
  onRestore,
  onRequestDelete,
}: ArchivedRowProps): React.JSX.Element => (
  <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-container/40 p-4 backdrop-blur-md transition-colors hover:bg-surface-container/60">
    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/5 text-on-surface-variant">
      <MaterialIcon name="chat_bubble" className="text-base" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-on-surface">{chat.title}</p>
      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
        Archived {formatRelativeTime(chat.archivedAt ?? chat.updatedAt)}
      </p>
    </div>
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={() => onRestore(chat)}>
        <MaterialIcon name="unarchive" className="text-base" />
        Restore
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onRequestDelete(chat)}
        className="text-error hover:bg-error/10"
        aria-label="Delete permanently"
      >
        <MaterialIcon name="delete" className="text-base" />
      </Button>
    </div>
  </li>
);
