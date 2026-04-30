import { motion } from 'framer-motion';
import { Robot, User } from '@phosphor-icons/react';

import type { Message } from '@/api/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, formatRelativeTime } from '@/lib/utils';

interface MessageBubbleProps {
  message: Pick<Message, 'role' | 'content' | 'createdAt'>;
  streaming?: boolean;
}

export const MessageBubble = ({ message, streaming }: MessageBubbleProps): React.JSX.Element => {
  const isUser = message.role === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
    >
      <Avatar
        className={cn(
          'h-8 w-8 shrink-0 ring-1',
          isUser
            ? 'bg-primary ring-primary/40'
            : 'bg-gradient-to-br from-brand-from/20 via-brand-via/15 to-brand-to/20 ring-primary/30',
        )}
      >
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-gradient-to-br from-brand-from to-brand-via text-primary-foreground'
              : 'bg-transparent text-primary',
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" weight="duotone" />
          ) : (
            <Robot className="h-4 w-4" weight="duotone" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex max-w-[85%] flex-col gap-1', isUser && 'items-end')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm backdrop-blur',
            isUser
              ? 'rounded-tr-sm bg-gradient-to-br from-brand-from to-brand-via text-primary-foreground shadow-[0_8px_24px_-12px_hsl(var(--brand-via)/0.6)]'
              : 'rounded-tl-sm border border-primary/15 bg-gradient-to-br from-secondary via-secondary to-primary/10 text-secondary-foreground',
            streaming && 'streaming-caret',
          )}
        >
          {message.content || (streaming ? <span className="opacity-60">…</span> : null)}
        </div>
        {message.createdAt ? (
          <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {formatRelativeTime(message.createdAt)}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
};
