import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';

import type { Chat } from '@/api/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MaterialIcon } from '@/components/ui/material-icon';
import { cn, formatRelativeTime } from '@/lib/utils';

interface ChatListItemProps {
  chat: Chat;
  index: number;
  isActive: boolean;
  pendingDelete: boolean;
  onNavigate?: () => void;
  onArchive: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
}

export const ChatListItem = ({
  chat,
  index,
  isActive,
  pendingDelete,
  onNavigate,
  onArchive,
  onDelete,
}: ChatListItemProps): React.JSX.Element => (
  <motion.li
    layout
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ delay: index * 0.02, duration: 0.2 }}
    className="group relative"
  >
    <NavLink
      to={`/chat/${chat.id}`}
      onClick={onNavigate}
      className={({ isActive: routerActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-4 py-3 pr-9 text-left text-sm transition-all',
          'border-l-4 border-transparent text-on-surface-variant hover:bg-white/5 hover:text-on-surface',
          (routerActive || isActive) &&
            'border-primary-container bg-gradient-to-r from-primary-container/20 to-transparent text-on-surface',
        )
      }
    >
      <MaterialIcon name="chat_bubble" className="text-xl flex-none text-primary-container" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight">{chat.title}</span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-on-surface-variant">
          {formatRelativeTime(chat.updatedAt)}
        </span>
      </span>
    </NavLink>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Chat actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cn(
            'absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors hover:bg-accent-foreground/10 hover:text-foreground',
            'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
            'data-[state=open]:opacity-100',
          )}
          disabled={pendingDelete}
        >
          {pendingDelete ? (
            <MaterialIcon name="progress_activity" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MaterialIcon name="more_horiz" className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={() => onArchive(chat)}
          className="focus:bg-tertiary/10 focus:text-tertiary"
        >
          <MaterialIcon name="archive" className="text-base" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDelete(chat)}
          className="text-error focus:bg-error/10 focus:text-error"
        >
          <MaterialIcon name="delete" className="text-base" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </motion.li>
);
