import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { MaterialIcon } from '@/components/ui/material-icon';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ComposerProps {
  onSubmit: (message: string) => void | Promise<void>;
  onCancel?: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const Composer = ({
  onSubmit,
  onCancel,
  busy,
  disabled,
  placeholder = 'Send a message…',
}: ComposerProps): React.JSX.Element => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [value]);

  const submit = async (): Promise<void> => {
    const text = value.trim();
    if (!text || busy) return;
    setValue('');
    await onSubmit(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const handleFormSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void submit();
  };

  return (
    <form onSubmit={handleFormSubmit} className="px-4 pb-6 md:px-12 md:pb-8">
      <div className="w-full">
        <div
          className={cn(
            'flex items-end gap-3 rounded-[2.5rem] border border-white/15 bg-surface-container/60 p-3 backdrop-blur-[30px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] transition-shadow',
            'focus-within:border-tertiary/40 focus-within:ring-2 focus-within:ring-tertiary/30',
            disabled && 'opacity-60',
          )}
        >
          <Textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={disabled || busy}
            className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {busy && onCancel ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onCancel}
              className="rounded-full text-error hover:bg-error/10"
            >
              <MaterialIcon name="stop" className="text-xl" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="gradient"
              disabled={disabled || busy || !value.trim()}
              className="h-11 rounded-full px-5"
            >
              <span>Send</span>
              <MaterialIcon name="send" className="text-base" />
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
          AppNation Intelligence can make mistakes · Verify important info
        </p>
      </div>
    </form>
  );
};
