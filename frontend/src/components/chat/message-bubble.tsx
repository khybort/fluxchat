import { motion } from 'framer-motion';
import { useState } from 'react';

import type { Message } from '@/api/types';
import { MaterialIcon } from '@/components/ui/material-icon';
import { copyToClipboard } from '@/lib/clipboard';
import { cn, formatRelativeTime } from '@/lib/utils';

import { MarkdownContent } from './markdown-content';

interface MessageBubbleProps {
  message: Pick<Message, 'role' | 'content' | 'createdAt'>;
  streaming?: boolean;
  onRegenerate?: () => void;
}

export const MessageBubble = ({
  message,
  streaming,
  onRegenerate,
}: MessageBubbleProps): React.JSX.Element => {
  const isUser = message.role === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      {isUser ? (
        <UserBubble message={message} />
      ) : (
        <AssistantBubble message={message} streaming={streaming} onRegenerate={onRegenerate} />
      )}
    </motion.div>
  );
};

const UserBubble = ({
  message,
}: {
  message: Pick<Message, 'role' | 'content' | 'createdAt'>;
}): React.JSX.Element => (
  <div className="flex max-w-[85%] flex-col items-end gap-1">
    <div className="group relative whitespace-pre-wrap break-words rounded-3xl rounded-tr-md border border-white/10 bg-gradient-to-br from-primary-container to-[hsl(var(--inverse-primary))] px-bubble-padding-x py-bubble-padding-y text-sm leading-relaxed text-on-primary-container shadow-[0_10px_40px_hsl(var(--primary-container)/0.3)]">
      {message.content || null}
      {message.content ? (
        <button
          type="button"
          onClick={() => void copyToClipboard(message.content, 'Message copied')}
          aria-label="Copy message"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/15 text-on-primary-container/85 backdrop-blur-sm opacity-0 transition-opacity hover:bg-white/25 hover:text-on-primary-container focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MaterialIcon name="content_copy" className="text-sm" />
        </button>
      ) : null}
    </div>
    {message.createdAt ? (
      <span className="px-1 text-[10px] uppercase tracking-wide text-on-surface-variant">
        {formatRelativeTime(message.createdAt)}
      </span>
    ) : null}
  </div>
);

const AssistantBubble = ({
  message,
  streaming,
  onRegenerate,
}: {
  message: Pick<Message, 'role' | 'content' | 'createdAt'>;
  streaming?: boolean;
  onRegenerate?: () => void;
}): React.JSX.Element => {
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);

  const handleCopy = (): void => {
    if (message.content) void copyToClipboard(message.content, 'Response copied');
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-1">
      <article
        className={cn(
          'rounded-3xl rounded-tl-md border border-white/10 bg-surface-container-high/40 p-8 text-on-surface backdrop-blur-[40px] shadow-[inset_0_0_20px_rgba(255,255,255,0.03)]',
          streaming && 'streaming-caret',
        )}
      >
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary/20 text-tertiary">
            <MaterialIcon name="smart_toy" filled className="text-lg" />
          </span>
          <span className="text-caption font-bold uppercase tracking-widest text-on-surface">
            AppNation AI
          </span>
        </header>

        <div className="prose prose-invert max-w-none text-on-surface-variant">
          {message.content ? (
            <MarkdownContent content={message.content} />
          ) : streaming ? (
            <span className="opacity-60">…</span>
          ) : null}
        </div>

        {!streaming && message.content ? (
          <footer className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
              >
                <MaterialIcon name="content_copy" className="text-base" />
                Copy
              </button>
              {onRegenerate ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
                >
                  <MaterialIcon name="refresh" className="text-base" />
                  Regenerate
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Helpful"
                onClick={() => setReaction((r) => (r === 'up' ? null : 'up'))}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  reaction === 'up'
                    ? 'bg-tertiary/20 text-tertiary'
                    : 'bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface',
                )}
              >
                <MaterialIcon name="thumb_up" filled={reaction === 'up'} className="text-base" />
              </button>
              <button
                type="button"
                aria-label="Not helpful"
                onClick={() => setReaction((r) => (r === 'down' ? null : 'down'))}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  reaction === 'down'
                    ? 'bg-error/20 text-error'
                    : 'bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface',
                )}
              >
                <MaterialIcon
                  name="thumb_down"
                  filled={reaction === 'down'}
                  className="text-base"
                />
              </button>
            </div>
          </footer>
        ) : null}
      </article>

      {message.createdAt ? (
        <span className="px-1 text-[10px] uppercase tracking-wide text-on-surface-variant">
          {formatRelativeTime(message.createdAt)}
        </span>
      ) : null}
    </div>
  );
};
