import * as React from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-on-surface ring-offset-background transition-colors placeholder:text-on-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container/50 focus-visible:border-white/20 disabled:cursor-not-allowed disabled:opacity-50 scrollbar-thin resize-none',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
