import { PaperPlaneTilt, Stop } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
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

  // Auto-grow textarea
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
    <form
      onSubmit={handleFormSubmit}
      className="border-t border-border/40 bg-card/20 px-4 py-3 backdrop-blur-xl md:px-6"
    >
      <div
        className={cn(
          'group relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card/60 p-2 shadow-sm transition-all duration-300',
          'focus-within:border-primary/50 focus-within:bg-card/80',
          'focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_0_30px_-6px_hsl(var(--primary)/0.55)]',
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
          className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {busy && onCancel ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onCancel}
            className="rounded-xl text-destructive hover:bg-destructive/10"
          >
            <Stop className="h-5 w-5" weight="bold" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            variant="glow"
            disabled={disabled || busy || !value.trim()}
            className="rounded-xl transition-transform group-focus-within:scale-105"
          >
            <PaperPlaneTilt className="h-4 w-4" weight="duotone" />
          </Button>
        )}
      </div>
      <p className="mt-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        Enter to send · Shift + Enter for newline
      </p>
    </form>
  );
};
